from django.conf import settings
from django.db import models

from groups.models import Group


class BatchStatus(models.TextChoices):
    PARSING = "parsing"
    AWAITING_APPROVAL = "awaiting_approval"
    COMMITTED = "committed"


class AnomalySeverity(models.TextChoices):
    INFO = "info"
    WARNING = "warning"
    BLOCKING = "blocking"


class AnomalyStatus(models.TextChoices):
    # Non-destructive normalization applied during parse; reported, no approval needed.
    AUTO_APPLIED = "auto_applied"
    # Destructive/interpretive change: held until the user decides.
    PENDING_APPROVAL = "pending_approval"
    APPROVED = "approved"
    REJECTED = "rejected"


class AnomalyType(models.TextChoices):
    EXACT_DUPLICATE = "EXACT_DUPLICATE"
    CONFLICTING_DUPLICATE = "CONFLICTING_DUPLICATE"
    THOUSANDS_SEPARATOR = "THOUSANDS_SEPARATOR"
    SUB_UNIT_PRECISION = "SUB_UNIT_PRECISION"
    NAME_NORMALIZATION = "NAME_NORMALIZATION"
    NAME_ALIAS_AMBIGUOUS = "NAME_ALIAS_AMBIGUOUS"
    MISSING_PAYER = "MISSING_PAYER"
    SETTLEMENT_AS_EXPENSE = "SETTLEMENT_AS_EXPENSE"
    PERCENTAGE_SUM_INVALID = "PERCENTAGE_SUM_INVALID"
    FOREIGN_CURRENCY = "FOREIGN_CURRENCY"
    NEGATIVE_AMOUNT_REFUND = "NEGATIVE_AMOUNT_REFUND"
    NON_MEMBER_PARTICIPANT = "NON_MEMBER_PARTICIPANT"
    MISSING_CURRENCY = "MISSING_CURRENCY"
    AMBIGUOUS_DATE = "AMBIGUOUS_DATE"
    ZERO_AMOUNT = "ZERO_AMOUNT"
    DEPARTED_MEMBER_IN_SPLIT = "DEPARTED_MEMBER_IN_SPLIT"
    SPLITTYPE_DETAIL_MISMATCH = "SPLITTYPE_DETAIL_MISMATCH"
    OUT_OF_ORDER_ROW = "OUT_OF_ORDER_ROW"


class ImportBatch(models.Model):
    """
    One import run. The upload is parsed into a dry-run (rows_json holds every
    normalized row and its proposed action); nothing touches balances until the
    user has resolved pending anomalies and commits the batch.
    """

    group = models.ForeignKey(Group, on_delete=models.CASCADE, related_name="import_batches")
    uploaded_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE)
    uploaded_at = models.DateTimeField(auto_now_add=True)
    filename = models.CharField(max_length=255)
    total_rows = models.IntegerField(default=0)
    status = models.CharField(
        max_length=20, choices=BatchStatus.choices, default=BatchStatus.PARSING
    )
    rows_json = models.JSONField(default=list)  # normalized rows + proposed actions
    report_json = models.JSONField(null=True, blank=True)  # final import report

    class Meta:
        ordering = ["-uploaded_at"]

    def __str__(self):
        return f"Import #{self.pk} into {self.group} ({self.status})"


class ImportAnomaly(models.Model):
    """
    One detected data problem: what was found, on which row(s), the policy the
    app proposes, and — for destructive changes — the user's approval decision
    with a before/after diff.
    """

    batch = models.ForeignKey(ImportBatch, on_delete=models.CASCADE, related_name="anomalies")
    anomaly_type = models.CharField(max_length=40, choices=AnomalyType.choices)
    severity = models.CharField(max_length=10, choices=AnomalySeverity.choices)
    source_row_numbers = models.JSONField(default=list)  # 1-indexed data rows
    description = models.TextField()
    policy = models.TextField()  # what the app proposes/did
    status = models.CharField(
        max_length=20, choices=AnomalyStatus.choices, default=AnomalyStatus.AUTO_APPLIED
    )
    before_json = models.JSONField(null=True, blank=True)
    after_json = models.JSONField(null=True, blank=True)
    # Free-form user override captured at approval time (e.g. supplied payer name,
    # corrected percentages, chosen date).
    resolution_json = models.JSONField(null=True, blank=True)
    resolved_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="anomalies_resolved",
    )
    resolved_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["id"]

    def __str__(self):
        return f"{self.anomaly_type} rows={self.source_row_numbers} [{self.status}]"
