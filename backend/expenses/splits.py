"""
Split resolvers: turn (total, split_type, participants[, details]) into exact
per-person amounts.

Two rules govern all money math here (see DECISIONS.md):

1. ROUNDING: half-up to 2 decimal places, applied via `round_money()`. It is the
   ONLY place a quantum/rounding mode is chosen, so changing the rounding rule
   is a one-line edit.

2. PENNY RECONCILIATION: after dividing, shares must sum to the total EXACTLY.
   Any leftover paise (from rounding) are distributed one at a time to
   participants in stable name order, so the result is deterministic and
   sum(shares) == total always holds.

All functions are pure: Decimals in, {name: Decimal} out. No ORM, no I/O.
"""

from decimal import ROUND_HALF_UP, Decimal

TWO_PLACES = Decimal("0.01")


def round_money(value: Decimal) -> Decimal:
    """The single rounding rule for the whole app: half-up to 2 dp."""
    return value.quantize(TWO_PLACES, rounding=ROUND_HALF_UP)


def _reconcile(shares: dict, total: Decimal) -> dict:
    """
    Force sum(shares) == total by moving the leftover difference one paisa at a
    time across participants in stable (sorted-name) order. The leftover is
    always < 1 paisa per participant, so each gets at most one adjustment.
    """
    diff = total - sum(shares.values())
    if diff == 0:
        return shares
    step = TWO_PLACES if diff > 0 else -TWO_PLACES
    names = sorted(shares)
    i = 0
    while diff != 0:
        shares[names[i % len(names)]] += step
        diff -= step
        i += 1
    return shares


def split_equal(total: Decimal, participants: list[str]) -> dict:
    if not participants:
        raise ValueError("equal split needs at least one participant")
    base = round_money(total / len(participants))
    shares = {name: base for name in participants}
    return _reconcile(shares, total)


def split_unequal(total: Decimal, amounts: dict) -> dict:
    """Explicit per-person amounts. They must already sum to the total —
    a mismatch is a data error the caller must surface, never absorb."""
    if sum(amounts.values()) != total:
        raise ValueError(
            f"unequal split parts sum to {sum(amounts.values())}, expected {total}"
        )
    return {name: round_money(amt) for name, amt in amounts.items()}


def split_percentage(total: Decimal, percents: dict) -> dict:
    """Per-person percentages; must sum to 100 exactly (validated upstream too)."""
    if sum(percents.values()) != Decimal("100"):
        raise ValueError(f"percentages sum to {sum(percents.values())}, expected 100")
    shares = {
        name: round_money(total * pct / Decimal("100")) for name, pct in percents.items()
    }
    return _reconcile(shares, total)


def split_share(total: Decimal, weights: dict) -> dict:
    """Weighted shares, e.g. Rohan 2 / Priya 1: share = total * w / sum(w)."""
    total_weight = sum(weights.values())
    if total_weight <= 0:
        raise ValueError("share split needs a positive total weight")
    shares = {
        name: round_money(total * w / total_weight) for name, w in weights.items()
    }
    return _reconcile(shares, total)


def resolve_split(split_type: str, total: Decimal, participants: list[str], details: dict | None = None) -> dict:
    """Dispatch on split_type. `details` maps name -> number for non-equal types."""
    if split_type == "equal":
        return split_equal(total, participants)
    if split_type == "unequal":
        return split_unequal(total, details or {})
    if split_type == "percentage":
        return split_percentage(total, details or {})
    if split_type == "share":
        return split_share(total, details or {})
    raise ValueError(f"unknown split type: {split_type}")
