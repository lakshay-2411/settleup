from django.shortcuts import get_object_or_404
from rest_framework import status as http_status
from rest_framework.parsers import MultiPartParser
from rest_framework.response import Response
from rest_framework.views import APIView

from groups.views import user_groups

from .models import BatchStatus, ImportBatch
from .pipeline import build_rows
from .serializers import ImportBatchSerializer


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

        batch = ImportBatch.objects.create(
            group=group,
            uploaded_by=request.user,
            filename=upload.name,
            total_rows=len(rows),
            status=BatchStatus.AWAITING_APPROVAL,
            rows_json=rows,
        )
        return Response(
            ImportBatchSerializer(batch).data, status=http_status.HTTP_201_CREATED
        )


class ImportBatchDetailView(APIView):
    def get(self, request, batch_id):
        batch = get_object_or_404(
            ImportBatch.objects.filter(group__in=user_groups(request.user)),
            pk=batch_id,
        )
        return Response(ImportBatchSerializer(batch).data)
