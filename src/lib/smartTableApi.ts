import type { AuthError, PostgrestError } from '@supabase/supabase-js'
import { sanitizeFileName, slugify } from './format'
import { supabase } from './supabase'
import type {
  AdminSnapshot,
  ChangeRequestType,
  CustomerSummary,
  DiningTable,
  DiscountType,
  MenuCategory,
  MenuItem,
  Offer,
  PublicMenu,
  RestaurantSettings,
  StaffCallStatus,
  UUID,
} from './types'

type ApiError = PostgrestError | AuthError | Error | null

function fail(error: ApiError, fallback: string): never {
  if (!error) throw new Error(fallback)
  throw new Error(error.message || fallback)
}

async function unwrap<T>(
  promise: PromiseLike<{ data: T | null; error: ApiError }>,
  fallback: string,
) {
  const { data, error } = await promise
  if (error) fail(error, fallback)
  if (data === null) fail(null, fallback)
  return data
}

export async function signInAdmin(email: string, password: string) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password })
  if (error) fail(error, 'Could not sign in.')
  return data
}

export async function signOutAdmin() {
  const { error } = await supabase.auth.signOut()
  if (error) fail(error, 'Could not sign out.')
}

export async function getPublicTable(tableId: UUID) {
  return unwrap(
    supabase
      .from('dining_tables')
      .select('id, table_number, label, seats, qr_token, status, active_session_id, created_at, updated_at')
      .eq('id', tableId)
      .maybeSingle<DiningTable>(),
    'Table was not found.',
  )
}

export async function getPublicMenu(): Promise<PublicMenu> {
  const [settings, categories, items, offers] = await Promise.all([
    supabase.from('restaurant_settings').select('*').maybeSingle<RestaurantSettings>(),
    supabase
      .from('menu_categories')
      .select('*')
      .eq('is_active', true)
      .order('sort_order', { ascending: true })
      .returns<MenuCategory[]>(),
    supabase
      .from('menu_items')
      .select('*')
      .eq('is_available', true)
      .order('name', { ascending: true })
      .returns<MenuItem[]>(),
    supabase
      .from('offers')
      .select('*')
      .eq('is_active', true)
      .order('ends_at', { ascending: true })
      .returns<Offer[]>(),
  ])

  if (settings.error) fail(settings.error, 'Could not load restaurant settings.')
  if (categories.error) fail(categories.error, 'Could not load categories.')
  if (items.error) fail(items.error, 'Could not load menu items.')
  if (offers.error) fail(offers.error, 'Could not load offers.')

  return {
    settings: settings.data,
    categories: categories.data ?? [],
    items: items.data ?? [],
    offers: offers.data ?? [],
  }
}

export async function startTableSession(
  tableId: UUID,
  customerName: string,
  contactNumber: string,
) {
  return unwrap<string>(
    supabase.rpc('start_table_session', {
      p_table_id: tableId,
      p_customer_name: customerName,
      p_contact_number: contactNumber,
    }),
    'Could not occupy table.',
  )
}

export async function placeOrder(
  sessionId: UUID,
  items: Array<{ menu_item_id: UUID; quantity: number; offer_id?: UUID | null }>,
) {
  return unwrap<string>(
    supabase.rpc('place_order', {
      p_session_id: sessionId,
      p_items: items,
    }),
    'Could not place order.',
  )
}

export async function getCustomerSummary(sessionId: UUID) {
  return unwrap<CustomerSummary>(
    supabase.rpc('get_customer_session_summary', {
      p_session_id: sessionId,
    }),
    'Could not load customer order summary.',
  )
}

export async function callStaff(sessionId: UUID, message: string) {
  return unwrap<string>(
    supabase.rpc('call_staff', {
      p_session_id: sessionId,
      p_message: message,
    }),
    'Could not call staff.',
  )
}

export async function requestOrderChange(
  sessionId: UUID,
  orderItemId: UUID,
  requestType: ChangeRequestType,
  requestedQuantity: number | null,
  reason: string,
) {
  return unwrap<string>(
    supabase.rpc('request_order_change', {
      p_session_id: sessionId,
      p_order_item_id: orderItemId,
      p_request_type: requestType,
      p_requested_quantity: requestedQuantity,
      p_reason: reason,
    }),
    'Could not request this change.',
  )
}

export async function getAdminSnapshot(): Promise<AdminSnapshot> {
  const [
    settings,
    tables,
    categories,
    items,
    offers,
    sessions,
    orders,
    orderItems,
    changeRequests,
    staffCalls,
    notifications,
  ] = await Promise.all([
    supabase.from('restaurant_settings').select('*').maybeSingle<RestaurantSettings>(),
    supabase
      .from('dining_tables')
      .select('*')
      .order('table_number', { ascending: true })
      .returns<DiningTable[]>(),
    supabase
      .from('menu_categories')
      .select('*')
      .order('sort_order', { ascending: true })
      .returns<MenuCategory[]>(),
    supabase.from('menu_items').select('*').order('name').returns<MenuItem[]>(),
    supabase.from('offers').select('*').order('ends_at').returns<Offer[]>(),
    supabase.from('customer_sessions').select('*').order('opened_at', { ascending: false }),
    supabase.from('orders').select('*').order('created_at', { ascending: false }),
    supabase.from('order_items').select('*').order('created_at', { ascending: false }),
    supabase
      .from('order_change_requests')
      .select('*')
      .order('created_at', { ascending: false }),
    supabase.from('staff_calls').select('*').order('created_at', { ascending: false }),
    supabase
      .from('notifications')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(50),
  ])

  const responses = [
    settings,
    tables,
    categories,
    items,
    offers,
    sessions,
    orders,
    orderItems,
    changeRequests,
    staffCalls,
    notifications,
  ]
  const failed = responses.find((response) => response.error)
  if (failed?.error) fail(failed.error, 'Could not load admin dashboard.')

  return {
    settings: settings.data,
    tables: tables.data ?? [],
    categories: categories.data ?? [],
    items: items.data ?? [],
    offers: offers.data ?? [],
    sessions: (sessions.data ?? []) as AdminSnapshot['sessions'],
    orders: (orders.data ?? []) as AdminSnapshot['orders'],
    orderItems: (orderItems.data ?? []) as AdminSnapshot['orderItems'],
    changeRequests: (changeRequests.data ?? []) as AdminSnapshot['changeRequests'],
    staffCalls: (staffCalls.data ?? []) as AdminSnapshot['staffCalls'],
    notifications: (notifications.data ?? []) as AdminSnapshot['notifications'],
  }
}

export async function createTable(input: {
  table_number: string
  label: string
  seats: number
}) {
  return unwrap(
    supabase.from('dining_tables').insert(input).select('*').single<DiningTable>(),
    'Could not create table.',
  )
}

export async function updateTableStatus(tableId: UUID, status: DiningTable['status']) {
  return unwrap(
    supabase
      .from('dining_tables')
      .update({ status })
      .eq('id', tableId)
      .select('*')
      .single<DiningTable>(),
    'Could not update table status.',
  )
}

export async function createCategory(input: { name: string; icon?: string; sort_order: number }) {
  return unwrap(
    supabase
      .from('menu_categories')
      .insert({
        name: input.name,
        slug: slugify(input.name),
        icon: input.icon || null,
        sort_order: input.sort_order,
      })
      .select('*')
      .single<MenuCategory>(),
    'Could not create category.',
  )
}

export async function uploadMenuImage(file: File) {
  const fileName = sanitizeFileName(file.name || `menu-${Date.now()}.jpg`)
  const path = `items/${crypto.randomUUID()}-${fileName}`
  const { error } = await supabase.storage.from('menu-images').upload(path, file, {
    cacheControl: '3600',
    upsert: false,
  })
  if (error) fail(error, 'Could not upload menu image.')
  return supabase.storage.from('menu-images').getPublicUrl(path).data.publicUrl
}

export async function createMenuItem(input: {
  category_id: UUID
  name: string
  description: string
  price: number
  image_url: string | null
  prep_time_minutes: number
  tags: string[]
}) {
  return unwrap(
    supabase.from('menu_items').insert(input).select('*').single<MenuItem>(),
    'Could not create item.',
  )
}

export async function updateMenuItem(
  itemId: UUID,
  changes: Partial<
    Pick<MenuItem, 'name' | 'description' | 'price' | 'image_url' | 'is_available'>
  >,
) {
  return unwrap(
    supabase.from('menu_items').update(changes).eq('id', itemId).select('*').single<MenuItem>(),
    'Could not update item.',
  )
}

export async function createOffer(input: {
  item_id: UUID
  title: string
  description: string
  discount_type: DiscountType
  discount_value: number
  ends_at: string
}) {
  return unwrap(
    supabase
      .from('offers')
      .insert({
        ...input,
        starts_at: new Date().toISOString(),
      })
      .select('*')
      .single<Offer>(),
    'Could not create offer.',
  )
}

export async function updateOffer(offerId: UUID, changes: Partial<Pick<Offer, 'is_active'>>) {
  return unwrap(
    supabase.from('offers').update(changes).eq('id', offerId).select('*').single<Offer>(),
    'Could not update offer.',
  )
}

export async function saveSettings(input: {
  restaurant_name: string
  google_review_url: string
}) {
  return unwrap(
    supabase
      .from('restaurant_settings')
      .upsert({
        singleton: true,
        restaurant_name: input.restaurant_name,
        google_review_url: input.google_review_url || null,
      })
      .select('*')
      .single<RestaurantSettings>(),
    'Could not save settings.',
  )
}

export async function markNotificationRead(notificationId: UUID) {
  return unwrap(
    supabase
      .from('notifications')
      .update({ is_read: true })
      .eq('id', notificationId)
      .select('*')
      .single(),
    'Could not mark notification read.',
  )
}

export async function approveChangeRequest(requestId: UUID, adminNote: string) {
  return unwrap(
    supabase.rpc('admin_approve_change_request', {
      p_request_id: requestId,
      p_admin_note: adminNote,
    }),
    'Could not approve request.',
  )
}

export async function rejectChangeRequest(requestId: UUID, adminNote: string) {
  return unwrap(
    supabase.rpc('admin_reject_change_request', {
      p_request_id: requestId,
      p_admin_note: adminNote,
    }),
    'Could not reject request.',
  )
}

export async function closePaidSession(sessionId: UUID) {
  return unwrap(
    supabase.rpc('admin_close_paid_session', {
      p_session_id: sessionId,
    }),
    'Could not close bill.',
  )
}

export async function updateStaffCallStatus(callId: UUID, status: StaffCallStatus) {
  return unwrap(
    supabase
      .from('staff_calls')
      .update({
        status,
        resolved_at: status === 'done' ? new Date().toISOString() : null,
      })
      .eq('id', callId)
      .select('*')
      .single(),
    'Could not update staff call.',
  )
}
