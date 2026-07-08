from django.urls import path

from .balance_views import (
    BalancesView,
    BreakdownView,
    SettlementListCreateView,
    SimplifiedBalancesView,
)
from .views import ExpenseDetailView, ExpenseListCreateView

urlpatterns = [
    path(
        "groups/<int:group_id>/expenses/",
        ExpenseListCreateView.as_view(),
        name="expense-list",
    ),
    path("expenses/<int:pk>/", ExpenseDetailView.as_view(), name="expense-detail"),
    path(
        "groups/<int:group_id>/settlements/",
        SettlementListCreateView.as_view(),
        name="settlement-list",
    ),
    path("groups/<int:group_id>/balances/", BalancesView.as_view(), name="balances"),
    path(
        "groups/<int:group_id>/balances/simplified/",
        SimplifiedBalancesView.as_view(),
        name="balances-simplified",
    ),
    path(
        "groups/<int:group_id>/balances/<int:person_id>/breakdown/",
        BreakdownView.as_view(),
        name="balance-breakdown",
    ),
]
