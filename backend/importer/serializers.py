from rest_framework import serializers

from .models import ImportAnomaly, ImportBatch


class ImportAnomalySerializer(serializers.ModelSerializer):
    class Meta:
        model = ImportAnomaly
        fields = [
            "id", "anomaly_type", "severity", "source_row_numbers",
            "description", "policy", "status",
            "before_json", "after_json", "resolution_json",
            "resolved_at",
        ]
        read_only_fields = [f for f in fields if f not in ("status", "resolution_json")]


class ImportBatchSerializer(serializers.ModelSerializer):
    anomalies = ImportAnomalySerializer(many=True, read_only=True)

    class Meta:
        model = ImportBatch
        fields = [
            "id", "group", "filename", "uploaded_at", "total_rows",
            "status", "rows_json", "report_json", "anomalies",
        ]
        read_only_fields = fields
