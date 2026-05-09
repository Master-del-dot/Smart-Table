import type { Session } from '@supabase/supabase-js'
import clsx from 'clsx'
import {
  Bell,
  Check,
  Clock,
  CreditCard,
  Download,
  Image as ImageIcon,
  Loader2,
  LogOut,
  Minus,
  Phone,
  Plus,
  QrCode,
  ReceiptText,
  RefreshCw,
  Search,
  Settings,
  Shield,
  Star,
  Tag,
  Trash2,
  Utensils,
  X,
  type LucideIcon,
} from 'lucide-react'
import * as QRCode from 'qrcode'
import { useCallback, useEffect, useMemo, useState } from 'react'
import type { FormEvent, ReactNode } from 'react'
import {
  approveChangeRequest,
  callStaff,
  closePaidSession,
  createCategory,
  createMenuItem,
  createOffer,
  createTable,
  getAdminSnapshot,
  getCustomerSummary,
  getPublicMenu,
  getPublicTable,
  placeOrder,
  rejectChangeRequest,
  requestOrderChange,
  saveSettings,
  signInAdmin,
  signOutAdmin,
  startTableSession,
  updateMenuItem,
  updateOffer,
  updateStaffCallStatus,
  updateTableStatus,
  uploadMenuImage,
} from './lib/smartTableApi'
import { FALLBACK_IMAGE, SPECIAL_TABS } from './lib/constants'
import { formatDateTime, formatMoney, getCountdownLabel } from './lib/format'
import { calculateBill, calculateCartLine, getOfferUnitPrice, isOfferLive } from './lib/pricing'
import { supabase, supabaseProject } from './lib/supabase'
import type {
  AdminSnapshot,
  CartLine,
  ChangeRequestType,
  CustomerSummary,
  DiningTable,
  DiscountType,
  MenuItem,
  Notification,
  Offer,
  PublicMenu,
  UUID,
} from './lib/types'

type Route =
  | { name: 'admin' }
  | { name: 'table'; tableId: UUID }
  | { name: 'home' }

type Toast = {
  id: number
  message: string
  tone: 'success' | 'error' | 'info'
}

type Notify = (message: string, tone?: Toast['tone']) => void

type AdminTab =
  | 'dashboard'
  | 'tables'
  | 'menu'
  | 'offers'
  | 'orders'
  | 'staff'
  | 'requests'
  | 'settings'

const adminTabs: Array<{ id: AdminTab; label: string; icon: LucideIcon }> = [
  { id: 'dashboard', label: 'Dashboard', icon: Utensils },
  { id: 'tables', label: 'Tables', icon: QrCode },
  { id: 'menu', label: 'Menu', icon: ReceiptText },
  { id: 'offers', label: 'Offers', icon: Tag },
  { id: 'orders', label: 'Orders', icon: CreditCard },
  { id: 'staff', label: 'Staff Calls', icon: Phone },
  { id: 'requests', label: 'Requests', icon: Bell },
  { id: 'settings', label: 'Settings', icon: Settings },
]

function parseRoute(): Route {
  const hash = window.location.hash.replace(/^#\/?/, '')
  if (!hash || hash === '/') return { name: 'home' }
  if (hash === 'admin') return { name: 'admin' }
  const tableMatch = hash.match(/^table\/([^/?#]+)/)
  if (tableMatch?.[1]) return { name: 'table', tableId: tableMatch[1] }
  return { name: 'home' }
}

function useRoute() {
  const [route, setRoute] = useState<Route>(() => parseRoute())
  useEffect(() => {
    const handleHashChange = () => setRoute(parseRoute())
    window.addEventListener('hashchange', handleHashChange)
    return () => window.removeEventListener('hashchange', handleHashChange)
  }, [])
  return route
}

function useToasts() {
  const [toasts, setToasts] = useState<Toast[]>([])
  const notify = useCallback<Notify>((message, tone = 'success') => {
    const id = Date.now() + Math.random()
    setToasts((current) => [...current, { id, message, tone }])
    window.setTimeout(() => {
      setToasts((current) => current.filter((toast) => toast.id !== id))
    }, 4200)
  }, [])
  const removeToast = (id: number) => {
    setToasts((current) => current.filter((toast) => toast.id !== id))
  }
  return { toasts, notify, removeToast }
}

function useNow() {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const interval = window.setInterval(() => setNow(new Date()), 1000)
    return () => window.clearInterval(interval)
  }, [])
  return now
}

function App() {
  const route = useRoute()
  const { toasts, notify, removeToast } = useToasts()

  return (
    <>
      {route.name === 'admin' && <AdminApp notify={notify} />}
      {route.name === 'table' && <CustomerApp notify={notify} tableId={route.tableId} />}
      {route.name === 'home' && <HomeApp />}
      <ToastTray toasts={toasts} onRemove={removeToast} />
    </>
  )
}

function HomeApp() {
  return (
    <main className="home-shell">
      <section className="home-hero">
        <div>
          <p className="eyebrow">Smart Table</p>
          <h1>Restaurant ordering, table by table.</h1>
          <p className="home-copy">
            Open the admin dashboard to create tables and QR codes, or scan a
            generated QR to start a customer order session.
          </p>
          <div className="home-actions">
            <a className="primary-button" href="#/admin">
              <Shield size={18} />
              Admin dashboard
            </a>
          </div>
        </div>
        <div className="home-preview" aria-label="Smart Table preview">
          <div className="preview-bar">
            <span />
            <span />
            <span />
          </div>
          <div className="preview-grid">
            <div />
            <div />
            <div />
            <div />
          </div>
        </div>
      </section>
    </main>
  )
}

function AdminApp({ notify }: { notify: Notify }) {
  const [session, setSession] = useState<Session | null>(null)
  const [snapshot, setSnapshot] = useState<AdminSnapshot | null>(null)
  const [activeTab, setActiveTab] = useState<AdminTab>('dashboard')
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState('')

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setLoading(false)
    })
    const { data } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession)
    })
    return () => data.subscription.unsubscribe()
  }, [])

  const refresh = useCallback(async () => {
    if (!session) return
    setLoading(true)
    try {
      setSnapshot(await getAdminSnapshot())
      setError('')
    } catch (caught) {
      setError(getErrorMessage(caught))
    } finally {
      setLoading(false)
    }
  }, [session])

  useEffect(() => {
    const timeout = window.setTimeout(() => void refresh(), 0)
    return () => window.clearTimeout(timeout)
  }, [refresh])

  useEffect(() => {
    if (!session) return undefined
    const channel = supabase
      .channel('smart-table-admin')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'notifications' },
        (payload) => {
          const notification = payload.new as Notification
          notify(notification.message || notification.title, 'info')
          void refresh()
        },
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'orders' },
        () => void refresh(),
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'staff_calls' },
        () => void refresh(),
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'order_change_requests' },
        () => void refresh(),
      )
      .subscribe()

    return () => {
      void supabase.removeChannel(channel)
    }
  }, [notify, refresh, session])

  async function runAction(success: string, action: () => Promise<unknown>) {
    setBusy(success)
    try {
      await action()
      notify(success)
      await refresh()
    } catch (caught) {
      notify(getErrorMessage(caught), 'error')
    } finally {
      setBusy('')
    }
  }

  if (!session) {
    return <AdminLogin notify={notify} loading={loading} />
  }

  const unread = snapshot?.notifications.filter((item) => !item.is_read).length ?? 0

  return (
    <main className="admin-shell">
      <aside className="sidebar">
        <div className="brand-lockup">
          <div className="brand-mark">
            <Utensils size={22} />
          </div>
          <div>
            <strong>{snapshot?.settings?.restaurant_name ?? 'Smart Table'}</strong>
            <span>Admin control</span>
          </div>
        </div>
        <nav className="side-nav" aria-label="Admin sections">
          {adminTabs.map((tab) => {
            const Icon = tab.icon
            return (
              <button
                className={clsx('side-nav-button', activeTab === tab.id && 'active')}
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                type="button"
              >
                <Icon size={18} />
                <span>{tab.label}</span>
                {tab.id === 'requests' && unread > 0 && <b>{unread}</b>}
              </button>
            )
          })}
        </nav>
        <button
          className="ghost-button full-width"
          onClick={() => void signOutAdmin()}
          type="button"
        >
          <LogOut size={17} />
          Sign out
        </button>
      </aside>

      <section className="workspace">
        <header className="topbar">
          <div>
            <p className="eyebrow">Live restaurant workspace</p>
            <h1>{getAdminTitle(activeTab)}</h1>
          </div>
          <label className="search-box">
            <Search size={18} />
            <input
              aria-label="Search dashboard"
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search table, item, customer, order..."
              value={search}
            />
          </label>
          <button className="icon-button" onClick={() => void refresh()} title="Refresh" type="button">
            {loading ? <Loader2 className="spin" size={18} /> : <RefreshCw size={18} />}
          </button>
        </header>

        {busy && <div className="action-strip">{busy}</div>}
        {error && <SetupNotice message={error} />}
        {snapshot && search.trim() && <SearchResults query={search} snapshot={snapshot} />}
        {loading && !snapshot && <LoadingPanel label="Loading admin dashboard" />}
        {snapshot && (
          <>
            {activeTab === 'dashboard' && <AdminDashboard snapshot={snapshot} />}
            {activeTab === 'tables' && (
              <AdminTables
                onRun={runAction}
                snapshot={snapshot}
              />
            )}
            {activeTab === 'menu' && (
              <AdminMenu onRun={runAction} snapshot={snapshot} />
            )}
            {activeTab === 'offers' && (
              <AdminOffers onRun={runAction} snapshot={snapshot} />
            )}
            {activeTab === 'orders' && (
              <AdminOrders onRun={runAction} snapshot={snapshot} />
            )}
            {activeTab === 'staff' && (
              <AdminStaff onRun={runAction} snapshot={snapshot} />
            )}
            {activeTab === 'requests' && (
              <AdminRequests onRun={runAction} snapshot={snapshot} />
            )}
            {activeTab === 'settings' && (
              <AdminSettings onRun={runAction} snapshot={snapshot} />
            )}
          </>
        )}
      </section>
    </main>
  )
}

function AdminLogin({ loading, notify }: { loading: boolean; notify: Notify }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    setBusy(true)
    try {
      await signInAdmin(email, password)
      notify('Admin signed in.')
    } catch (caught) {
      notify(getErrorMessage(caught), 'error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="login-shell">
      <section className="auth-panel">
        <div className="brand-lockup">
          <div className="brand-mark">
            <Shield size={22} />
          </div>
          <div>
            <strong>Smart Table Admin</strong>
            <span>Protected by Supabase Auth</span>
          </div>
        </div>
        <h1>Sign in to manage tables, menu, orders, and staff calls.</h1>
        <form className="stack-form" onSubmit={(event) => void handleSubmit(event)}>
          <label>
            Email
            <input
              autoComplete="email"
              onChange={(event) => setEmail(event.target.value)}
              required
              type="email"
              value={email}
            />
          </label>
          <label>
            Password
            <input
              autoComplete="current-password"
              onChange={(event) => setPassword(event.target.value)}
              required
              type="password"
              value={password}
            />
          </label>
          <button className="primary-button" disabled={busy || loading} type="submit">
            {busy ? <Loader2 className="spin" size={18} /> : <Shield size={18} />}
            Sign in
          </button>
        </form>
        <p className="fine-print">
          Run <code>supabase/schema.sql</code>, create an Auth user, then run the
          admin promotion snippet at the bottom of that SQL file.
        </p>
      </section>
    </main>
  )
}

function AdminDashboard({ snapshot }: { snapshot: AdminSnapshot }) {
  const activeSessions = snapshot.sessions.filter((session) => session.status === 'active')
  const activeItems = snapshot.orderItems.filter((item) => item.status !== 'cancelled')
  const totals = calculateBill(activeItems)
  const pendingRequests = snapshot.changeRequests.filter((request) => request.status === 'pending')
  const pendingStaff = snapshot.staffCalls.filter((call) => call.status !== 'done')

  return (
    <div className="content-grid">
      <Stat label="Occupied tables" value={String(activeSessions.length)} icon={QrCode} />
      <Stat label="Open orders" value={String(snapshot.orders.length)} icon={ReceiptText} />
      <Stat label="Pending requests" value={String(pendingRequests.length)} icon={Bell} />
      <Stat label="Live bill value" value={formatMoney(totals.due)} icon={CreditCard} />

      <section className="panel wide">
        <PanelHeader
          eyebrow="Notifications"
          title="Latest activity"
          icon={<Bell size={18} />}
        />
        <div className="activity-list">
          {snapshot.notifications.slice(0, 8).map((notification) => (
            <div className="activity-row" key={notification.id}>
              <span className={clsx('dot', !notification.is_read && 'hot')} />
              <div>
                <strong>{notification.title}</strong>
                <p>{notification.message}</p>
              </div>
              <time>{formatDateTime(notification.created_at)}</time>
            </div>
          ))}
          {snapshot.notifications.length === 0 && (
            <EmptyState label="No notifications yet." icon={<Bell size={24} />} />
          )}
        </div>
      </section>

      <section className="panel">
        <PanelHeader eyebrow="Floor" title="Table status" icon={<QrCode size={18} />} />
        <div className="mini-table-grid">
          {snapshot.tables.map((table) => (
            <div className={clsx('table-chip', table.status)} key={table.id}>
              <strong>Table {table.table_number}</strong>
              <span>{table.status}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="panel">
        <PanelHeader eyebrow="Service" title="Staff queue" icon={<Phone size={18} />} />
        <div className="activity-list compact">
          {pendingStaff.slice(0, 6).map((call) => (
            <div className="activity-row" key={call.id}>
              <Phone size={16} />
              <div>
                <strong>{call.customer_name}</strong>
                <p>{call.message}</p>
              </div>
              <Badge tone={call.status === 'pending' ? 'warning' : 'info'}>{call.status}</Badge>
            </div>
          ))}
          {pendingStaff.length === 0 && (
            <EmptyState label="No staff calls waiting." icon={<Phone size={24} />} />
          )}
        </div>
      </section>
    </div>
  )
}

function AdminTables({
  onRun,
  snapshot,
}: {
  onRun: (message: string, action: () => Promise<unknown>) => Promise<void>
  snapshot: AdminSnapshot
}) {
  const [tableNumber, setTableNumber] = useState('')
  const [label, setLabel] = useState('')
  const [seats, setSeats] = useState(4)

  async function handleCreate(event: FormEvent) {
    event.preventDefault()
    await onRun('Table created.', async () => {
      await createTable({
        table_number: tableNumber.trim(),
        label: label.trim(),
        seats,
      })
      setTableNumber('')
      setLabel('')
      setSeats(4)
    })
  }

  return (
    <div className="split-layout">
      <section className="panel">
        <PanelHeader eyebrow="Tables" title="Create table QR" icon={<QrCode size={18} />} />
        <form className="stack-form" onSubmit={(event) => void handleCreate(event)}>
          <label>
            Table number
            <input
              onChange={(event) => setTableNumber(event.target.value)}
              placeholder="1, 2, VIP-1"
              required
              value={tableNumber}
            />
          </label>
          <label>
            Label
            <input
              onChange={(event) => setLabel(event.target.value)}
              placeholder="Window side"
              value={label}
            />
          </label>
          <label>
            Seats
            <input
              min={1}
              onChange={(event) => setSeats(Number(event.target.value))}
              type="number"
              value={seats}
            />
          </label>
          <button className="primary-button" type="submit">
            <Plus size={18} />
            Generate QR table
          </button>
        </form>
      </section>

      <section className="panel wide-panel">
        <PanelHeader eyebrow="Generated QR codes" title="Table list" icon={<QrCode size={18} />} />
        <div className="table-list">
          {snapshot.tables.map((table) => (
            <div className="table-row" key={table.id}>
              <QrPreview table={table} />
              <div className="table-row-body">
                <strong>Table {table.table_number}</strong>
                <p>{table.label || 'No label'} - {table.seats} seats</p>
                <Badge tone={table.status === 'occupied' ? 'warning' : 'success'}>
                  {table.status}
                </Badge>
              </div>
              <select
                aria-label={`Change status for table ${table.table_number}`}
                onChange={(event) =>
                  void onRun('Table status updated.', () =>
                    updateTableStatus(table.id, event.target.value as DiningTable['status']),
                  )
                }
                value={table.status}
              >
                <option value="available">Available</option>
                <option value="occupied">Occupied</option>
                <option value="cleaning">Cleaning</option>
                <option value="disabled">Disabled</option>
              </select>
            </div>
          ))}
          {snapshot.tables.length === 0 && (
            <EmptyState label="Create your first table to generate a QR." icon={<QrCode size={24} />} />
          )}
        </div>
      </section>
    </div>
  )
}

function QrPreview({ table }: { table: DiningTable }) {
  const [qr, setQr] = useState('')
  const url = getCustomerTableUrl(table.id)

  useEffect(() => {
    QRCode.toDataURL(url, { margin: 1, width: 180 })
      .then(setQr)
      .catch(() => setQr(''))
  }, [url])

  return (
    <div className="qr-preview">
      {qr ? <img alt={`QR for table ${table.table_number}`} src={qr} /> : <QrCode size={44} />}
      <a className="icon-button" download={`table-${table.table_number}-qr.png`} href={qr} title="Download QR">
        <Download size={16} />
      </a>
    </div>
  )
}

function AdminMenu({
  onRun,
  snapshot,
}: {
  onRun: (message: string, action: () => Promise<unknown>) => Promise<void>
  snapshot: AdminSnapshot
}) {
  const [categoryName, setCategoryName] = useState('')
  const [categoryIcon, setCategoryIcon] = useState('Utensils')
  const [itemCategory, setItemCategory] = useState(snapshot.categories[0]?.id ?? '')
  const [itemName, setItemName] = useState('')
  const [description, setDescription] = useState('')
  const [price, setPrice] = useState(0)
  const [prepTime, setPrepTime] = useState(10)
  const [tags, setTags] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const selectedItemCategory = itemCategory || snapshot.categories[0]?.id || ''

  async function handleCategory(event: FormEvent) {
    event.preventDefault()
    await onRun('Category created.', async () => {
      await createCategory({
        name: categoryName,
        icon: categoryIcon,
        sort_order: snapshot.categories.length + 1,
      })
      setCategoryName('')
    })
  }

  async function handleItem(event: FormEvent) {
    event.preventDefault()
    await onRun('Menu item saved.', async () => {
      const imageUrl = file ? await uploadMenuImage(file) : null
      await createMenuItem({
        category_id: selectedItemCategory,
        name: itemName,
        description,
        price,
        image_url: imageUrl,
        prep_time_minutes: prepTime,
        tags: tags
          .split(',')
          .map((tag) => tag.trim())
          .filter(Boolean),
      })
      setItemName('')
      setDescription('')
      setPrice(0)
      setPrepTime(10)
      setTags('')
      setFile(null)
    })
  }

  return (
    <div className="content-grid two-column">
      <section className="panel">
        <PanelHeader eyebrow="Navigation" title="Add section" icon={<Plus size={18} />} />
        <form className="stack-form" onSubmit={(event) => void handleCategory(event)}>
          <label>
            Section name
            <input
              onChange={(event) => setCategoryName(event.target.value)}
              placeholder="Drinks, Desserts, Meals"
              required
              value={categoryName}
            />
          </label>
          <label>
            Icon label
            <input
              onChange={(event) => setCategoryIcon(event.target.value)}
              placeholder="CupSoda"
              value={categoryIcon}
            />
          </label>
          <button className="primary-button" type="submit">
            <Plus size={18} />
            Add section
          </button>
        </form>
      </section>

      <section className="panel">
        <PanelHeader eyebrow="Menu item" title="Add product" icon={<ImageIcon size={18} />} />
        <form className="stack-form" onSubmit={(event) => void handleItem(event)}>
          <label>
            Section
            <select
              onChange={(event) => setItemCategory(event.target.value)}
              required
              value={selectedItemCategory}
            >
              {snapshot.categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Item name
            <input
              onChange={(event) => setItemName(event.target.value)}
              placeholder="Coca Cola"
              required
              value={itemName}
            />
          </label>
          <label>
            Details
            <textarea
              onChange={(event) => setDescription(event.target.value)}
              placeholder="Cold drink, size, ingredients"
              value={description}
            />
          </label>
          <div className="form-grid">
            <label>
              Price
              <input
                min={0}
                onChange={(event) => setPrice(Number(event.target.value))}
                required
                step="0.01"
                type="number"
                value={price}
              />
            </label>
            <label>
              Prep mins
              <input
                min={0}
                onChange={(event) => setPrepTime(Number(event.target.value))}
                type="number"
                value={prepTime}
              />
            </label>
          </div>
          <label>
            Tags
            <input
              onChange={(event) => setTags(event.target.value)}
              placeholder="cold, popular"
              value={tags}
            />
          </label>
          <label>
            Product image
            <input
              accept="image/*"
              onChange={(event) => setFile(event.target.files?.[0] ?? null)}
              type="file"
            />
          </label>
          <button className="primary-button" disabled={!selectedItemCategory} type="submit">
            <Plus size={18} />
            Add item
          </button>
        </form>
      </section>

      <section className="panel wide">
        <PanelHeader eyebrow="Catalog" title="Current menu" icon={<ReceiptText size={18} />} />
        <div className="menu-admin-grid">
          {snapshot.items.map((item) => {
            const category = snapshot.categories.find((entry) => entry.id === item.category_id)
            return (
              <article className="item-admin-card" key={item.id}>
                <img alt="" src={item.image_url || FALLBACK_IMAGE} />
                <div>
                  <strong>{item.name}</strong>
                  <p>{category?.name ?? 'Uncategorized'} - {formatMoney(item.price)}</p>
                  <span>{item.description || 'No description added.'}</span>
                </div>
                <button
                  className={clsx('pill-button', item.is_available ? 'success' : 'muted')}
                  onClick={() =>
                    void onRun('Item availability updated.', () =>
                      updateMenuItem(item.id, { is_available: !item.is_available }),
                    )
                  }
                  type="button"
                >
                  {item.is_available ? 'Available' : 'Hidden'}
                </button>
              </article>
            )
          })}
        </div>
      </section>
    </div>
  )
}

function AdminOffers({
  onRun,
  snapshot,
}: {
  onRun: (message: string, action: () => Promise<unknown>) => Promise<void>
  snapshot: AdminSnapshot
}) {
  const now = useNow()
  const [itemId, setItemId] = useState(snapshot.items[0]?.id ?? '')
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [discountType, setDiscountType] = useState<DiscountType>('percentage')
  const [discountValue, setDiscountValue] = useState(10)
  const [endsAt, setEndsAt] = useState(getDefaultOfferEnd())
  const [search, setSearch] = useState('')

  const filteredItems = snapshot.items.filter((item) =>
    item.name.toLowerCase().includes(search.toLowerCase()),
  )
  const selectedOfferItemId = filteredItems.some((item) => item.id === itemId)
    ? itemId
    : (filteredItems[0]?.id ?? '')

  async function handleOffer(event: FormEvent) {
    event.preventDefault()
    await onRun('Offer created.', async () => {
      await createOffer({
        item_id: selectedOfferItemId,
        title,
        description,
        discount_type: discountType,
        discount_value: discountValue,
        ends_at: new Date(endsAt).toISOString(),
      })
      setTitle('')
      setDescription('')
      setDiscountValue(10)
      setEndsAt(getDefaultOfferEnd())
    })
  }

  return (
    <div className="split-layout">
      <section className="panel">
        <PanelHeader eyebrow="Offer builder" title="Set discount" icon={<Tag size={18} />} />
        <form className="stack-form" onSubmit={(event) => void handleOffer(event)}>
          <label>
            Search item
            <input
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search Coca Cola"
              value={search}
            />
          </label>
          <label>
            Item
            <select onChange={(event) => setItemId(event.target.value)} required value={selectedOfferItemId}>
              {filteredItems.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name} - {formatMoney(item.price)}
                </option>
              ))}
            </select>
          </label>
          <label>
            Offer title
            <input
              onChange={(event) => setTitle(event.target.value)}
              placeholder="Happy Hour Coke"
              required
              value={title}
            />
          </label>
          <label>
            Offer detail
            <textarea
              onChange={(event) => setDescription(event.target.value)}
              placeholder="Limited time cold drink offer"
              value={description}
            />
          </label>
          <div className="form-grid">
            <label>
              Discount type
              <select
                onChange={(event) => setDiscountType(event.target.value as DiscountType)}
                value={discountType}
              >
                <option value="percentage">Percentage off</option>
                <option value="fixed">Fixed Rs. off</option>
                <option value="price_override">Final price</option>
              </select>
            </label>
            <label>
              Value
              <input
                min={0}
                onChange={(event) => setDiscountValue(Number(event.target.value))}
                required
                step="0.01"
                type="number"
                value={discountValue}
              />
            </label>
          </div>
          <label>
            Ends at
            <input
              onChange={(event) => setEndsAt(event.target.value)}
              required
              type="datetime-local"
              value={endsAt}
            />
          </label>
          <button className="primary-button" disabled={!selectedOfferItemId} type="submit">
            <Tag size={18} />
            Publish offer
          </button>
        </form>
      </section>

      <section className="panel wide-panel">
        <PanelHeader eyebrow="Live offers" title="Countdown board" icon={<Clock size={18} />} />
        <div className="offer-list">
          {snapshot.offers.map((offer) => {
            const item = snapshot.items.find((entry) => entry.id === offer.item_id)
            const unit = item ? getOfferUnitPrice(item, offer, now) : 0
            return (
              <article className="offer-admin-card" key={offer.id}>
                <div>
                  <Badge tone={isOfferLive(offer, now) ? 'success' : 'muted'}>
                    {getCountdownLabel(offer.ends_at, now)}
                  </Badge>
                  <h3>{offer.title}</h3>
                  <p>{item?.name ?? 'Missing item'}</p>
                </div>
                <div className="price-stack">
                  <span>{item ? formatMoney(item.price) : '-'}</span>
                  <strong>{formatMoney(unit)}</strong>
                </div>
                <button
                  className="ghost-button"
                  onClick={() =>
                    void onRun('Offer updated.', () =>
                      updateOffer(offer.id, { is_active: !offer.is_active }),
                    )
                  }
                  type="button"
                >
                  {offer.is_active ? <X size={16} /> : <Check size={16} />}
                  {offer.is_active ? 'Disable' : 'Enable'}
                </button>
              </article>
            )
          })}
        </div>
      </section>
    </div>
  )
}

function AdminOrders({
  onRun,
  snapshot,
}: {
  onRun: (message: string, action: () => Promise<unknown>) => Promise<void>
  snapshot: AdminSnapshot
}) {
  const orderRows = snapshot.orders.map((order) => ({
    order,
    session: snapshot.sessions.find((session) => session.id === order.session_id),
    table: snapshot.tables.find((table) => table.id === order.table_id),
    items: snapshot.orderItems.filter((item) => item.order_id === order.id),
  }))

  return (
    <section className="panel">
      <PanelHeader eyebrow="Orders" title="Kitchen and bill queue" icon={<ReceiptText size={18} />} />
      <div className="order-list">
        {orderRows.map((row) => {
          const totals = calculateBill(row.items)
          return (
            <article className="order-card" key={row.order.id}>
              <div className="order-card-header">
                <div>
                  <Badge tone="info">Order #{row.order.order_number}</Badge>
                  <h3>Table {row.table?.table_number ?? 'Unknown'}</h3>
                  <p>{row.session?.customer_name ?? 'Guest'} - {formatDateTime(row.order.created_at)}</p>
                </div>
                <div className="price-stack">
                  <span>Saved {formatMoney(totals.saved)}</span>
                  <strong>{formatMoney(totals.due)}</strong>
                </div>
              </div>
              <div className="line-list">
                {row.items.map((item) => (
                  <div className="line-row" key={item.id}>
                    <span>{item.item_name}</span>
                    <small>
                      Qty {item.quantity} x {formatMoney(item.unit_price)}
                    </small>
                    <Badge tone={item.status.includes('pending') ? 'warning' : 'success'}>
                      {item.status.replace('_', ' ')}
                    </Badge>
                  </div>
                ))}
              </div>
              {row.session?.status === 'active' && (
                <button
                  className="primary-button"
                  onClick={() =>
                    void onRun('Bill marked paid and table released.', () =>
                      closePaidSession(row.session?.id ?? ''),
                    )
                  }
                  type="button"
                >
                  <CreditCard size={18} />
                  Mark paid
                </button>
              )}
            </article>
          )
        })}
        {orderRows.length === 0 && (
          <EmptyState label="Orders will appear here instantly." icon={<ReceiptText size={24} />} />
        )}
      </div>
    </section>
  )
}

function AdminStaff({
  onRun,
  snapshot,
}: {
  onRun: (message: string, action: () => Promise<unknown>) => Promise<void>
  snapshot: AdminSnapshot
}) {
  return (
    <section className="panel">
      <PanelHeader eyebrow="Service" title="Staff call requests" icon={<Phone size={18} />} />
      <div className="table-list">
        {snapshot.staffCalls.map((call) => {
          const table = snapshot.tables.find((entry) => entry.id === call.table_id)
          return (
            <div className="service-row" key={call.id}>
              <div>
                <strong>Table {table?.table_number ?? 'Unknown'}</strong>
                <p>
                  {call.customer_name} - {call.contact_number}
                </p>
                <span>{call.message}</span>
              </div>
              <Badge tone={call.status === 'pending' ? 'warning' : 'info'}>{call.status}</Badge>
              <div className="button-row">
                <button
                  className="ghost-button"
                  onClick={() =>
                    void onRun('Staff call acknowledged.', () =>
                      updateStaffCallStatus(call.id, 'acknowledged'),
                    )
                  }
                  type="button"
                >
                  <Check size={16} />
                  Send staff
                </button>
                <button
                  className="primary-button"
                  onClick={() =>
                    void onRun('Staff call completed.', () =>
                      updateStaffCallStatus(call.id, 'done'),
                    )
                  }
                  type="button"
                >
                  <Check size={16} />
                  Done
                </button>
              </div>
            </div>
          )
        })}
      </div>
    </section>
  )
}

function AdminRequests({
  onRun,
  snapshot,
}: {
  onRun: (message: string, action: () => Promise<unknown>) => Promise<void>
  snapshot: AdminSnapshot
}) {
  const [notes, setNotes] = useState<Record<string, string>>({})

  return (
    <section className="panel">
      <PanelHeader eyebrow="Approvals" title="Customer change requests" icon={<Bell size={18} />} />
      <div className="request-list">
        {snapshot.changeRequests.map((request) => {
          const item = snapshot.orderItems.find((entry) => entry.id === request.order_item_id)
          const session = snapshot.sessions.find((entry) => entry.id === request.session_id)
          const table = snapshot.tables.find((entry) => entry.id === session?.table_id)
          return (
            <article className="request-card" key={request.id}>
              <div>
                <Badge tone={request.status === 'pending' ? 'warning' : request.status === 'approved' ? 'success' : 'danger'}>
                  {request.status}
                </Badge>
                <h3>{item?.item_name ?? 'Order item'}</h3>
                <p>
                  Table {table?.table_number ?? 'Unknown'} - {session?.customer_name ?? 'Guest'}
                </p>
                <span>
                  {request.request_type === 'cancel'
                    ? 'Cancel item'
                    : `Change quantity to ${request.requested_quantity}`}
                </span>
                {request.reason && <small>Reason: {request.reason}</small>}
                {request.admin_note && <small>Admin note: {request.admin_note}</small>}
              </div>
              {request.status === 'pending' && (
                <div className="request-actions">
                  <textarea
                    onChange={(event) =>
                      setNotes((current) => ({ ...current, [request.id]: event.target.value }))
                    }
                    placeholder="Approval or rejection note"
                    value={notes[request.id] ?? ''}
                  />
                  <div className="button-row">
                    <button
                      className="primary-button"
                      onClick={() =>
                        void onRun('Request approved.', () =>
                          approveChangeRequest(request.id, notes[request.id] || 'Approved by admin.'),
                        )
                      }
                      type="button"
                    >
                      <Check size={16} />
                      Approve
                    </button>
                    <button
                      className="danger-button"
                      onClick={() =>
                        void onRun('Request rejected.', () =>
                          rejectChangeRequest(
                            request.id,
                            notes[request.id] ||
                              'Rejected because the order is already being prepared.',
                          ),
                        )
                      }
                      type="button"
                    >
                      <X size={16} />
                      Reject
                    </button>
                  </div>
                </div>
              )}
            </article>
          )
        })}
        {snapshot.changeRequests.length === 0 && (
          <EmptyState label="No customer change requests yet." icon={<Bell size={24} />} />
        )}
      </div>
    </section>
  )
}

function AdminSettings({
  onRun,
  snapshot,
}: {
  onRun: (message: string, action: () => Promise<unknown>) => Promise<void>
  snapshot: AdminSnapshot
}) {
  const [name, setName] = useState(snapshot.settings?.restaurant_name ?? 'Smart Table')
  const [reviewUrl, setReviewUrl] = useState(snapshot.settings?.google_review_url ?? '')

  return (
    <section className="panel narrow">
      <PanelHeader eyebrow="Restaurant" title="Settings" icon={<Settings size={18} />} />
      <form
        className="stack-form"
        onSubmit={(event) => {
          event.preventDefault()
          void onRun('Settings saved.', () =>
            saveSettings({
              restaurant_name: name,
              google_review_url: reviewUrl,
            }),
          )
        }}
      >
        <label>
          Restaurant name
          <input onChange={(event) => setName(event.target.value)} required value={name} />
        </label>
        <label>
          Google review map link
          <input
            onChange={(event) => setReviewUrl(event.target.value)}
            placeholder="https://maps.google.com/..."
            type="url"
            value={reviewUrl}
          />
        </label>
        <button className="primary-button" type="submit">
          <Check size={18} />
          Save settings
        </button>
      </form>
    </section>
  )
}

function CustomerApp({ notify, tableId }: { notify: Notify; tableId: UUID }) {
  const now = useNow()
  const storageKey = `smart-table-session-${tableId}`
  const [table, setTable] = useState<DiningTable | null>(null)
  const [menu, setMenu] = useState<PublicMenu | null>(null)
  const [summary, setSummary] = useState<CustomerSummary | null>(null)
  const [sessionId, setSessionId] = useState(() => localStorage.getItem(storageKey) ?? '')
  const [activeTab, setActiveTab] = useState('')
  const [selectedLine, setSelectedLine] = useState<CartLine | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const loadSummary = useCallback(async () => {
    if (!sessionId) return
    try {
      setSummary(await getCustomerSummary(sessionId))
      setError('')
    } catch (caught) {
      setError(getErrorMessage(caught))
    }
  }, [sessionId])

  useEffect(() => {
    async function boot() {
      setLoading(true)
      try {
        const [nextTable, nextMenu] = await Promise.all([
          getPublicTable(tableId),
          getPublicMenu(),
        ])
        setTable(nextTable)
        setMenu(nextMenu)
        setActiveTab(nextMenu.categories[0]?.id ?? SPECIAL_TABS.offers)
        if (sessionId) {
          setSummary(await getCustomerSummary(sessionId))
        }
        setError('')
      } catch (caught) {
        setError(getErrorMessage(caught))
      } finally {
        setLoading(false)
      }
    }
    void boot()
  }, [sessionId, tableId])

  useEffect(() => {
    if (!sessionId) return undefined
    const interval = window.setInterval(() => void loadSummary(), 5000)
    return () => window.clearInterval(interval)
  }, [loadSummary, sessionId])

  const liveOffers = useMemo(
    () => menu?.offers.filter((offer) => isOfferLive(offer, now)) ?? [],
    [menu?.offers, now],
  )
  const activeItems = useMemo(
    () =>
      menu?.items.filter((item) => {
        if (!activeTab || activeTab === SPECIAL_TABS.offers) return false
        return item.category_id === activeTab
      }) ?? [],
    [activeTab, menu?.items],
  )

  async function handleSessionStart(name: string, contact: string) {
    try {
      const nextSessionId = await startTableSession(tableId, name, contact)
      localStorage.setItem(storageKey, nextSessionId)
      setSessionId(nextSessionId)
      setSummary(await getCustomerSummary(nextSessionId))
      notify(`Table ${table?.table_number ?? ''} occupied. Welcome ${name}.`)
    } catch (caught) {
      notify(getErrorMessage(caught), 'error')
    }
  }

  async function handleOrder(line: CartLine) {
    if (!sessionId) return
    try {
      await placeOrder(sessionId, [
        {
          menu_item_id: line.item.id,
          quantity: line.quantity,
          offer_id: line.offer?.id ?? null,
        },
      ])
      setSelectedLine(null)
      await loadSummary()
      setActiveTab(SPECIAL_TABS.orders)
      notify('Order placed. Admin has been notified.')
    } catch (caught) {
      notify(getErrorMessage(caught), 'error')
    }
  }

  async function handleStaffCall() {
    if (!sessionId) return
    try {
      await callStaff(sessionId, 'Customer requested staff assistance.')
      await loadSummary()
      notify('Staff call sent to admin.')
    } catch (caught) {
      notify(getErrorMessage(caught), 'error')
    }
  }

  async function handleChange(
    orderItemId: UUID,
    type: ChangeRequestType,
    quantity: number | null,
  ) {
    if (!sessionId) return
    try {
      await requestOrderChange(
        sessionId,
        orderItemId,
        type,
        quantity,
        type === 'cancel' ? 'Customer requested cancellation.' : 'Customer requested quantity change.',
      )
      await loadSummary()
      notify('Request sent. Admin approval is pending.', 'info')
    } catch (caught) {
      notify(getErrorMessage(caught), 'error')
    }
  }

  if (loading) return <LoadingPanel label="Opening table menu" />

  return (
    <main className="customer-shell">
      <header className="customer-topbar">
        <div>
          <p className="eyebrow">{menu?.settings?.restaurant_name ?? 'Smart Table'}</p>
          <h1>Table {table?.table_number ?? '...'}</h1>
        </div>
        <button
          className="primary-button compact"
          disabled={!sessionId || summary?.session.status !== 'active'}
          onClick={() => void handleStaffCall()}
          type="button"
        >
          <Phone size={18} />
          Call staff
        </button>
      </header>

      {error && <SetupNotice message={error} />}
      {!sessionId && table && (
        <OccupyModal table={table} onStart={(name, contact) => void handleSessionStart(name, contact)} />
      )}

      <nav className="customer-tabs" aria-label="Menu sections">
        {menu?.categories.map((category) => (
          <button
            className={clsx(activeTab === category.id && 'active')}
            key={category.id}
            onClick={() => setActiveTab(category.id)}
            type="button"
          >
            {category.name}
          </button>
        ))}
        <button
          className={clsx(activeTab === SPECIAL_TABS.offers && 'active')}
          onClick={() => setActiveTab(SPECIAL_TABS.offers)}
          type="button"
        >
          Offers
        </button>
        <button
          className={clsx(activeTab === SPECIAL_TABS.orders && 'active')}
          onClick={() => setActiveTab(SPECIAL_TABS.orders)}
          type="button"
        >
          Orders
        </button>
        <button
          className={clsx(activeTab === SPECIAL_TABS.review && 'active')}
          onClick={() => setActiveTab(SPECIAL_TABS.review)}
          type="button"
        >
          Review
        </button>
      </nav>

      {activeTab === SPECIAL_TABS.offers && menu && (
        <OfferCustomerGrid
          items={menu.items}
          now={now}
          offers={liveOffers}
          onSelect={setSelectedLine}
        />
      )}

      {activeTab === SPECIAL_TABS.orders && summary && (
        <CustomerOrders
          onChange={(itemId, type, quantity) => void handleChange(itemId, type, quantity)}
          summary={summary}
        />
      )}

      {activeTab === SPECIAL_TABS.review && (
        <ReviewPanel reviewUrl={menu?.settings?.google_review_url ?? ''} status={summary?.session.status} />
      )}

      {menu && !Object.values(SPECIAL_TABS).includes(activeTab as typeof SPECIAL_TABS[keyof typeof SPECIAL_TABS]) && (
        <MenuGrid
          items={activeItems}
          now={now}
          offers={menu.offers}
          onSelect={setSelectedLine}
        />
      )}

      {selectedLine && (
        <ItemModal
          line={selectedLine}
          now={now}
          onClose={() => setSelectedLine(null)}
          onOrder={(line) => void handleOrder(line)}
        />
      )}
    </main>
  )
}

function OccupyModal({
  onStart,
  table,
}: {
  onStart: (name: string, contact: string) => void
  table: DiningTable
}) {
  const [name, setName] = useState('')
  const [contact, setContact] = useState('')

  return (
    <div className="modal-backdrop">
      <section className="modal compact-modal">
        <div className="modal-header">
          <div>
            <p className="eyebrow">Scan confirmed</p>
            <h2>Table {table.table_number}</h2>
          </div>
          <QrCode size={28} />
        </div>
        <form
          className="stack-form"
          onSubmit={(event) => {
            event.preventDefault()
            onStart(name, contact)
          }}
        >
          <label>
            Table number
            <input readOnly value={table.table_number} />
          </label>
          <label>
            Name
            <input
              onChange={(event) => setName(event.target.value)}
              placeholder="Your name"
              required
              value={name}
            />
          </label>
          <label>
            Contact number
            <input
              onChange={(event) => setContact(event.target.value)}
              placeholder="98XXXXXXXX"
              required
              value={contact}
            />
          </label>
          <button className="primary-button" type="submit">
            <Check size={18} />
            Occupy table
          </button>
        </form>
      </section>
    </div>
  )
}

function MenuGrid({
  items,
  now,
  offers,
  onSelect,
}: {
  items: MenuItem[]
  now: Date
  offers: Offer[]
  onSelect: (line: CartLine) => void
}) {
  return (
    <section className="customer-grid">
      {items.map((item) => {
        const offer = offers.find((entry) => entry.item_id === item.id && isOfferLive(entry, now))
        const unit = getOfferUnitPrice(item, offer, now)
        return (
          <button
            className="product-card"
            key={item.id}
            onClick={() => onSelect({ item, offer, quantity: 1 })}
            type="button"
          >
            <img alt="" src={item.image_url || FALLBACK_IMAGE} />
            <span>{offer ? 'Offer live' : 'Available'}</span>
            <strong>{item.name}</strong>
            <p>{item.description || 'Freshly prepared for your table.'}</p>
            <div className="price-row">
              {offer && <del>{formatMoney(item.price)}</del>}
              <b>{formatMoney(unit)}</b>
            </div>
          </button>
        )
      })}
      {items.length === 0 && (
        <EmptyState label="No items available in this section yet." icon={<ReceiptText size={24} />} />
      )}
    </section>
  )
}

function OfferCustomerGrid({
  items,
  now,
  offers,
  onSelect,
}: {
  items: MenuItem[]
  now: Date
  offers: Offer[]
  onSelect: (line: CartLine) => void
}) {
  return (
    <section className="customer-grid">
      {offers.map((offer) => {
        const item = items.find((entry) => entry.id === offer.item_id)
        if (!item) return null
        const unit = getOfferUnitPrice(item, offer, now)
        const saved = Math.max(0, Number(item.price) - unit)
        return (
          <button
            className="product-card offer-card"
            key={offer.id}
            onClick={() => onSelect({ item, offer, quantity: 1 })}
            type="button"
          >
            <img alt="" src={item.image_url || FALLBACK_IMAGE} />
            <span>{getCountdownLabel(offer.ends_at, now)}</span>
            <strong>{offer.title}</strong>
            <p>{offer.description || item.description || 'Limited time restaurant offer.'}</p>
            <div className="price-row">
              <del>{formatMoney(item.price)}</del>
              <b>{formatMoney(unit)}</b>
            </div>
            <small>You save {formatMoney(saved)} each</small>
          </button>
        )
      })}
      {offers.length === 0 && (
        <EmptyState label="No live offers right now." icon={<Tag size={24} />} />
      )}
    </section>
  )
}

function ItemModal({
  line,
  now,
  onClose,
  onOrder,
}: {
  line: CartLine
  now: Date
  onClose: () => void
  onOrder: (line: CartLine) => void
}) {
  const [quantity, setQuantity] = useState(line.quantity)
  const nextLine = { ...line, quantity }
  const totals = calculateCartLine(nextLine, now)

  return (
    <div className="modal-backdrop">
      <section className="modal item-modal">
        <button className="icon-button modal-close" onClick={onClose} title="Close" type="button">
          <X size={18} />
        </button>
        <img alt="" className="modal-image" src={line.item.image_url || FALLBACK_IMAGE} />
        <div className="modal-body">
          <Badge tone={line.offer ? 'success' : 'info'}>
            {line.offer ? 'Offer price applied' : 'Menu item'}
          </Badge>
          <h2>{line.offer?.title ?? line.item.name}</h2>
          <p>{line.offer?.description || line.item.description || 'Freshly prepared item.'}</p>
          <div className="quantity-row">
            <button
              className="icon-button"
              onClick={() => setQuantity((current) => Math.max(1, current - 1))}
              type="button"
            >
              <Minus size={18} />
            </button>
            <strong>{quantity}</strong>
            <button
              className="icon-button"
              onClick={() => setQuantity((current) => current + 1)}
              type="button"
            >
              <Plus size={18} />
            </button>
          </div>
          <div className="bill-box">
            <span>Unit price</span>
            <strong>{formatMoney(totals.unitPrice)}</strong>
            {totals.savingsTotal > 0 && (
              <>
                <span>You save</span>
                <strong>{formatMoney(totals.savingsTotal)}</strong>
              </>
            )}
            <span>Total</span>
            <strong>{formatMoney(totals.lineTotal)}</strong>
          </div>
          <button className="primary-button" onClick={() => onOrder(nextLine)} type="button">
            <ReceiptText size={18} />
            Order now
          </button>
        </div>
      </section>
    </div>
  )
}

function CustomerOrders({
  onChange,
  summary,
}: {
  onChange: (itemId: UUID, type: ChangeRequestType, quantity: number | null) => void
  summary: CustomerSummary
}) {
  const allItems = summary.orders.flatMap((order) => order.items)
  const pendingByItem = new Map(
    summary.change_requests
      .filter((request) => request.status === 'pending')
      .map((request) => [request.order_item_id, request]),
  )
  const latestByItem = new Map(
    summary.change_requests.map((request) => [request.order_item_id, request]),
  )

  return (
    <section className="customer-orders">
      <div className="bill-summary">
        <div>
          <span>Final bill</span>
          <strong>{formatMoney(summary.totals.due)}</strong>
        </div>
        <div>
          <span>You saved</span>
          <strong>{formatMoney(summary.totals.saved)}</strong>
        </div>
        <Badge tone={summary.session.status === 'active' ? 'success' : 'info'}>
          {summary.session.status}
        </Badge>
      </div>
      <div className="order-list">
        {allItems.map((item) => {
          const pending = pendingByItem.get(item.id)
          const latest = latestByItem.get(item.id)
          const locked = Boolean(pending) || item.status === 'cancelled'
          return (
            <article className="customer-order-card" key={item.id}>
              <div>
                <strong>{item.item_name}</strong>
                <p>
                  Qty {item.quantity} - {formatMoney(item.line_total)}
                </p>
                {item.savings_total > 0 && <span>Saved {formatMoney(item.savings_total)}</span>}
                {latest?.admin_note && (
                  <small>
                    {latest.status}: {latest.admin_note}
                  </small>
                )}
              </div>
              <Badge tone={item.status.includes('pending') ? 'warning' : item.status === 'cancelled' ? 'danger' : 'success'}>
                {item.status.replace('_', ' ')}
              </Badge>
              <div className="button-row">
                <button
                  className="ghost-button"
                  disabled={locked || item.quantity <= 1}
                  onClick={() => onChange(item.id, 'update_quantity', item.quantity - 1)}
                  type="button"
                >
                  <Minus size={16} />
                </button>
                <button
                  className="ghost-button"
                  disabled={locked}
                  onClick={() => onChange(item.id, 'update_quantity', item.quantity + 1)}
                  type="button"
                >
                  <Plus size={16} />
                </button>
                <button
                  className="danger-button"
                  disabled={locked}
                  onClick={() => onChange(item.id, 'cancel', null)}
                  type="button"
                >
                  <Trash2 size={16} />
                  Cancel
                </button>
              </div>
            </article>
          )
        })}
      </div>
      {allItems.length === 0 && (
        <EmptyState label="Your placed orders will appear here." icon={<ReceiptText size={24} />} />
      )}
    </section>
  )
}

function ReviewPanel({
  reviewUrl,
  status,
}: {
  reviewUrl: string
  status: CustomerSummary['session']['status'] | undefined
}) {
  const canReview = status === 'paid' || status === 'closed'
  return (
    <section className="review-panel">
      <Star size={36} />
      <h2>Review your experience</h2>
      <p>
        {canReview
          ? 'Thank you for dining with us. Your feedback helps the restaurant grow.'
          : 'The review button appears after the bill is paid.'}
      </p>
      <a
        className={clsx('primary-button', !canReview && 'disabled')}
        href={canReview && reviewUrl ? reviewUrl : undefined}
        rel="noreferrer"
        target="_blank"
      >
        <Star size={18} />
        Open Google review
      </a>
    </section>
  )
}

function SearchResults({ query, snapshot }: { query: string; snapshot: AdminSnapshot }) {
  const term = query.toLowerCase().trim()
  const tables = snapshot.tables.filter((table) =>
    `${table.table_number} ${table.label ?? ''} ${table.status}`.toLowerCase().includes(term),
  )
  const items = snapshot.items.filter((item) =>
    `${item.name} ${item.description ?? ''}`.toLowerCase().includes(term),
  )
  const sessions = snapshot.sessions.filter((session) =>
    `${session.customer_name} ${session.contact_number}`.toLowerCase().includes(term),
  )
  const results = [
    ...tables.slice(0, 3).map((table) => `Table ${table.table_number} - ${table.status}`),
    ...items.slice(0, 3).map((item) => `${item.name} - ${formatMoney(item.price)}`),
    ...sessions
      .slice(0, 3)
      .map((session) => `${session.customer_name} - ${session.contact_number}`),
  ]

  return (
    <section className="search-results">
      <strong>Search results</strong>
      <div>
        {results.map((result) => (
          <span key={result}>{result}</span>
        ))}
      </div>
    </section>
  )
}

function PanelHeader({
  eyebrow,
  icon,
  title,
}: {
  eyebrow: string
  icon: ReactNode
  title: string
}) {
  return (
    <div className="panel-header">
      <div>
        <p className="eyebrow">{eyebrow}</p>
        <h2>{title}</h2>
      </div>
      <span className="panel-icon">{icon}</span>
    </div>
  )
}

function Stat({
  icon: Icon,
  label,
  value,
}: {
  icon: LucideIcon
  label: string
  value: string
}) {
  return (
    <section className="stat-card">
      <Icon size={20} />
      <span>{label}</span>
      <strong>{value}</strong>
    </section>
  )
}

function Badge({ children, tone }: { children: ReactNode; tone: string }) {
  return <span className={clsx('badge', tone)}>{children}</span>
}

function EmptyState({ icon, label }: { icon: ReactNode; label: string }) {
  return (
    <div className="empty-state">
      {icon}
      <span>{label}</span>
    </div>
  )
}

function LoadingPanel({ label }: { label: string }) {
  return (
    <main className="loading-shell">
      <Loader2 className="spin" size={32} />
      <span>{label}</span>
    </main>
  )
}

function SetupNotice({ message }: { message: string }) {
  return (
    <section className="setup-notice">
      <Shield size={20} />
      <div>
        <strong>Setup needed</strong>
        <p>{message}</p>
        <span>Supabase project: {supabaseProject.url}</span>
      </div>
    </section>
  )
}

function ToastTray({
  onRemove,
  toasts,
}: {
  onRemove: (id: number) => void
  toasts: Toast[]
}) {
  return (
    <div className="toast-tray" aria-live="polite">
      {toasts.map((toast) => (
        <button
          className={clsx('toast', toast.tone)}
          key={toast.id}
          onClick={() => onRemove(toast.id)}
          type="button"
        >
          {toast.message}
        </button>
      ))}
    </div>
  )
}

function getAdminTitle(tab: AdminTab) {
  return adminTabs.find((entry) => entry.id === tab)?.label ?? 'Dashboard'
}

function getDefaultOfferEnd() {
  const end = new Date(Date.now() + 1000 * 60 * 60 * 4)
  end.setSeconds(0, 0)
  return end.toISOString().slice(0, 16)
}

function getCustomerTableUrl(tableId: UUID) {
  return `${window.location.origin}${import.meta.env.BASE_URL}#/table/${tableId}`
}

function getErrorMessage(caught: unknown) {
  if (caught instanceof Error) return caught.message
  return 'Something went wrong.'
}

export default App
