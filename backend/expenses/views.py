from django.shortcuts import get_object_or_404
from rest_framework import generics, serializers

from groups.models import Person
from groups.services import is_active_on
from groups.views import user_groups

from .models import Expense
from .serializers import ExpenseSerializer
from .services import create_expense, update_expense_splits


def _resolve_people(group, names):
    """Map submitted names onto the group's roster; unknown names are an error
    (the UI offers roster members only — free-form people arrive via import)."""
    roster = {m.person.name: m.person for m in group.memberships.select_related("person")}
    people, missing = [], []
    for name in names:
        (people if name in roster else missing).append(roster.get(name, name))
    if missing:
        raise serializers.ValidationError({"participants": f"not in group roster: {missing}"})
    return people


class ExpenseListCreateView(generics.ListCreateAPIView):
    serializer_class = ExpenseSerializer

    def get_group(self):
        return get_object_or_404(user_groups(self.request.user), pk=self.kwargs["group_id"])

    def get_queryset(self):
        qs = (
            self.get_group()
            .expenses.select_related("payer")
            .prefetch_related("shares__person")
        )
        status = self.request.query_params.get("status")
        if status:
            qs = qs.filter(status=status)
        return qs

    def perform_create(self, serializer):
        group = self.get_group()
        data = serializer.validated_data
        payer_name = data.pop("payer_name", "")
        participants = _resolve_people(group, data.pop("participants"))
        payer = _resolve_people(group, [payer_name])[0] if payer_name else None
        details = data.pop("split_details", None)

        # Membership-window check: everyone in the split must be active on the date.
        inactive = [
            p.name for p in participants if not is_active_on(group, p, data["date"])
        ]
        if inactive:
            raise serializers.ValidationError(
                {"participants": f"not active in group on {data['date']}: {inactive}"}
            )

        expense = create_expense(
            group=group,
            payer=payer,
            participants=participants,
            split_details=details,
            created_by=self.request.user,
            **data,
        )
        serializer.instance = expense


class ExpenseDetailView(generics.RetrieveUpdateDestroyAPIView):
    serializer_class = ExpenseSerializer

    def get_queryset(self):
        return Expense.objects.filter(group__in=user_groups(self.request.user))

    def perform_update(self, serializer):
        data = serializer.validated_data
        payer_name = data.pop("payer_name", None)
        participant_names = data.pop("participants", None)
        details = data.pop("split_details", None)
        expense = serializer.instance
        group = expense.group

        if payer_name is not None:
            data["payer"] = _resolve_people(group, [payer_name])[0] if payer_name else None
        expense = serializer.save(**{k: v for k, v in data.items()})

        # Any edit that can change the math re-resolves shares from scratch.
        if participant_names is not None or details is not None:
            people = (
                _resolve_people(group, participant_names)
                if participant_names is not None
                else [s.person for s in expense.shares.select_related("person")]
            )
            update_expense_splits(expense, people, details or expense.split_raw)
