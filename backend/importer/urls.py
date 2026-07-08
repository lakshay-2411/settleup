from django.urls import path

from .views import (
    AnomalyResolveView,
    ImportBatchDetailView,
    ImportCommitView,
    ImportReportView,
    ImportUploadView,
)

urlpatterns = [
    path(
        "groups/<int:group_id>/imports/",
        ImportUploadView.as_view(),
        name="import-upload",
    ),
    path("imports/<int:batch_id>/", ImportBatchDetailView.as_view(), name="import-detail"),
    path(
        "imports/<int:batch_id>/anomalies/<int:anomaly_id>/",
        AnomalyResolveView.as_view(),
        name="import-anomaly-resolve",
    ),
    path("imports/<int:batch_id>/commit/", ImportCommitView.as_view(), name="import-commit"),
    path("imports/<int:batch_id>/report/", ImportReportView.as_view(), name="import-report"),
]
