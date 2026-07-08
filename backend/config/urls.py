from django.contrib import admin
from django.http import JsonResponse
from django.urls import path


def health(_request):
    """Liveness probe: confirms the app is up before any feature exists."""
    return JsonResponse({"status": "ok"})


urlpatterns = [
    path("admin/", admin.site.urls),
    path("api/health/", health),
]
