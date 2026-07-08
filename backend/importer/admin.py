from django.contrib import admin

from .models import ImportAnomaly, ImportBatch

admin.site.register(ImportBatch)
admin.site.register(ImportAnomaly)
