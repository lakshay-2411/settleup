from django.contrib.auth.models import AbstractUser
from django.db import models


class User(AbstractUser):
    """App account. Email is the login identifier; username kept for admin compat."""

    email = models.EmailField(unique=True)
    name = models.CharField(max_length=120, blank=True)

    USERNAME_FIELD = "email"
    REQUIRED_FIELDS = ["username"]

    def __str__(self):
        return self.email
