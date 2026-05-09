import type { CartLine, MenuItem, Offer, OrderItem } from './types'

export function isOfferLive(offer: Offer | undefined, now = new Date()) {
  if (!offer?.is_active) return false
  const start = new Date(offer.starts_at).getTime()
  const end = new Date(offer.ends_at).getTime()
  const current = now.getTime()
  return start <= current && current <= end
}

export function getOfferUnitPrice(item: MenuItem, offer?: Offer, now = new Date()) {
  if (!isOfferLive(offer, now)) return Number(item.price)
  const price = Number(item.price)
  const value = Number(offer?.discount_value ?? 0)
  if (offer?.discount_type === 'percentage') {
    return Math.max(0, roundMoney(price - price * (value / 100)))
  }
  if (offer?.discount_type === 'fixed') {
    return Math.max(0, roundMoney(price - value))
  }
  return Math.max(0, roundMoney(value))
}

export function calculateCartLine(line: CartLine, now = new Date()) {
  const originalUnitPrice = Number(line.item.price)
  const unitPrice = getOfferUnitPrice(line.item, line.offer, now)
  const quantity = Math.max(1, Number(line.quantity) || 1)
  const lineTotal = roundMoney(unitPrice * quantity)
  const savingsTotal = roundMoney(Math.max(0, originalUnitPrice - unitPrice) * quantity)
  return {
    originalUnitPrice,
    unitPrice,
    quantity,
    lineTotal,
    savingsTotal,
  }
}

export function calculateBill(items: Pick<OrderItem, 'line_total' | 'savings_total' | 'status'>[]) {
  return items.reduce(
    (totals, item) => {
      if (item.status === 'cancelled') return totals
      return {
        due: roundMoney(totals.due + Number(item.line_total)),
        saved: roundMoney(totals.saved + Number(item.savings_total)),
      }
    },
    { due: 0, saved: 0 },
  )
}

export function roundMoney(value: number) {
  return Math.round((Number(value) + Number.EPSILON) * 100) / 100
}
