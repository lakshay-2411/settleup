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

from expenses.models import ExchangeRate, Expense, ExpenseStatus, ExpenseShare, Settlement
from expenses.splits import resolve_split, round_money
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
                # The review step may have refined who this person is: full
                # member vs guest, and their real join/leave dates. Fall back
                # to the appearance-span window proposed by the detector.
                res = a.resolution_json or {}
                default = a.after_json.get("window") or [None, None]
                role = res.get("role", Membership.ROLE_GUEST)
                joined = res.get("joined_on") or default[0]
                left = res["left_on"] if "left_on" in res else default[1]

                person, _ = Person.objects.get_or_create(
                    name=name, defaults={"is_guest": role == Membership.ROLE_GUEST}
                )
                if person.is_guest != (role == Membership.ROLE_GUEST):
                    person.is_guest = role == Membership.ROLE_GUEST
                    person.save(update_fields=["is_guest"])
                if joined:
                    Membership.objects.get_or_create(
                        group=group,
                        person=person,
                        defaults={
                            "joined_on": date_cls.fromisoformat(joined),
                            "left_on": date_cls.fromisoformat(left) if left else None,
                            "role": role,
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

    # --- Write records in three bulk statements ------------------------------
    # Against a remote Postgres every statement costs a full network round trip
    # (~190 ms to Supabase — measured), so per-row writes made a 42-row commit
    # take ~33 s (173 queries, half of them SAVEPOINTs from nested atomics).
    # Instead: resolve everything in memory — the split math in
    # expenses/splits.py is pure — then write one bulk insert for expenses, one
    # for their shares, one for settlements. Same rows, same one outer
    # transaction, ~15 queries total.
    fx_cache: dict[str, ExchangeRate] = {}

    def to_inr(amount: Decimal, currency: str):
        """convert_to_inr, but the rate row is fetched once per batch."""
        if currency == "INR":
            return round_money(amount), None, None
        if currency not in fx_cache:
            rate_row = ExchangeRate.objects.filter(base="INR", quote=currency).first()
            if rate_row is None:
                raise ValueError(f"no exchange rate configured for {currency}")
            fx_cache[currency] = rate_row
        rate_row = fx_cache[currency]
        return round_money(amount * rate_row.rate), rate_row.rate, rate_row.as_of

    outcomes = {}
    # (row_n, unsaved Expense, [(person, share, weight)] | None, hold_reason)
    staged_expenses = []
    staged_settlements = []  # (row_n, unsaved Settlement)

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
            amount_inr, fx_rate, _ = to_inr(amount, currency)
            staged_settlements.append((n, Settlement(
                group=group,
                date=d,
                from_person=people[st["payer"]],
                to_person=people[st["participants"][0]],
                original_amount=round_money(amount),
                original_currency=currency,
                amount_inr=amount_inr,
                fx_rate=fx_rate,
                notes=parsed["notes"],
                source_import=batch,
                source_row_number=n,
            )))
            continue

        participants = [people[p] for p in st["participants"] if p in people]
        payer = people.get(st["payer"]) if st["payer"] else None
        status = st["status"]

        if status == "active" and (payer is None or not participants):
            status = "needs_input"
            st["hold_reason"] = st["hold_reason"] or "payer/participants missing"

        amount_inr, fx_rate, fx_date = to_inr(amount, currency)
        details = (
            {k: Decimal(str(v)) for k, v in st["split_details"].items()}
            if st["split_details"]
            else None
        )
        split_type = st["split_type"] or "equal"

        share_pairs = None
        if status == "active":
            # Mirror expenses/services._create_shares, in memory.
            by_name = {p.name: p for p in participants}
            if split_type == "equal":
                shares = resolve_split("equal", amount_inr, list(by_name))
                weights: dict = {}
            else:
                dd = details or {}
                if split_type == "unequal" and currency != "INR":
                    # unequal parts are given in the original currency
                    dd = {k: to_inr(v, currency)[0] for k, v in dd.items()}
                shares = resolve_split(split_type, amount_inr, list(by_name), dd)
                weights = dd
            share_pairs = [
                (by_name[name], share, weights.get(name)) for name, share in shares.items()
            ]

        staged_expenses.append((n, Expense(
            group=group, date=d, description=parsed["description"],
            payer=payer, original_amount=round_money(amount),
            original_currency=currency,
            amount_inr=amount_inr, fx_rate=fx_rate, fx_rate_date=fx_date,
            split_type=split_type,
            split_raw={k: str(v) for k, v in details.items()} if details else None,
            notes=parsed["notes"], status=status, is_refund=st["is_refund"],
            source_import=batch, source_row_number=n, created_by=user,
        ), share_pairs, st["hold_reason"]))

    # Three round trips instead of one per row.
    Expense.objects.bulk_create([e for _, e, _, _ in staged_expenses])
    ExpenseShare.objects.bulk_create(
        ExpenseShare(expense=e, person=person, share_amount_inr=share, weight=weight)
        for _, e, pairs, _ in staged_expenses
        if pairs
        for person, share, weight in pairs
    )
    Settlement.objects.bulk_create([s for _, s in staged_settlements])

    for n, e, _pairs, hold in staged_expenses:
        outcomes[n] = {
            "outcome": f"expense_{e.status}",
            "id": e.id,
            **({"reason": hold} if hold and e.status != ExpenseStatus.ACTIVE else {}),
        }
    for n, s in staged_settlements:
        outcomes[n] = {"outcome": "settlement", "id": s.id}

    batch.status = BatchStatus.COMMITTED
    return outcomes
