from django.http import HttpResponse
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import status as http_status
from rest_framework.parsers import MultiPartParser
from rest_framework.response import Response
from rest_framework.views import APIView

from groups.views import user_groups

from .committing import CommitBlocked, commit_batch
from .detectors import reanalyze_departed, run_detectors
from .models import AnomalyStatus, BatchStatus, ImportAnomaly, ImportBatch
from .pipeline import build_rows
from .report import build_report, render_markdown
from .serializers import ImportAnomalySerializer, ImportBatchSerializer


class ImportUploadView(APIView):
    """POST a CSV -> dry-run ImportBatch. Nothing touches balances here;
    rows are parsed, normalized and (next stage) anomaly-checked only."""

    parser_classes = [MultiPartParser]

    def post(self, request, group_id):
        group = get_object_or_404(user_groups(request.user), pk=group_id)
        upload = request.FILES.get("file")
        if upload is None:
            return Response(
                {"detail": "attach the CSV as form field 'file'"},
                status=http_status.HTTP_400_BAD_REQUEST,
            )

        roster = [m.person.name for m in group.memberships.select_related("person")]
        try:
            rows = build_rows(upload.read(), roster)
        except ValueError as e:
            return Response({"detail": str(e)}, status=http_status.HTTP_400_BAD_REQUEST)

        anomalies = run_detectors(rows, group)

        batch = ImportBatch.objects.create(
            group=group,
            uploaded_by=request.user,
            filename=upload.name,
            total_rows=len(rows),
            status=BatchStatus.AWAITING_APPROVAL,
            rows_json=rows,
        )
        ImportAnomaly.objects.bulk_create(
            ImportAnomaly(batch=batch, **a) for a in anomalies
        )
        return Response(
            ImportBatchSerializer(batch).data, status=http_status.HTTP_201_CREATED
        )


def _get_batch(request, batch_id):
    return get_object_or_404(
        ImportBatch.objects.filter(group__in=user_groups(request.user)),
        pk=batch_id,
    )


class ImportBatchDetailView(APIView):
    def get(self, request, batch_id):
        return Response(ImportBatchSerializer(_get_batch(request, batch_id)).data)


class AnomalyResolveView(APIView):
    """Approve or reject one pending anomaly (Meera's approval gate).
    Body: {"status": "approved"|"rejected", "resolution_json": {...}?}"""

    def patch(self, request, batch_id, anomaly_id):
        batch = _get_batch(request, batch_id)
        if batch.status != BatchStatus.AWAITING_APPROVAL:
            return Response(
                {"detail": "batch is already committed"},
                status=http_status.HTTP_409_CONFLICT,
            )
        anomaly = get_object_or_404(batch.anomalies, pk=anomaly_id)
        if anomaly.status == AnomalyStatus.AUTO_APPLIED:
            return Response(
                {"detail": "auto-applied anomalies are informational; nothing to decide"},
                status=http_status.HTTP_400_BAD_REQUEST,
            )

        decision = request.data.get("status")
        if decision not in (AnomalyStatus.APPROVED, AnomalyStatus.REJECTED):
            return Response(
                {"detail": "status must be 'approved' or 'rejected'"},
                status=http_status.HTTP_400_BAD_REQUEST,
            )
        anomaly.status = decision
        anomaly.resolution_json = request.data.get("resolution_json")
        anomaly.resolved_by = request.user
        anomaly.resolved_at = timezone.now()
        anomaly.save()

        self._maybe_reanalyze(batch, anomaly)
        return Response(ImportAnomalySerializer(anomaly).data)

    # Types whose decisions establish who a person is (and when they lived here).
    PEOPLE_TYPES = ("NON_MEMBER_PARTICIPANT", "NAME_ALIAS_AMBIGUOUS")

    def _maybe_reanalyze(self, batch, anomaly):
        """Two-phase review: the moment the LAST people decision lands, re-run
        the window-dependent checks with the freshly supplied membership
        windows — anomalies invisible at upload time (empty roster) surface now."""
        if batch.reanalyzed or anomaly.anomaly_type not in self.PEOPLE_TYPES:
            return
        still_open = batch.anomalies.filter(
            status=AnomalyStatus.PENDING_APPROVAL, anomaly_type__in=self.PEOPLE_TYPES
        ).exists()
        if still_open:
            return
        new_anomalies = reanalyze_departed(batch, batch.group)
        ImportAnomaly.objects.bulk_create(
            ImportAnomaly(batch=batch, **a) for a in new_anomalies
        )
        batch.reanalyzed = True
        batch.save(update_fields=["reanalyzed"])


class ImportCommitView(APIView):
    """Apply approved (+auto) changes, write records, produce the report."""

    def post(self, request, batch_id):
        batch = _get_batch(request, batch_id)
        if batch.status == BatchStatus.COMMITTED:
            return Response(
                {"detail": "batch already committed"},
                status=http_status.HTTP_409_CONFLICT,
            )
        try:
            outcomes = commit_batch(batch, request.user)
        except CommitBlocked as e:
            return Response({"detail": str(e)}, status=http_status.HTTP_409_CONFLICT)

        batch.report_json = build_report(batch, outcomes)
        batch.save(update_fields=["status", "report_json"])
        return Response(ImportBatchSerializer(batch).data)


class ImportReportView(APIView):
    """The import report deliverable. ?format=md downloads Markdown."""

    def get(self, request, batch_id):
        batch = _get_batch(request, batch_id)
        if not batch.report_json:
            return Response(
                {"detail": "batch not committed yet — no report"},
                status=http_status.HTTP_404_NOT_FOUND,
            )
        if request.query_params.get("format") == "md":
            md = render_markdown(batch.report_json)
            response = HttpResponse(md, content_type="text/markdown; charset=utf-8")
            response["Content-Disposition"] = (
                f'attachment; filename="import-report-{batch.id}.md"'
            )
            return response
        return Response(batch.report_json)
