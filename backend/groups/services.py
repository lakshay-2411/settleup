"""Membership-window helpers — single source of truth for "who was active when".

Used by both the balance engine and the importer so the rule can never drift:
an expense may only be shared by people whose membership window covers its date.
"""


def active_members_on(group, date):
    """Return the Persons whose membership in `group` covers `date` (inclusive)."""
    memberships = group.memberships.select_related("person").filter(joined_on__lte=date)
    return [m.person for m in memberships if m.left_on is None or date <= m.left_on]


def is_active_on(group, person, date):
    m = group.memberships.filter(person=person).first()
    return bool(m and m.is_active_on(date))
