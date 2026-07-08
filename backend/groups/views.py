from django.shortcuts import get_object_or_404
from rest_framework import generics

from .models import Group, Membership
from .serializers import GroupSerializer, MembershipSerializer


def user_groups(user):
    """Groups the requesting user can see: ones they created."""
    return Group.objects.filter(created_by=user).prefetch_related("memberships__person")


class GroupListCreateView(generics.ListCreateAPIView):
    serializer_class = GroupSerializer

    def get_queryset(self):
        return user_groups(self.request.user)

    def perform_create(self, serializer):
        serializer.save(created_by=self.request.user)


class GroupDetailView(generics.RetrieveUpdateDestroyAPIView):
    serializer_class = GroupSerializer

    def get_queryset(self):
        return user_groups(self.request.user)


class MembershipListCreateView(generics.ListCreateAPIView):
    serializer_class = MembershipSerializer

    def get_group(self):
        return get_object_or_404(user_groups(self.request.user), pk=self.kwargs["group_id"])

    def get_queryset(self):
        return self.get_group().memberships.select_related("person")

    def perform_create(self, serializer):
        serializer.save(group=self.get_group())


class MembershipDetailView(generics.RetrieveUpdateDestroyAPIView):
    serializer_class = MembershipSerializer

    def get_queryset(self):
        return Membership.objects.filter(
            group__in=user_groups(self.request.user),
            group_id=self.kwargs["group_id"],
        ).select_related("person")
