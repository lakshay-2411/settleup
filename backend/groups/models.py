from django.conf import settings
from django.db import models


class Person(models.Model):
    """
    A human who appears in expenses. Not every Person has a login: guests like
    Dev or Kabir exist only as expense participants. `name` is the canonical
    identity the importer normalizes aliases onto (e.g. "priya", "Priya S" -> Priya).
    """

    name = models.CharField(max_length=120, unique=True)
    display_name = models.CharField(max_length=120, blank=True)
    user = models.OneToOneField(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="person",
    )
    is_guest = models.BooleanField(default=False)

    def __str__(self):
        return self.display_name or self.name


class Group(models.Model):
    """A household/trip that owns expenses and a membership roster."""

    name = models.CharField(max_length=120)
    base_currency = models.CharField(max_length=3, default="INR")
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="groups_created"
    )
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return self.name


class Membership(models.Model):
    """
    A Person's window of belonging to a Group. Source of truth for "who was in
    the flat when": expenses only split among members active on the expense date.
    left_on is inclusive — the member still shares costs dated on that day.
    """

    ROLE_MEMBER = "member"
    ROLE_GUEST = "guest"
    ROLE_CHOICES = [(ROLE_MEMBER, "Member"), (ROLE_GUEST, "Guest")]

    group = models.ForeignKey(Group, on_delete=models.CASCADE, related_name="memberships")
    person = models.ForeignKey(Person, on_delete=models.CASCADE, related_name="memberships")
    joined_on = models.DateField()
    left_on = models.DateField(null=True, blank=True)
    role = models.CharField(max_length=10, choices=ROLE_CHOICES, default=ROLE_MEMBER)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=["group", "person"], name="unique_group_person"),
        ]

    def is_active_on(self, date):
        return self.joined_on <= date and (self.left_on is None or date <= self.left_on)

    def __str__(self):
        return f"{self.person} in {self.group} ({self.joined_on} – {self.left_on or '…'})"
