import { describe, expect, it } from 'vitest'
import { calculateBill, calculateCartLine, getOfferUnitPrice, isOfferLive } from '../../src/lib/pricing'
import type { MenuItem, Offer, OrderItem } from '../../src/lib/types'

const item: MenuItem = {
  id: 'item-1',
  category_id: 'cat-1',
  name: 'Coca Cola',
  description: 'Cold drink',
  price: 120,
  image_url: null,
  prep_time_minutes: 5,
  is_available: true,
  tags: [],
  created_at: '2026-05-09T00:00:00.000Z',
  updated_at: '2026-05-09T00:00:00.000Z',
}

const liveOffer: Offer = {
  id: 'offer-1',
  item_id: 'item-1',
  title: 'Cold drink deal',
  description: null,
  discount_type: 'percentage',
  discount_value: 25,
  starts_at: '2026-05-09T00:00:00.000Z',
  ends_at: '2026-05-10T00:00:00.000Z',
  is_active: true,
  created_at: '2026-05-09T00:00:00.000Z',
  updated_at: '2026-05-09T00:00:00.000Z',
}

describe('pricing helpers', () => {
  it('detects live offers by active flag and time window', () => {
    expect(isOfferLive(liveOffer, new Date('2026-05-09T12:00:00.000Z'))).toBe(true)
    expect(isOfferLive(liveOffer, new Date('2026-05-11T12:00:00.000Z'))).toBe(false)
    expect(isOfferLive({ ...liveOffer, is_active: false }, new Date('2026-05-09T12:00:00.000Z'))).toBe(false)
  })

  it('calculates percentage, fixed, and final-price offers', () => {
    const now = new Date('2026-05-09T12:00:00.000Z')
    expect(getOfferUnitPrice(item, liveOffer, now)).toBe(90)
    expect(getOfferUnitPrice(item, { ...liveOffer, discount_type: 'fixed', discount_value: 20 }, now)).toBe(100)
    expect(getOfferUnitPrice(item, { ...liveOffer, discount_type: 'price_override', discount_value: 75 }, now)).toBe(75)
  })

  it('calculates cart line totals and customer savings', () => {
    const totals = calculateCartLine(
      {
        item,
        offer: liveOffer,
        quantity: 3,
      },
      new Date('2026-05-09T12:00:00.000Z'),
    )

    expect(totals.unitPrice).toBe(90)
    expect(totals.lineTotal).toBe(270)
    expect(totals.savingsTotal).toBe(90)
  })

  it('excludes cancelled items from the bill', () => {
    const rows: Array<Pick<OrderItem, 'line_total' | 'savings_total' | 'status'>> = [
      { line_total: 270, savings_total: 90, status: 'placed' },
      { line_total: 120, savings_total: 0, status: 'cancelled' },
      { line_total: 180, savings_total: 20, status: 'change_pending' },
    ]

    expect(calculateBill(rows)).toEqual({ due: 450, saved: 110 })
  })
})
