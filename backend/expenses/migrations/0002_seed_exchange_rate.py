"""
Seed the USD -> INR conversion rate.

Decision (see DECISIONS.md): a single fixed rate of 1 USD = 83.00 INR is used for
the whole assignment window, rather than per-date historical rates. It lives in
one DB row so changing the rate (or adding per-date rates later) touches nothing
but data.
"""

from decimal import Decimal

from django.db import migrations

RATE_USD_INR = Decimal("83.00")
AS_OF = "2026-02-01"  # start of the imported data window
SOURCE = "Fixed assignment rate — documented in DECISIONS.md"


def seed(apps, schema_editor):
    ExchangeRate = apps.get_model("expenses", "ExchangeRate")
    ExchangeRate.objects.get_or_create(
        base="INR", quote="USD", as_of=AS_OF,
        defaults={"rate": RATE_USD_INR, "source": SOURCE},
    )


def unseed(apps, schema_editor):
    ExchangeRate = apps.get_model("expenses", "ExchangeRate")
    ExchangeRate.objects.filter(base="INR", quote="USD", as_of=AS_OF).delete()


class Migration(migrations.Migration):
    dependencies = [("expenses", "0001_initial")]
    operations = [migrations.RunPython(seed, unseed)]
