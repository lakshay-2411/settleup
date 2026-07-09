"""
Import pipeline, stage 2: anomaly detection.

Every deliberate data problem in the export maps to one detector below. Each
detector appends anomaly dicts (JSON-safe, ready to become ImportAnomaly rows)
and may adjust a row's proposed action/status. Three rules, from the spec:

  1. Detect — nothing crashes; every oddity becomes an anomaly record.
  2. Surface — every anomaly is reported, even trivially auto-fixed ones.
  3. Policy — non-destructive fixes are AUTO_APPLIED; anything destructive or
     interpretive (delete, merge, reclassify, re-split, guess) is
     PENDING_APPROVAL and does nothing until the user decides.

Anomaly dict fields mirror ImportAnomaly. `after_json` carries both the
human-readable proposal and the machine keys the commit stage executes.
"""

from collections import defaultdict
from datetime import date
from decimal import Decimal

from .parsing import description_key

AUTO = "auto_applied"
PENDING = "pending_approval"


def _anomaly(rows_affected, atype, severity, status, description, policy, before=None, after=None):
    return {
        "anomaly_type": atype,
        "severity": severity,
        "status": status,
        "source_row_numbers": rows_affected,
        "description": description,
        "policy": policy,
        "before_json": before,
        "after_json": after,
    }


def _tag(row, anomaly_index):
    row["anomalies"].append(anomaly_index)


def run_detectors(rows: list[dict], group) -> list[dict]:
    """Run every detector in a deliberate order; returns the anomaly list."""
    anomalies = []
    ctx = {
        "rows": rows,
        "anomalies": anomalies,
        # roster windows: name -> (joined_on, left_on)
        "windows": {
            m.person.name: (m.joined_on, m.left_on)
            for m in group.memberships.select_related("person")
        },
    }

    # Order matters: classification first (settlement rows must not trip
    # expense-only checks), then per-row data checks, then cross-row checks.
    _promote_parse_events(ctx)
    _settlement_as_expense(ctx)
    _zero_amount(ctx)
    _negative_refund(ctx)
    _foreign_and_missing_currency(ctx)
    _missing_payer(ctx)
    _percentage_sum(ctx)
    _splittype_detail_mismatch(ctx)
    _ambiguous_dates(ctx)
    _out_of_order(ctx)
    _duplicates(ctx)
    _unknown_people(ctx)
    _alias_names(ctx)
    _departed_members(ctx)
    return anomalies


# --- stage helpers -----------------------------------------------------------

def _promote_parse_events(ctx):
    """Normalization performed during parsing becomes visible anomalies."""
    rows, anomalies = ctx["rows"], ctx["anomalies"]

    # Group identical name fixes ("priya" -> Priya) across rows into one entry.
    name_fixes = defaultdict(list)
    for row in rows:
        for kind, data in row["events"]:
            if kind == "THOUSANDS_SEPARATOR":
                anomalies.append(_anomaly(
                    [row["row"]], "THOUSANDS_SEPARATOR", "info", AUTO,
                    f"Amount {data['raw']!r} contains a thousands separator.",
                    "Strip the separator; value unchanged in meaning.",
                    before={"amount": data["raw"]}, after={"amount": data["normalized"]},
                ))
                _tag(row, len(anomalies) - 1)
            elif kind == "SUB_UNIT_PRECISION":
                anomalies.append(_anomaly(
                    [row["row"]], "SUB_UNIT_PRECISION", "info", AUTO,
                    f"Amount {data['raw']!r} has more than 2 decimal places.",
                    "Round half-up to 2 dp (the app-wide rounding rule).",
                    before={"amount": data["raw"]}, after={"amount": data["normalized"]},
                ))
                _tag(row, len(anomalies) - 1)
            elif kind == "NAME_NORMALIZATION":
                name_fixes[(data["raw"], data["normalized"])].append(row["row"])
            elif kind == "AMBIGUOUS_DATE" and data.get("auto"):
                anomalies.append(_anomaly(
                    [row["row"]], "AMBIGUOUS_DATE", "info", AUTO,
                    f"Date {data['raw']!r} has no year.",
                    data["reason"].capitalize() + ".",
                    before={"date": data["raw"]}, after={"date": data["normalized"]},
                ))
                _tag(row, len(anomalies) - 1)
            elif kind in ("EMPTY_AMOUNT", "UNPARSEABLE_AMOUNT", "UNPARSEABLE_DATE",
                          "UNPARSEABLE_SPLIT_DETAILS"):
                row["status"] = "needs_input"
                anomalies.append(_anomaly(
                    [row["row"]], "ZERO_AMOUNT" if kind == "EMPTY_AMOUNT" else "AMBIGUOUS_DATE",
                    "blocking", PENDING,
                    f"Row {row['row']}: {kind.replace('_', ' ').lower()} ({data.get('raw')!r}).",
                    "Hold the row out of balances until the value is supplied.",
                    before=data, after=None,
                ))
                _tag(row, len(anomalies) - 1)

    for (raw, normalized), row_nums in sorted(name_fixes.items(), key=lambda kv: kv[1]):
        anomalies.append(_anomaly(
            row_nums, "NAME_NORMALIZATION", "info", AUTO,
            f"Name {raw!r} normalized to {normalized!r} (trim/case/prefix cleanup).",
            "Canonicalize spelling; identity unchanged.",
            before={"name": raw}, after={"name": normalized},
        ))
        for row in ctx["rows"]:
            if row["row"] in row_nums:
                _tag(row, len(anomalies) - 1)


def _settlement_as_expense(ctx):
    """A 'payment back' logged as an expense: empty split_type, or a single
    counterparty who isn't the payer ('Rohan paid Aisha back', 'Sam deposit')."""
    for row in ctx["rows"]:
        p = row["parsed"]
        names = [x["name"] for x in p["participants"]]
        single_counterparty = len(names) == 1 and p["payer"] and names[0] != p["payer"]
        if p["split_type"] == "" and single_counterparty or (
            p["split_type"] and single_counterparty and _payment_words(p)
        ):
            row["action"] = "settlement"
            ctx["anomalies"].append(_anomaly(
                [row["row"]], "SETTLEMENT_AS_EXPENSE", "warning", PENDING,
                f"Row {row['row']} ({p['description']!r}) looks like a payment from "
                f"{p['payer']} to {names[0]}, not a shared expense"
                + (" (split_type is empty)." if p["split_type"] == "" else "."),
                "Reclassify as a settlement so it reduces debt instead of creating "
                "shares. Rejecting imports it as a two-person expense instead.",
                before={"kind": "expense", "split_type": p["split_type"]},
                after={"kind": "settlement", "from": p["payer"], "to": names[0],
                       "amount": p["amount"]},
            ))
            _tag(row, len(ctx["anomalies"]) - 1)


def _payment_words(p):
    text = f"{p['description']} {p['notes']}".lower()
    return any(w in text for w in ("paid", "deposit", "settle", "repay", "back"))


def _zero_amount(ctx):
    for row in ctx["rows"]:
        amt = row["parsed"]["amount"]
        if amt is not None and Decimal(amt) == 0 and row["action"] == "expense":
            row["status"] = "void"
            ctx["anomalies"].append(_anomaly(
                [row["row"]], "ZERO_AMOUNT", "warning", AUTO,
                f"Row {row['row']} ({row['parsed']['description']!r}) has amount 0"
                + (f" — note says {row['parsed']['notes']!r}." if row["parsed"]["notes"] else "."),
                "Import as VOID: visible for audit, excluded from all balances.",
                before={"amount": "0"}, after={"status": "void"},
            ))
            _tag(row, len(ctx["anomalies"]) - 1)


def _negative_refund(ctx):
    for row in ctx["rows"]:
        amt = row["parsed"]["amount"]
        if amt is not None and Decimal(amt) < 0:
            row["is_refund"] = True
            ctx["anomalies"].append(_anomaly(
                [row["row"]], "NEGATIVE_AMOUNT_REFUND", "warning", AUTO,
                f"Row {row['row']} ({row['parsed']['description']!r}) has a negative "
                f"amount ({amt}). Context (description/notes) marks this as a refund, "
                "not a data error.",
                "Treat as an intentional refund: negative shares flow back to the "
                "same participants, reversing part of the original cost.",
                before={"amount": amt}, after={"is_refund": True},
            ))
            _tag(row, len(ctx["anomalies"]) - 1)


def _foreign_and_missing_currency(ctx):
    fx_rows = []
    for row in ctx["rows"]:
        cur = row["parsed"]["currency"]
        if cur == "":
            row["status"] = "pending_approval"
            ctx["anomalies"].append(_anomaly(
                [row["row"]], "MISSING_CURRENCY", "warning", PENDING,
                f"Row {row['row']} ({row['parsed']['description']!r}) has no currency"
                + (f" — note: {row['parsed']['notes']!r}." if row["parsed"]["notes"] else "."),
                "Propose INR (the group's base currency and the pattern of every "
                "similar row) — but never assume silently: requires approval.",
                before={"currency": ""}, after={"currency": "INR"},
            ))
            _tag(row, len(ctx["anomalies"]) - 1)
        elif cur != "INR":
            fx_rows.append(row)

    if fx_rows:
        ctx["anomalies"].append(_anomaly(
            [r["row"] for r in fx_rows], "FOREIGN_CURRENCY", "info", AUTO,
            f"{len(fx_rows)} rows are in a foreign currency "
            f"({', '.join(sorted({r['parsed']['currency'] for r in fx_rows}))}). "
            "A dollar is not a rupee.",
            "Convert to INR at the documented fixed rate (1 USD = 83.00 INR), "
            "storing the original amount, currency, and rate on every row.",
            before={"currencies": sorted({r["parsed"]["currency"] for r in fx_rows})},
            after={"conversion": "amount × 83.00 → INR, original preserved"},
        ))
        for r in fx_rows:
            _tag(r, len(ctx["anomalies"]) - 1)


def _missing_payer(ctx):
    for row in ctx["rows"]:
        if row["action"] == "expense" and row["parsed"]["payer_kind"] == "empty":
            row["status"] = "needs_input"
            candidates = [x["name"] for x in row["parsed"]["participants"]]
            ctx["anomalies"].append(_anomaly(
                [row["row"]], "MISSING_PAYER", "blocking", PENDING,
                f"Row {row['row']} ({row['parsed']['description']!r}) has no payer"
                + (f" — note: {row['parsed']['notes']!r}." if row["parsed"]["notes"] else "."),
                "Cannot guess who paid. Import held as NEEDS_INPUT (excluded from "
                "balances) until a payer is supplied in the review step.",
                before={"paid_by": ""}, after={"candidates": candidates},
            ))
            _tag(row, len(ctx["anomalies"]) - 1)


def _percentage_sum(ctx):
    for row in ctx["rows"]:
        p = row["parsed"]
        if p["split_type"] != "percentage" or not p["split_details"]:
            continue
        total = sum(Decimal(v) for v in p["split_details"].values())
        if total != Decimal("100"):
            row["status"] = "pending_approval"
            ctx["anomalies"].append(_anomaly(
                [row["row"]], "PERCENTAGE_SUM_INVALID", "blocking", PENDING,
                f"Row {row['row']} ({p['description']!r}): percentages sum to {total}, "
                "not 100.",
                "Never silently rescale. Approving normalizes proportionally "
                "(percentages treated as weights); or supply corrected percentages "
                "in the resolution.",
                before={"percentages": p["split_details"], "sum": str(total)},
                after={"normalize_as_weights": True},
            ))
            _tag(row, len(ctx["anomalies"]) - 1)


def _splittype_detail_mismatch(ctx):
    for row in ctx["rows"]:
        p = row["parsed"]
        if p["split_type"] == "equal" and p["split_details"]:
            ctx["anomalies"].append(_anomaly(
                [row["row"]], "SPLITTYPE_DETAIL_MISMATCH", "warning", AUTO,
                f"Row {row['row']} ({p['description']!r}): split_type is 'equal' but "
                f"share weights were also entered ({row['raw'].get('split_details')!r}).",
                "split_type is the source of truth: split equally, ignore the stray "
                "weights (which here agree with an equal split anyway).",
                before={"split_type": "equal", "split_details": p["split_details"]},
                after={"split_details": None},
            ))
            _tag(row, len(ctx["anomalies"]) - 1)
            p["split_details"] = None  # follow split_type


def _ambiguous_dates(ctx):
    """Literal M/D reading that breaks file order where the swapped D/M reading
    fits better: '5/4/2026' between 3/28 and 4/1 rows -> propose April 5."""
    rows = ctx["rows"]
    dates = [date.fromisoformat(r["parsed"]["date"]) if r["parsed"]["date"] else None
             for r in rows]

    def violations(idx, candidate):
        window = 5
        count = 0
        for j in range(max(0, idx - window), min(len(rows), idx + window + 1)):
            if j == idx or dates[j] is None:
                continue
            if j < idx and dates[j] > candidate:
                count += 1
            if j > idx and dates[j] < candidate:
                count += 1
        return count

    for i, row in enumerate(rows):
        p = row["parsed"]
        if not p["date"] or not p["date_alt"]:
            continue
        literal = date.fromisoformat(p["date"])
        alt = date.fromisoformat(p["date_alt"])
        v_lit, v_alt = violations(i, literal), violations(i, alt)
        if v_lit > 0 and v_alt < v_lit:
            row["status"] = "pending_approval"
            ctx["anomalies"].append(_anomaly(
                [row["row"]], "AMBIGUOUS_DATE", "warning", PENDING,
                f"Row {row['row']} ({p['description']!r}): {row['raw']['date']!r} read "
                f"as {literal} sits out of order in the file ({v_lit} neighbors "
                f"contradict it); read day-first as {alt} it fits ({v_alt}).",
                f"Propose {alt} (fits the file's ordering); approving uses it, "
                f"rejecting keeps the literal {literal}. Notes flag the same doubt.",
                before={"date": str(literal)}, after={"date": str(alt)},
            ))
            _tag(row, len(ctx["anomalies"]) - 1)


def _out_of_order(ctx):
    rows = ctx["rows"]
    seq = [(r["row"], date.fromisoformat(r["parsed"]["date"]))
           for r in rows if r["parsed"]["date"]]
    # A row is out of order if it is dated later than the row that follows it.
    bad = [row_num for (row_num, d), (_, next_d) in zip(seq, seq[1:]) if d > next_d]
    if bad:
        ctx["anomalies"].append(_anomaly(
            bad, "OUT_OF_ORDER_ROW", "info", AUTO,
            "File order does not match date order around row(s) "
            f"{', '.join(map(str, bad))}.",
            "Cosmetic only: the app displays expenses sorted by resolved date.",
            before=None, after=None,
        ))


def _duplicates(ctx):
    """Same date + same description fingerprint. Identical row -> EXACT
    (keep first). Different amount/payer -> CONFLICTING (user picks winner;
    default: the later entry, matching the note 'I think hers is wrong')."""
    buckets = defaultdict(list)
    for row in ctx["rows"]:
        p = row["parsed"]
        if row["action"] != "expense" or not p["date"]:
            continue
        buckets[(p["date"], description_key(p["description"]))].append(row)

    for (_, _key), group_rows in buckets.items():
        if len(group_rows) < 2:
            continue
        first, second = group_rows[0], group_rows[1]
        fp, sp = first["parsed"], second["parsed"]
        identical = (
            fp["amount"] == sp["amount"]
            and fp["payer"] == sp["payer"]
            and {x["name"] for x in fp["participants"]} == {x["name"] for x in sp["participants"]}
        )
        row_nums = [r["row"] for r in group_rows]
        if identical:
            second["status"] = "pending_approval"
            ctx["anomalies"].append(_anomaly(
                row_nums, "EXACT_DUPLICATE", "warning", PENDING,
                f"Rows {row_nums[0]} and {row_nums[1]} are the same expense logged "
                f"twice ({fp['description']!r} / {sp['description']!r}: same date, "
                "payer, amount, participants).",
                "Keep the first, mark the second SUPERSEDED (visible, excluded from "
                "balances). Approval required before anything is dropped.",
                before={"keep": row_nums[0], "duplicate": row_nums[1]},
                after={"superseded_row": row_nums[1], "kept_row": row_nums[0]},
            ))
            _tag(second, len(ctx["anomalies"]) - 1)
            _tag(first, len(ctx["anomalies"]) - 1)
        else:
            first["status"] = "pending_approval"
            second["status"] = "pending_approval"
            ctx["anomalies"].append(_anomaly(
                row_nums, "CONFLICTING_DUPLICATE", "warning", PENDING,
                f"Rows {row_nums[0]} and {row_nums[1]} describe the same event with "
                f"different data: {fp['payer']} {fp['amount']} vs {sp['payer']} "
                f"{sp['amount']}. A note on row {row_nums[1]} says the earlier entry "
                "is wrong.",
                f"Propose keeping row {row_nums[1]} (the later, corrected entry) and "
                f"superseding row {row_nums[0]}. Rejecting keeps BOTH as real "
                "expenses.",
                before={"rows": row_nums},
                after={"kept_row": row_nums[1], "superseded_row": row_nums[0]},
            ))
            _tag(first, len(ctx["anomalies"]) - 1)
            _tag(second, len(ctx["anomalies"]) - 1)


def _unknown_people(ctx):
    """Names outside the roster (Dev, Kabir): propose guest membership covering
    exactly the dates they appear, so trip math works without polluting the flat."""
    appearances = defaultdict(list)  # name -> [(row_num, date)]
    for row in ctx["rows"]:
        p = row["parsed"]
        d = p["date"]
        if p["payer_kind"] == "unknown":
            appearances[p["payer"]].append((row["row"], d))
        for part in p["participants"]:
            if part["kind"] == "unknown":
                appearances[part["name"]].append((row["row"], d))

    for name, occ in sorted(appearances.items()):
        row_nums = sorted({r for r, _ in occ})
        dates = sorted(d for _, d in occ if d)
        window = [dates[0], dates[-1]] if dates else [None, None]
        ctx["anomalies"].append(_anomaly(
            row_nums, "NON_MEMBER_PARTICIPANT", "warning", PENDING,
            f"{name!r} appears on row(s) {row_nums} but is not in the group roster.",
            f"Create {name!r} as a GUEST member active {window[0]} → {window[1]} so "
            "their shares are theirs alone. Rejecting removes them from those splits "
            "and re-divides among the remaining participants.",
            before={"name": name, "in_roster": False},
            after={"create_guest": name, "window": window},
        ))
        for row in ctx["rows"]:
            if row["row"] in row_nums:
                _tag(row, len(ctx["anomalies"]) - 1)


def _alias_names(ctx):
    """'Priya S' prefix-matches Priya but is not exact: might be the same person,
    might not. Never merge identities without approval."""
    aliases = defaultdict(list)  # (raw, canonical) -> rows
    for row in ctx["rows"]:
        p = row["parsed"]
        if p["payer_kind"] == "alias":
            aliases[(row["raw"].get("paid_by", "").strip(), p["payer"])].append(row["row"])
        for part in p["participants"]:
            if part["kind"] == "alias":
                aliases[(part["raw"], part["name"])].append(row["row"])

    for (raw, canonical), row_nums in sorted(aliases.items(), key=lambda kv: kv[1]):
        ctx["anomalies"].append(_anomaly(
            row_nums, "NAME_ALIAS_AMBIGUOUS", "warning", PENDING,
            f"{raw!r} (row {row_nums}) looks like {canonical!r} with a surname "
            "initial — but could be a different person.",
            f"Propose treating {raw!r} as {canonical!r}. Rejecting creates a "
            f"separate guest named {raw!r} instead.",
            before={"name": raw}, after={"alias_of": canonical},
        ))
        for row in ctx["rows"]:
            if row["row"] in row_nums:
                _tag(row, len(ctx["anomalies"]) - 1)


def departed_member_anomalies(rows, windows):
    """
    Core of the window check, shared by the initial run and re-analysis:
    for every expense row, flag participants whose membership window does not
    cover the expense date. Pure: rows + {name: (joined, left)} in, list of
    (row, anomaly_dict) out.
    """
    found = []
    for row in rows:
        p = row["parsed"]
        if row["action"] != "expense" or not p["date"]:
            continue
        d = date.fromisoformat(p["date"])
        stale = []
        for part in p["participants"]:
            win = windows.get(part["name"])
            if win is None:
                continue  # people with no window are handled by _unknown_people
            joined, left = win
            if d < joined or (left is not None and d > left):
                stale.append(part["name"])
        if stale:
            remaining = [x["name"] for x in p["participants"] if x["name"] not in stale]
            found.append((row, _anomaly(
                [row["row"]], "DEPARTED_MEMBER_IN_SPLIT", "warning", PENDING,
                f"Row {row['row']} ({p['description']!r}, {p['date']}) includes "
                f"{', '.join(stale)}, whose membership does not cover that date"
                + (f" — note: {p['notes']!r}." if p["notes"] else "."),
                f"Drop {', '.join(stale)} and re-split among the members active on "
                f"the date ({', '.join(remaining)}). Rejecting keeps the split as "
                "listed in the file.",
                before={"participants": [x["name"] for x in p["participants"]]},
                after={"participants": remaining, "dropped": stale},
            )))
    return found


def _departed_members(ctx):
    """A split that includes someone whose membership window doesn't cover the
    expense date (Meera listed on an April expense after leaving in March)."""
    for row, anomaly in departed_member_anomalies(ctx["rows"], ctx["windows"]):
        row["status"] = "pending_approval"
        ctx["anomalies"].append(anomaly)
        _tag(row, len(ctx["anomalies"]) - 1)


def resolved_person_windows(batch):
    """
    Membership windows supplied during the review step: for every APPROVED
    unknown-person anomaly, the user's resolution (role + joined/left dates)
    or, failing that, the default appearance-span window.
    """
    windows = {}
    for a in batch.anomalies.filter(
        anomaly_type="NON_MEMBER_PARTICIPANT", status="approved"
    ):
        name = a.after_json["create_guest"]
        res = a.resolution_json or {}
        default = a.after_json.get("window") or [None, None]
        joined = res.get("joined_on") or default[0]
        # left_on is meaningful even when null ("member, still here"), so only
        # fall back to the default when the key is absent entirely.
        left = res["left_on"] if "left_on" in res else default[1]
        if joined is None:
            continue  # no dated appearances and no user input: nothing to check
        windows[name] = (
            date.fromisoformat(joined),
            date.fromisoformat(left) if left else None,
        )
    return windows


def reanalyze_departed(batch, group):
    """
    Phase-2 re-check: once every people decision is in, run the window check
    again with roster windows + the windows the user just supplied. Returns
    only anomalies not already recorded on the batch (idempotent).
    """
    windows = {
        m.person.name: (m.joined_on, m.left_on)
        for m in group.memberships.select_related("person")
    }
    windows.update(resolved_person_windows(batch))

    existing = {
        (a.anomaly_type, tuple(a.source_row_numbers)) for a in batch.anomalies.all()
    }
    return [
        anomaly
        for _row, anomaly in departed_member_anomalies(batch.rows_json, windows)
        if (anomaly["anomaly_type"], tuple(anomaly["source_row_numbers"])) not in existing
    ]
