"""
CSV parsing + normalization primitives.

Everything here is NON-DESTRUCTIVE bookkeeping: each helper returns both the
normalized value and a list of `events` describing what it had to fix, so the
detector pipeline can turn every fix into a reported anomaly. Nothing is ever
silently corrected — a fix without an event is a bug.

Event shape: (event_kind, {details}) where event_kind matches an AnomalyType
where applicable.
"""

import csv
import io
import re
from datetime import date, datetime
from decimal import Decimal, InvalidOperation

from expenses.splits import round_money

EXPECTED_COLUMNS = [
    "date", "description", "paid_by", "amount", "currency",
    "split_type", "split_with", "split_details", "notes",
]

# Words ignored when comparing descriptions for duplicates
# ("Dinner at Marina Bites" vs "dinner - marina bites").
_STOPWORDS = {"at", "the", "a", "an", "in", "-", "–"}


def read_csv(file_bytes: bytes) -> list[dict]:
    """Parse the upload into raw row dicts, values exactly as they appear."""
    text = file_bytes.decode("utf-8-sig")
    reader = csv.DictReader(io.StringIO(text))
    missing = [c for c in EXPECTED_COLUMNS if c not in (reader.fieldnames or [])]
    if missing:
        raise ValueError(f"CSV is missing expected columns: {missing}")
    return [dict(row) for row in reader]


def parse_amount(raw: str):
    """
    -> (Decimal | None, events)
    Handles: thousands separators ("1,200"), >2dp precision (899.995 -> 900.00).
    Zero and negative values parse fine; classifying them is the detectors' job.
    """
    events = []
    cleaned = (raw or "").strip()
    if cleaned == "":
        return None, [("EMPTY_AMOUNT", {"raw": raw})]
    if "," in cleaned:
        cleaned = cleaned.replace(",", "")
        events.append(("THOUSANDS_SEPARATOR", {"raw": raw, "normalized": cleaned}))
    try:
        value = Decimal(cleaned)
    except InvalidOperation:
        return None, [("UNPARSEABLE_AMOUNT", {"raw": raw})]
    if -value.as_tuple().exponent > 2:
        rounded = round_money(value)
        events.append(
            ("SUB_UNIT_PRECISION", {"raw": raw, "normalized": str(rounded)})
        )
        value = rounded
    return value, events


# "3/22/2026" — the format every unambiguous row uses.
_MDY = re.compile(r"^(\d{1,2})/(\d{1,2})/(\d{4})$")
# "Mar-14" — month name, no year.
_MON_DD = re.compile(r"^([A-Za-z]{3})-(\d{1,2})$")


def parse_date(raw: str, default_year: int = 2026):
    """
    -> (parsed: date | None, alt: date | None, events)

    `parsed` is the literal M/D/YYYY reading. `alt` is the D/M/YYYY reading when
    it is also a valid calendar date AND differs — the signal the detectors use
    for the "5/4/2026: April 5 or May 4?" ambiguity. "Mar-14" gets its year
    inferred (event emitted; the file is single-year data).
    """
    events = []
    cleaned = (raw or "").strip()
    m = _MDY.match(cleaned)
    if m:
        mm, dd, yyyy = int(m.group(1)), int(m.group(2)), int(m.group(3))
        try:
            parsed = date(yyyy, mm, dd)
        except ValueError:
            return None, None, [("UNPARSEABLE_DATE", {"raw": raw})]
        alt = None
        if mm != dd:
            try:
                alt = date(yyyy, dd, mm)  # the swapped reading, if it exists
            except ValueError:
                alt = None
        return parsed, alt, events

    m = _MON_DD.match(cleaned)
    if m:
        try:
            parsed = datetime.strptime(
                f"{m.group(1)}-{m.group(2)}-{default_year}", "%b-%d-%Y"
            ).date()
        except ValueError:
            return None, None, [("UNPARSEABLE_DATE", {"raw": raw})]
        events.append(
            ("AMBIGUOUS_DATE", {
                "raw": raw,
                "normalized": parsed.isoformat(),
                "reason": f"no year in source; inferred {default_year} from the rest of the file",
                "auto": True,
            })
        )
        return parsed, None, events

    return None, None, [("UNPARSEABLE_DATE", {"raw": raw})]


# "Dev's friend Kabir" -> "Kabir": strip a possessive-friend prefix.
_FRIEND_PREFIX = re.compile(r"^.*'s\s+friend\s+", re.IGNORECASE)


def normalize_person_name(raw: str, roster: list[str]):
    """
    -> (canonical_or_cleaned_name: str | None, kind, events)

    kind: 'exact'     — matches a roster name as-is
          'fixed'     — matched after trim/case-fold ("priya", "rohan ")
          'alias'     — token-prefix match ("Priya S" -> Priya), needs approval
          'unknown'   — not in roster (guest candidate), needs approval
          'empty'     — blank cell
    """
    events = []
    cleaned = (raw or "").strip()
    if cleaned == "":
        return None, "empty", events

    cleaned = _FRIEND_PREFIX.sub("", cleaned)
    if cleaned != (raw or "").strip():
        events.append(("NAME_NORMALIZATION", {"raw": raw, "normalized": cleaned}))

    if cleaned in roster:
        return cleaned, "exact", events

    by_fold = {name.casefold(): name for name in roster}
    if cleaned.casefold() in by_fold:
        canonical = by_fold[cleaned.casefold()]
        events.append(("NAME_NORMALIZATION", {"raw": raw, "normalized": canonical}))
        return canonical, "fixed", events

    # "Priya S" -> first token matches a roster name exactly: alias CANDIDATE
    # only — could genuinely be a different person, so approval is required.
    first_token = cleaned.split()[0]
    if first_token.casefold() in by_fold:
        return by_fold[first_token.casefold()], "alias", events

    # Title-case the cleaned name for guest creation consistency.
    return cleaned[0].upper() + cleaned[1:] if cleaned else cleaned, "unknown", events


def parse_participants(raw: str) -> list[str]:
    return [p.strip() for p in (raw or "").split(";") if p.strip()]


def parse_split_details(raw: str):
    """
    'Rohan 700; Priya 400' / 'Aisha 30%; ...' / 'Aisha 1; Rohan 2'
    -> ({name: Decimal}, events). Percent signs are stripped; the split_type
    column says how to interpret the numbers.
    """
    cleaned = (raw or "").strip()
    if not cleaned:
        return None, []
    details = {}
    for part in cleaned.split(";"):
        part = part.strip()
        if not part:
            continue
        pieces = part.rsplit(" ", 1)
        if len(pieces) != 2:
            return None, [("UNPARSEABLE_SPLIT_DETAILS", {"raw": raw, "part": part})]
        name, value = pieces[0].strip(), pieces[1].strip().rstrip("%")
        try:
            details[name] = Decimal(value)
        except InvalidOperation:
            return None, [("UNPARSEABLE_SPLIT_DETAILS", {"raw": raw, "part": part})]
    return details, []


def description_key(desc: str) -> frozenset:
    """Token-set fingerprint for duplicate detection: lowercase, strip
    punctuation, drop stopwords. 'Dinner at Thalassa' == 'Thalassa dinner'."""
    tokens = re.findall(r"[a-z0-9]+", (desc or "").lower())
    return frozenset(t for t in tokens if t not in _STOPWORDS)
