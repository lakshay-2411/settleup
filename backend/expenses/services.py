"""
Expense write path: currency conversion + share resolution happen HERE, once,
at save time. Balances only ever read the stored ExpenseShare rows, so split
logic and FX can never drift between features.
"""

from decimal import Decimal

from django.db import transaction

from groups.models import Person

from .models import ExchangeRate, Expense, ExpenseShare, ExpenseStatus
from .splits import resolve_split, round_money


def convert_to_inr(amount: Decimal, currency: str):
    """
    Convert `amount` to INR. Returns (amount_inr, fx_rate, fx_rate_date).
    INR passes through at rate 1. Other currencies use the latest seeded
    ExchangeRate (fixed 83.00 USD->INR for this dataset — see DECISIONS.md).
    """
    if currency == "INR":
        return round_money(amount), None, None
    rate_row = ExchangeRate.objects.filter(base="INR", quote=currency).first()
    if rate_row is None:
        raise ValueError(f"no exchange rate configured for {currency}")
    return round_money(amount * rate_row.rate), rate_row.rate, rate_row.as_of


@transaction.atomic
def create_expense(
    *,
    group,
    date,
    description,
    payer: Person | None,
    original_amount: Decimal,
    original_currency: str,
    split_type: str,
    participants: list[Person],
    split_details: dict | None = None,  # person name -> Decimal (amount/pct/weight)
    notes: str = "",
    status: str = ExpenseStatus.ACTIVE,
    is_refund: bool = False,
    source_import=None,
    source_row_number: int | None = None,
    created_by=None,
) -> Expense:
    """Create an Expense and its resolved ExpenseShare rows atomically."""
    amount_inr, fx_rate, fx_date = convert_to_inr(original_amount, original_currency)

    expense = Expense.objects.create(
        group=group,
        date=date,
        description=description,
        payer=payer,
        original_amount=round_money(original_amount),
        original_currency=original_currency,
        amount_inr=amount_inr,
        fx_rate=fx_rate,
        fx_rate_date=fx_date,
        split_type=split_type,
        split_raw=split_details,
        notes=notes,
        status=status,
        is_refund=is_refund,
        source_import=source_import,
        source_row_number=source_row_number,
        created_by=created_by,
    )
    _create_shares(expense, participants, split_details)
    return expense


def _create_shares(expense, participants, split_details):
    by_name = {p.name: p for p in participants}

    if expense.split_type == "equal":
        shares = resolve_split("equal", expense.amount_inr, list(by_name))
        weights = {}
    else:
        details = {k: Decimal(str(v)) for k, v in (split_details or {}).items()}
        if expense.split_type == "unequal" and expense.original_currency != "INR":
            # unequal amounts are given in the original currency; convert each part
            details = {k: convert_to_inr(v, expense.original_currency)[0] for k, v in details.items()}
        shares = resolve_split(expense.split_type, expense.amount_inr, list(by_name), details)
        weights = details

    ExpenseShare.objects.bulk_create(
        ExpenseShare(
            expense=expense,
            person=by_name[name],
            share_amount_inr=amount,
            weight=weights.get(name),
        )
        for name, amount in shares.items()
    )


@transaction.atomic
def update_expense_splits(expense, participants, split_details):
    """Recompute shares after an edit — old shares are replaced wholesale."""
    expense.shares.all().delete()
    _create_shares(expense, participants, split_details)
