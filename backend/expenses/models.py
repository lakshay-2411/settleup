from django.conf import settings
from django.db import models

from groups.models import Group, Person


class SplitType(models.TextChoices):
    EQUAL = "equal"
    UNEQUAL = "unequal"
    PERCENTAGE = "percentage"
    SHARE = "share"


class ExpenseStatus(models.TextChoices):
    ACTIVE = "active"
    # Blocking anomaly (e.g. missing payer): kept out of balances until resolved.
    NEEDS_INPUT = "needs_input"
    # Zero-amount / user-voided rows: kept for audit, excluded from balances.
    VOID = "void"
    # Losing side of a duplicate pair: kept for audit, excluded from balances.
    SUPERSEDED = "superseded"
    # Imported but awaiting an approval decision.
    PENDING_APPROVAL = "pending_approval"


class ExchangeRate(models.Model):
    """Conversion rate into the base currency. Seeded: 1 USD = 83.00 INR."""

    base = models.CharField(max_length=3, default="INR")
    quote = models.CharField(max_length=3)
    rate = models.DecimalField(max_digits=12, decimal_places=6)
    as_of = models.DateField()
    source = models.CharField(max_length=200, blank=True)

    class Meta:
        ordering = ["-as_of"]

    def __str__(self):
        return f"1 {self.quote} = {self.rate} {self.base} (as of {self.as_of})"


class Expense(models.Model):
    """
    One shared cost. Money is stored twice: the original amount/currency exactly
    as entered, and the converted base-currency amount used by every balance.
    Shares are resolved once at save time into ExpenseShare rows so the ledger
    never re-runs split logic.
    """

    group = models.ForeignKey(Group, on_delete=models.CASCADE, related_name="expenses")
    date = models.DateField()
    description = models.CharField(max_length=255)
    payer = models.ForeignKey(
        Person,
        null=True,  # only while status=needs_input (e.g. "can't remember who paid")
        blank=True,
        on_delete=models.PROTECT,
        related_name="expenses_paid",
    )
    original_amount = models.DecimalField(max_digits=12, decimal_places=2)
    original_currency = models.CharField(max_length=3, default="INR")
    amount_inr = models.DecimalField(max_digits=12, decimal_places=2)
    fx_rate = models.DecimalField(max_digits=12, decimal_places=6, null=True, blank=True)
    fx_rate_date = models.DateField(null=True, blank=True)
    split_type = models.CharField(max_length=12, choices=SplitType.choices)
    split_raw = models.JSONField(null=True, blank=True)  # raw split_details, for audit
    notes = models.TextField(blank=True)
    status = models.CharField(
        max_length=20, choices=ExpenseStatus.choices, default=ExpenseStatus.ACTIVE
    )
    is_refund = models.BooleanField(default=False)  # negative-amount refunds
    source_import = models.ForeignKey(
        "importer.ImportBatch",
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="expenses",
    )
    source_row_number = models.IntegerField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL
    )

    class Meta:
        ordering = ["date", "id"]

    def __str__(self):
        return f"{self.date} {self.description} ({self.original_amount} {self.original_currency})"


class ExpenseShare(models.Model):
    """
    The resolved base-currency amount one Person owes for one Expense.
    Sum of shares always equals expense.amount_inr exactly (penny reconciliation).
    """

    expense = models.ForeignKey(Expense, on_delete=models.CASCADE, related_name="shares")
    person = models.ForeignKey(Person, on_delete=models.PROTECT, related_name="expense_shares")
    share_amount_inr = models.DecimalField(max_digits=12, decimal_places=2)
    weight = models.DecimalField(
        max_digits=12, decimal_places=4, null=True, blank=True
    )  # raw share count / percentage, for audit

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=["expense", "person"], name="unique_expense_person"),
        ]

    def __str__(self):
        return f"{self.person}: {self.share_amount_inr} of {self.expense}"


class Settlement(models.Model):
    """A payment between two people — reduces debt, not a shared cost."""

    group = models.ForeignKey(Group, on_delete=models.CASCADE, related_name="settlements")
    date = models.DateField()
    from_person = models.ForeignKey(
        Person, on_delete=models.PROTECT, related_name="settlements_paid"
    )
    to_person = models.ForeignKey(
        Person, on_delete=models.PROTECT, related_name="settlements_received"
    )
    original_amount = models.DecimalField(max_digits=12, decimal_places=2)
    original_currency = models.CharField(max_length=3, default="INR")
    amount_inr = models.DecimalField(max_digits=12, decimal_places=2)
    fx_rate = models.DecimalField(max_digits=12, decimal_places=6, null=True, blank=True)
    notes = models.TextField(blank=True)
    source_import = models.ForeignKey(
        "importer.ImportBatch",
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="settlements",
    )
    source_row_number = models.IntegerField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["date", "id"]

    def __str__(self):
        return f"{self.date}: {self.from_person} -> {self.to_person} ₹{self.amount_inr}"
