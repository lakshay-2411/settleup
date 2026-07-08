"""
Import pipeline, stage 1: turn raw CSV rows into normalized, JSON-safe row
records. Every row keeps its 1-indexed position, its raw cells, the parsed
values, and the normalization events emitted while parsing — the detector
stage consumes those events; nothing is fixed silently.

Row record shape (stored in ImportBatch.rows_json):
{
  "row": 3,
  "raw": {...cells exactly as uploaded...},
  "parsed": {
     "date": "2026-02-05" | null,
     "date_alt": "2026-05-04" | null,     # swapped D/M reading if valid & different
     "description": str,
     "payer": str | null,                  # canonical roster name / cleaned guest name
     "payer_kind": "exact|fixed|alias|unknown|empty",
     "amount": "1200.00" | null,
     "currency": "INR" | "" ,
     "split_type": "equal|unequal|percentage|share|"",
     "participants": [{"name": str, "kind": str, "raw": str}, ...],
     "split_details": {name: "700"} | null,
     "notes": str
  },
  "events": [[kind, {...}], ...],
  # Filled by the detector stage (defaults here):
  "action": "expense",        # expense | settlement | skip
  "status": "active",         # expense status if imported
  "is_refund": false,
  "anomalies": []             # indexes into the batch's anomaly list
}
"""

from .parsing import (
    normalize_person_name,
    parse_amount,
    parse_date,
    parse_participants,
    parse_split_details,
    read_csv,
)


def build_rows(file_bytes: bytes, roster: list[str]) -> list[dict]:
    raw_rows = read_csv(file_bytes)
    rows = []
    for i, raw in enumerate(raw_rows, start=1):
        events = []

        amount, ev = parse_amount(raw.get("amount", ""))
        events += ev

        parsed_date, alt_date, ev = parse_date(raw.get("date", ""))
        events += ev

        payer, payer_kind, ev = normalize_person_name(raw.get("paid_by", ""), roster)
        events += ev

        participants = []
        for raw_name in parse_participants(raw.get("split_with", "")):
            name, kind, ev = normalize_person_name(raw_name, roster)
            events += ev
            participants.append({"name": name, "kind": kind, "raw": raw_name})

        details, ev = parse_split_details(raw.get("split_details", ""))
        events += ev

        rows.append(
            {
                "row": i,
                "raw": raw,
                "parsed": {
                    "date": parsed_date.isoformat() if parsed_date else None,
                    "date_alt": alt_date.isoformat() if alt_date else None,
                    "description": (raw.get("description") or "").strip(),
                    "payer": payer,
                    "payer_kind": payer_kind,
                    "amount": str(amount) if amount is not None else None,
                    "currency": (raw.get("currency") or "").strip().upper(),
                    "split_type": (raw.get("split_type") or "").strip().lower(),
                    "participants": participants,
                    "split_details": {k: str(v) for k, v in details.items()} if details else None,
                    "notes": (raw.get("notes") or "").strip(),
                },
                "events": [[kind, data] for kind, data in events],
                "action": "expense",
                "status": "active",
                "is_refund": False,
                "anomalies": [],
            }
        )
    return rows
