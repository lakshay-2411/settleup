from django.urls import path

from .views import (
    GroupDetailView,
    GroupListCreateView,
    MembershipDetailView,
    MembershipListCreateView,
)

urlpatterns = [
    path("", GroupListCreateView.as_view(), name="group-list"),
    path("<int:pk>/", GroupDetailView.as_view(), name="group-detail"),
    path("<int:group_id>/members/", MembershipListCreateView.as_view(), name="member-list"),
    path(
        "<int:group_id>/members/<int:pk>/",
        MembershipDetailView.as_view(),
        name="member-detail",
    ),
]
