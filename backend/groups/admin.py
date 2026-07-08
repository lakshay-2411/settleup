from django.contrib import admin

from .models import Group, Membership, Person

admin.site.register(Person)
admin.site.register(Group)
admin.site.register(Membership)
