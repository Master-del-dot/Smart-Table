export type UUID = string

export type TableStatus = 'available' | 'occupied' | 'cleaning' | 'disabled'
export type OrderItemStatus =
  | 'placed'
  | 'change_pending'
  | 'cancel_pending'
  | 'cancelled'
export type ChangeRequestStatus = 'pending' | 'approved' | 'rejected'
export type ChangeRequestType = 'cancel' | 'update_quantity'
export type StaffCallStatus = 'pending' | 'acknowledged' | 'done'
export type SessionStatus = 'active' | 'paid' | 'closed'
export type DiscountType = 'percentage' | 'fixed' | 'price_override'

export interface AdminProfile {
  user_id: UUID
  full_name: string | null
  role: 'admin'
  created_at: string
}

export interface RestaurantSettings {
  singleton: boolean
  restaurant_name: string
  google_review_url: string | null
  updated_at: string
}

export interface DiningTable {
  id: UUID
  table_number: string
  label: string | null
  seats: number
  qr_token: string
  status: TableStatus
  active_session_id: UUID | null
  created_at: string
  updated_at: string
}

export interface MenuCategory {
  id: UUID
  name: string
  slug: string
  icon: string | null
  sort_order: number
  is_active: boolean
  is_system: boolean
  created_at: string
  updated_at: string
}

export interface MenuItem {
  id: UUID
  category_id: UUID
  name: string
  description: string | null
  price: number
  image_url: string | null
  prep_time_minutes: number | null
  is_available: boolean
  tags: string[] | null
  created_at: string
  updated_at: string
}

export interface Offer {
  id: UUID
  item_id: UUID
  title: string
  description: string | null
  discount_type: DiscountType
  discount_value: number
  starts_at: string
  ends_at: string
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface CustomerSession {
  id: UUID
  table_id: UUID
  customer_name: string
  contact_number: string
  status: SessionStatus
  opened_at: string
  paid_at: string | null
  closed_at: string | null
}

export interface Order {
  id: UUID
  session_id: UUID
  table_id: UUID
  order_number: number
  status: string
  total_amount: number
  savings_amount: number
  created_at: string
  updated_at: string
}

export interface OrderItem {
  id: UUID
  order_id: UUID
  menu_item_id: UUID | null
  offer_id: UUID | null
  item_name: string
  unit_price: number
  original_unit_price: number
  quantity: number
  line_total: number
  savings_total: number
  status: OrderItemStatus
  created_at: string
  updated_at: string
}

export interface OrderChangeRequest {
  id: UUID
  session_id: UUID
  order_item_id: UUID
  request_type: ChangeRequestType
  requested_quantity: number | null
  reason: string | null
  status: ChangeRequestStatus
  admin_note: string | null
  resolved_at: string | null
  created_at: string
}

export interface StaffCall {
  id: UUID
  session_id: UUID
  table_id: UUID
  customer_name: string
  contact_number: string
  message: string
  status: StaffCallStatus
  created_at: string
  resolved_at: string | null
}

export interface Notification {
  id: UUID
  type: string
  title: string
  message: string
  table_id: UUID | null
  session_id: UUID | null
  order_id: UUID | null
  staff_call_id: UUID | null
  change_request_id: UUID | null
  is_read: boolean
  created_at: string
}

export interface PublicMenu {
  categories: MenuCategory[]
  items: MenuItem[]
  offers: Offer[]
  settings: RestaurantSettings | null
}

export interface CustomerSummary {
  session: CustomerSession
  table: DiningTable
  orders: Array<Order & { items: OrderItem[] }>
  change_requests: OrderChangeRequest[]
  staff_calls: StaffCall[]
  settings: RestaurantSettings | null
  totals: {
    due: number
    saved: number
  }
}

export interface AdminSnapshot {
  settings: RestaurantSettings | null
  tables: DiningTable[]
  categories: MenuCategory[]
  items: MenuItem[]
  offers: Offer[]
  sessions: CustomerSession[]
  orders: Order[]
  orderItems: OrderItem[]
  changeRequests: OrderChangeRequest[]
  staffCalls: StaffCall[]
  notifications: Notification[]
}

export interface CartLine {
  item: MenuItem
  offer?: Offer
  quantity: number
}
