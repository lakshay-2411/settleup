// Keyword → category icon so the activity feed reads visually, not as text.

import {
  Bike,
  Home,
  type LucideIcon,
  PartyPopper,
  Plane,
  Receipt,
  ShoppingCart,
  Sparkles,
  UtensilsCrossed,
  Wallet,
  Wifi,
  Zap,
} from 'lucide-react'

const RULES: Array<[RegExp, LucideIcon]> = [
  [/rent|deposit|room/i, Home],
  [/dinner|lunch|brunch|pizza|snack|swiggy|restaurant|cake|drink/i, UtensilsCrossed],
  [/flight|cab|taxi|airport|travel|villa|hotel/i, Plane],
  [/wifi|internet|broadband/i, Wifi],
  [/electricity|power|cylinder|gas/i, Zap],
  [/grocer|mart|basket|supplies/i, ShoppingCart],
  [/clean|maid|salary/i, Sparkles],
  [/scooter|bike|rental/i, Bike],
  [/party|housewarming|farewell|movie|parasail/i, PartyPopper],
  [/paid|settle|refund/i, Wallet],
]

export function categoryIcon(description: string): LucideIcon {
  for (const [pattern, icon] of RULES) {
    if (pattern.test(description)) return icon
  }
  return Receipt
}
