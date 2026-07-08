from django.urls import path

from .views import ImportBatchDetailView, ImportUploadView

urlpatterns = [
    path(
        "groups/<int:group_id>/imports/",
        ImportUploadView.as_view(),
        name="import-upload",
    ),
    path("imports/<int:batch_id>/", ImportBatchDetailView.as_view(), name="import-detail"),
]
