"""
Import pipeline, stage 3: apply the user's decisions and write real records.

Nothing reaches Expense/Settlement/Person tables until this runs, and it only
runs when every PENDING anomaly has been decided (approve/reject) — the
approval gate the group asked for ("I want to approve anything the app deletes
or changes"). Rejected proposals are honored in the direction that preserves
the file as written.

Every row ends in exactly one outcome, recorded for the report:
  expense_active / expense_needs_input / expense_void / expense_superseded /
  settlement / skipped
"""

from datetime import date as date_cls
from decimal import Decimal

from django.db import transaction

from expenses.models import Expense, ExpenseStatus, Settlement
from expenses.services import convert_to_inr, create_expense
from groups.models import Membership, Person

from .models import AnomalyStatus, BatchStatus


class CommitBlocked(Exception):
    """Raised when the batch still has undecided anomalies."""


def _decided(anomaly):
    return anomaly.status in (AnomalyStatus.APPROVED, AnomalyStatus.REJECTED)


@transaction.atomic
def commit_batch(batch, user):
    group = batch.group
    anomalies = list(batch.anomalies.all())

    undecided = [a for a in anomalies if a.status == AnomalyStatus.PENDING_APPROVAL]
    if undecided:
        raise CommitBlocked(
            f"{len(undecided)} anomalies still await a decision: "
            + ", ".join(f"#{a.id} {a.anomaly_type}" for a in undecided)
        )

    rows = {r["row"]: r for r in batch.rows_json}
    # Working state per row, mutated by decisions below.
    state = {
        n: {
            "action": r["action"],
            "status": r["status"] if r["status"] != "pending_approval" else "active",
            "is_refund": r["is_refund"],
            "date": r["parsed"]["date"],
            "currency": r["parsed"]["currency"] or None,
            "payer": r["parsed"]["payer"],
            "participants": [p["name"] for p in r["parsed"]["participants"]],
            "split_type": r["parsed"]["split_type"],
            "split_details": r["parsed"]["split_details"],
            "hold_reason": None,
        }
        for n, r in rows.items()
    }

    excluded_people = set()   # rejected guests: drop from splits
    alias_remaps = {}         # raw name -> newly created separate person name

    # --- People first: guests and alias decisions create/select Person rows ---
    people = {m.person.name: m.person for m in group.memberships.select_related("person")}

    for a in anomalies:
        if a.anomaly_type == "NON_MEMBER_PARTICIPANT" and _decided(a):
            name = a.after_json["create_guest"]
            if a.status == AnomalyStatus.APPROVED:
                window = a.after_json["window"]
                person, _ = Person.objects.get_or_create(
                    name=name, defaults={"is_guest": True}
                )
                Membership.objects.get_or_create(
                    group=group,
                    person=person,
                    defaults={
                        "joined_on": date_cls.fromisoformat(window[0]),
                        "left_on": date_cls.fromisoformat(window[1]),
                        "role": Membership.ROLE_GUEST,
                    },
                )
                people[name] = person
            else:
                excluded_people.add(name)

        elif a.anomaly_type == "NAME_ALIAS_AMBIGUOUS" and _decided(a):
            raw = a.before_json["name"]
            if a.status == AnomalyStatus.REJECTED:
                # Not the same person: give the raw name its own guest identity.
                person, _ = Person.objects.get_or_create(
                    name=raw, defaults={"is_guest": True}
                )
                row_dates = [
                    state[n]["date"] for n in a.source_row_numbers if state[n]["date"]
                ]
                Membership.objects.get_or_create(
                    group=group,
                    person=person,
                    defaults={
                        "joined_on": date_cls.fromisoformat(min(row_dates)),
                        "left_on": date_cls.fromisoformat(max(row_dates)),
                        "role": Membership.ROLE_GUEST,
                    },
                )
                people[raw] = person
                alias_remaps[raw] = raw
            # APPROVED: parse already canonicalized the name; nothing to do.

    # --- Row-level decisions ------------------------------------------------
    for a in anomalies:
        t, s = a.anomaly_type, a.status
        rows_hit = a.source_row_numbers

        if t == "MISSING_CURRENCY" and _decided(a):
            for n in rows_hit:
                if s == AnomalyStatus.APPROVED:
                    state[n]["currency"] = "INR"
                else:
                    state[n]["status"] = "needs_input"
                    state[n]["hold_reason"] = "currency unresolved"

        elif t == "AMBIGUOUS_DATE" and a.severity == "warning" and _decided(a):
            for n in rows_hit:
                if s == AnomalyStatus.APPROVED:
                    state[n]["date"] = a.after_json["date"]
                # rejected: keep the literal reading already in state

        elif t == "PERCENTAGE_SUM_INVALID" and _decided(a):
            for n in rows_hit:
                res = (a.resolution_json or {}).get("percentages")
                if res and sum(Decimal(str(v)) for v in res.values()) == Decimal("100"):
                    state[n]["split_details"] = {k: str(v) for k, v in res.items()}
                elif s == AnomalyStatus.APPROVED:
                    # Normalize proportionally: percentages become share weights.
                    state[n]["split_type"] = "share"
                else:
                    state[n]["status"] = "needs_input"
                    state[n]["hold_reason"] = "percentages unresolved"

        elif t == "MISSING_PAYER" and _decided(a):
            for n in rows_hit:
                payer = (a.resolution_json or {}).get("payer")
                if payer and payer in people:
                    state[n]["payer"] = payer
                    state[n]["status"] = "active"
                else:
                    state[n]["status"] = "needs_input"
                    state[n]["hold_reason"] = "payer unknown"

        elif t == "EXACT_DUPLICATE" and _decided(a):
            kept, superseded = a.after_json["kept_row"], a.after_json["superseded_row"]
            if s == AnomalyStatus.APPROVED:
                state[superseded]["status"] = "superseded"
            # rejected: both stay active

        elif t == "CONFLICTING_DUPLICATE" and _decided(a):
            if s == AnomalyStatus.APPROVED:
                kept = (a.resolution_json or {}).get("kept_row", a.after_json["kept_row"])
                for n in rows_hit:
                    if n != kept:
                        state[n]["status"] = "superseded"
            # rejected: both stay active (they really were two expenses)

        elif t == "DEPARTED_MEMBER_IN_SPLIT" and _decided(a):
            if s == AnomalyStatus.APPROVED:
                for n in rows_hit:
                    state[n]["participants"] = a.after_json["participants"]
            # rejected: split stays as the file listed it

        elif t == "SETTLEMENT_AS_EXPENSE" and _decided(a):
            for n in rows_hit:
                state[n]["action"] = (
                    "settlement" if s == AnomalyStatus.APPROVED else "expense"
                )
                if s == AnomalyStatus.REJECTED and not state[n]["split_type"]:
                    state[n]["split_type"] = "equal"  # two-person expense fallback

    # --- Apply excluded (rejected) guests: re-split among the rest ----------
    for n, st in state.items():
        if excluded_people & set(st["participants"]):
            st["participants"] = [
                p for p in st["participants"] if p not in excluded_people
            ]
        if st["payer"] in excluded_people:
            st["payer"] = None
            st["status"] = "needs_input"
            st["hold_reason"] = "payer was a rejected guest"

    # --- Write records in file order -----------------------------------------
    outcomes = {}
    for n in sorted(rows):
        st = state[n]
        parsed = rows[n]["parsed"]

        if st["date"] is None or parsed["amount"] is None:
            outcomes[n] = {"outcome": "skipped", "reason": st["hold_reason"] or "unparseable"}
            continue

        amount = Decimal(parsed["amount"])
        currency = st["currency"] or "INR"
        d = date_cls.fromisoformat(st["date"])

        if st["action"] == "settlement" and st["status"] == "active":
            amount_inr, fx_rate, _ = convert_to_inr(amount, currency)
            settlement = Settlement.objects.create(
                group=group,
                date=d,
                from_person=people[st["payer"]],
                to_person=people[st["participants"][0]],
                original_amount=amount,
                original_currency=currency,
                amount_inr=amount_inr,
                fx_rate=fx_rate,
                notes=parsed["notes"],
                source_import=batch,
                source_row_number=n,
            )
            outcomes[n] = {"outcome": "settlement", "id": settlement.id}
            continue

        participants = [people[p] for p in st["participants"] if p in people]
        payer = people.get(st["payer"]) if st["payer"] else None
        status = st["status"]

        if status == "active" and (payer is None or not participants):
            status = "needs_input"
            st["hold_reason"] = st["hold_reason"] or "payer/participants missing"

        if status == "active":
            details = (
                {k: Decimal(v) for k, v in st["split_details"].items()}
                if st["split_details"]
                else None
            )
            expense = create_expense(
                group=group, date=d, description=parsed["description"],
                payer=payer, original_amount=amount, original_currency=currency,
                split_type=st["split_type"] or "equal",
                participants=participants, split_details=details,
                notes=parsed["notes"], status=ExpenseStatus.ACTIVE,
                is_refund=st["is_refund"], source_import=batch,
                source_row_number=n, created_by=user,
            )
            outcomes[n] = {"outcome": "expense_active", "id": expense.id}
        else:
            # Held / void / superseded rows: stored for audit, no shares, so
            # they can never leak into balances.
            amount_inr, fx_rate, fx_date = convert_to_inr(amount, currency)
            expense = Expense.objects.create(
                group=group, date=d, description=parsed["description"],
                payer=payer, original_amount=amount, original_currency=currency,
                amount_inr=amount_inr, fx_rate=fx_rate, fx_rate_date=fx_date,
                split_type=st["split_type"] or "equal",
                split_raw=st["split_details"], notes=parsed["notes"],
                status=status, is_refund=st["is_refund"], source_import=batch,
                source_row_number=n, created_by=user,
            )
            outcomes[n] = {
                "outcome": f"expense_{status}",
                "id": expense.id,
                **({"reason": st["hold_reason"]} if st["hold_reason"] else {}),
            }

    batch.status = BatchStatus.COMMITTED
    return outcomes
