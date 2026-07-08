"""
Balance engine — pure reads over stored ExpenseShare/Settlement rows.

Definition (one member, hand-checkable):
    net = paid_for_expenses − own_shares + settlements_paid − settlements_received

Sign convention: positive net = the group owes this person (creditor);
negative net = this person owes the group (debtor).

Only ACTIVE expenses count. needs_input / void / superseded / pending_approval
rows are excluded — they are visible in the UI but never move money.

Every number this module produces is drillable via `person_breakdown()`:
the exact rows that sum to it, so there are no magic numbers anywhere.
"""

from collections import defaultdict
from decimal import Decimal

from expenses.models import Expense, ExpenseShare, ExpenseStatus, Settlement

ZERO = Decimal("0.00")
# Everything is stored rounded to the paisa and reconciled, so sums are exact.
ROUNDING_TOLERANCE = Decimal("0.00")


def _active_expenses(group):
    return group.expenses.filter(status=ExpenseStatus.ACTIVE)


def net_balances(group) -> dict:
    """person_id -> {person, paid, share, settled_out, settled_in, net}"""
    rows = defaultdict(
        lambda: {"paid": ZERO, "share": ZERO, "settled_out": ZERO, "settled_in": ZERO}
    )
    people = {}

    for e in _active_expenses(group).select_related("payer"):
        if e.payer_id:
            rows[e.payer_id]["paid"] += e.amount_inr
            people[e.payer_id] = e.payer

    for s in ExpenseShare.objects.filter(
        expense__group=group, expense__status=ExpenseStatus.ACTIVE
    ).select_related("person"):
        rows[s.person_id]["share"] += s.share_amount_inr
        people[s.person_id] = s.person

    for st in group.settlements.select_related("from_person", "to_person"):
        rows[st.from_person_id]["settled_out"] += st.amount_inr
        rows[st.to_person_id]["settled_in"] += st.amount_inr
        people[st.from_person_id] = st.from_person
        people[st.to_person_id] = st.to_person

    result = {}
    for pid, r in rows.items():
        net = r["paid"] - r["share"] + r["settled_out"] - r["settled_in"]
        result[pid] = {"person": people[pid], **r, "net": net}
    return result


def check_integrity(balances: dict):
    """Inline invariant (no test suite): all nets must cancel out exactly."""
    total = sum(r["net"] for r in balances.values())
    if abs(total) > ROUNDING_TOLERANCE:
        raise AssertionError(f"group balances do not sum to zero: {total}")


def simplify_debts(balances: dict) -> list:
    """
    Min-cash-flow settlement plan (Aisha's "one number per person"):
    repeatedly match the largest debtor with the largest creditor. Result is a
    short list of {from, to, amount} that settles the whole group.
    """
    creditors = []  # (net, person)
    debtors = []
    for r in balances.values():
        if r["net"] > 0:
            creditors.append([r["net"], r["person"]])
        elif r["net"] < 0:
            debtors.append([-r["net"], r["person"]])

    # Deterministic order: biggest first, ties by name so runs are reproducible.
    creditors.sort(key=lambda x: (-x[0], x[1].name))
    debtors.sort(key=lambda x: (-x[0], x[1].name))

    transfers = []
    i = j = 0
    while i < len(debtors) and j < len(creditors):
        owe, debtor = debtors[i]
        due, creditor = creditors[j]
        amount = min(owe, due)
        transfers.append({"from": debtor, "to": creditor, "amount": amount})
        debtors[i][0] -= amount
        creditors[j][0] -= amount
        if debtors[i][0] == 0:
            i += 1
        if creditors[j][0] == 0:
            j += 1
    return transfers


def person_breakdown(group, person) -> dict:
    """
    Rohan's requirement: every line that makes up one person's net balance.
    Returns the four component lists plus the same net computed from them.
    """
    paid = list(
        _active_expenses(group)
        .filter(payer=person)
        .values("id", "date", "description", "amount_inr", "original_amount", "original_currency")
    )
    shares = list(
        ExpenseShare.objects.filter(
            expense__group=group, expense__status=ExpenseStatus.ACTIVE, person=person
        )
        .select_related("expense")
        .values(
            "expense_id",
            "share_amount_inr",
            "expense__date",
            "expense__description",
            "expense__amount_inr",
            "expense__split_type",
        )
    )
    settled_out = list(
        group.settlements.filter(from_person=person)
        .select_related("to_person")
        .values("id", "date", "amount_inr", "to_person__name", "notes")
    )
    settled_in = list(
        group.settlements.filter(to_person=person)
        .select_related("from_person")
        .values("id", "date", "amount_inr", "from_person__name", "notes")
    )

    net = (
        sum((p["amount_inr"] for p in paid), ZERO)
        - sum((s["share_amount_inr"] for s in shares), ZERO)
        + sum((s["amount_inr"] for s in settled_out), ZERO)
        - sum((s["amount_inr"] for s in settled_in), ZERO)
    )
    return {
        "person": person,
        "paid": paid,
        "shares": shares,
        "settlements_paid": settled_out,
        "settlements_received": settled_in,
        "net": net,
    }
