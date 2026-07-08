from django.urls import path

from .views import ExpenseDetailView, ExpenseListCreateView

urlpatterns = [
    path(
        "groups/<int:group_id>/expenses/",
        ExpenseListCreateView.as_view(),
        name="expense-list",
    ),
    path("expenses/<int:pk>/", ExpenseDetailView.as_view(), name="expense-detail"),
]
