"""Balance + settlement endpoints: thin HTTP shells over ledger.balances."""

from django.shortcuts import get_object_or_404
from rest_framework import generics, serializers
from rest_framework.response import Response
from rest_framework.views import APIView

from groups.models import Person
from groups.views import user_groups
from ledger.balances import check_integrity, net_balances, person_breakdown, simplify_debts

from .serializers import SettlementSerializer
from .services import convert_to_inr


def _get_group(request, group_id):
    return get_object_or_404(user_groups(request.user), pk=group_id)


def _person_payload(person):
    return {"id": person.id, "name": person.name, "is_guest": person.is_guest}


class BalancesView(APIView):
    """Net position per person. Integrity-checked on every read."""

    def get(self, request, group_id):
        group = _get_group(request, group_id)
        balances = net_balances(group)
        check_integrity(balances)  # sum of nets must be exactly zero
        return Response(
            sorted(
                (
                    {
                        "person": _person_payload(r["person"]),
                        "paid": r["paid"],
                        "share": r["share"],
                        "settled_out": r["settled_out"],
                        "settled_in": r["settled_in"],
                        "net": r["net"],
                    }
                    for r in balances.values()
                ),
                key=lambda r: -r["net"],
            )
        )


class SimplifiedBalancesView(APIView):
    """Aisha's view: the minimal 'X pays Y' list that settles the group."""

    def get(self, request, group_id):
        group = _get_group(request, group_id)
        balances = net_balances(group)
        check_integrity(balances)
        return Response(
            [
                {
                    "from": _person_payload(t["from"]),
                    "to": _person_payload(t["to"]),
                    "amount": t["amount"],
                }
                for t in simplify_debts(balances)
            ]
        )


class BreakdownView(APIView):
    """Rohan's view: every row behind one person's number."""

    def get(self, request, group_id, person_id):
        group = _get_group(request, group_id)
        person = get_object_or_404(Person, pk=person_id)
        data = person_breakdown(group, person)
        data["person"] = _person_payload(person)
        return Response(data)


class SettlementListCreateView(generics.ListCreateAPIView):
    serializer_class = SettlementSerializer

    def get_group(self):
        return _get_group(self.request, self.kwargs["group_id"])

    def get_queryset(self):
        return self.get_group().settlements.select_related("from_person", "to_person")

    def perform_create(self, serializer):
        group = self.get_group()
        data = serializer.validated_data
        names = {m.person.name: m.person for m in group.memberships.select_related("person")}
        frm = names.get(data.pop("from_person_name"))
        to = names.get(data.pop("to_person_name"))
        if frm is None or to is None:
            raise serializers.ValidationError("both people must be in the group roster")
        if frm == to:
            raise serializers.ValidationError("cannot settle with yourself")
        amount_inr, fx_rate, _ = convert_to_inr(
            data["original_amount"], data.get("original_currency", "INR")
        )
        serializer.save(
            group=group, from_person=frm, to_person=to, amount_inr=amount_inr, fx_rate=fx_rate
        )
