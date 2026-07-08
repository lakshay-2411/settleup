from django.contrib import admin

from .models import ExchangeRate, Expense, ExpenseShare, Settlement

admin.site.register(Expense)
admin.site.register(ExpenseShare)
admin.site.register(Settlement)
admin.site.register(ExchangeRate)
