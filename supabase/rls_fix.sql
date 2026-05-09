-- Smart Table RLS repair script
-- Run this in Supabase SQL Editor if the app says:
-- "new row violates row-level security policy"
--
-- IMPORTANT:
-- 1. Create your admin user first in Supabase Authentication > Users.
-- 2. Replace YOUR_ADMIN_EMAIL@example.com below with that admin email.
-- 3. Run this whole file.

do $$
declare
  v_admin_email text := 'YOUR_ADMIN_EMAIL@example.com';
  v_admin_id uuid;
begin
  select id
  into v_admin_id
  from auth.users
  where lower(email) = lower(v_admin_email)
  limit 1;

  if v_admin_id is null then
    raise exception 'No Supabase Auth user found for %. Create the user first, then run this again.', v_admin_email;
  end if;

  insert into public.admin_profiles (user_id, full_name, role)
  values (v_admin_id, 'Restaurant Admin', 'admin')
  on conflict (user_id) do update
  set role = 'admin',
      full_name = coalesce(public.admin_profiles.full_name, excluded.full_name);
end $$;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.admin_profiles
    where user_id = auth.uid()
      and role = 'admin'
  );
$$;

grant usage on schema public to anon, authenticated;
grant execute on function public.is_admin() to anon, authenticated;

grant select on public.restaurant_settings to anon, authenticated;
grant select on public.dining_tables to anon, authenticated;
grant select on public.menu_categories to anon, authenticated;
grant select on public.menu_items to anon, authenticated;
grant select on public.offers to anon, authenticated;

grant select, insert, update, delete on all tables in schema public to authenticated;
grant usage, select on all sequences in schema public to authenticated;

alter table public.admin_profiles enable row level security;
alter table public.restaurant_settings enable row level security;
alter table public.dining_tables enable row level security;
alter table public.menu_categories enable row level security;
alter table public.menu_items enable row level security;
alter table public.offers enable row level security;
alter table public.customer_sessions enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;
alter table public.order_change_requests enable row level security;
alter table public.staff_calls enable row level security;
alter table public.notifications enable row level security;

drop policy if exists "Admins can read admin profiles" on public.admin_profiles;
drop policy if exists "Admins can manage admin profiles" on public.admin_profiles;
drop policy if exists "Public can read settings" on public.restaurant_settings;
drop policy if exists "Admins can manage settings" on public.restaurant_settings;
drop policy if exists "Public can read active tables" on public.dining_tables;
drop policy if exists "Admins can manage tables" on public.dining_tables;
drop policy if exists "Public can read active categories" on public.menu_categories;
drop policy if exists "Admins can manage categories" on public.menu_categories;
drop policy if exists "Public can read available items" on public.menu_items;
drop policy if exists "Admins can manage items" on public.menu_items;
drop policy if exists "Public can read active offers" on public.offers;
drop policy if exists "Admins can manage offers" on public.offers;
drop policy if exists "Admins can read sessions" on public.customer_sessions;
drop policy if exists "Admins can read orders" on public.orders;
drop policy if exists "Admins can read order items" on public.order_items;
drop policy if exists "Admins can read change requests" on public.order_change_requests;
drop policy if exists "Admins can read staff calls" on public.staff_calls;
drop policy if exists "Admins can update staff calls" on public.staff_calls;
drop policy if exists "Admins can read notifications" on public.notifications;
drop policy if exists "Admins can update notifications" on public.notifications;

drop policy if exists "Admins can manage sessions" on public.customer_sessions;
drop policy if exists "Admins can manage orders" on public.orders;
drop policy if exists "Admins can manage order items" on public.order_items;
drop policy if exists "Admins can manage change requests" on public.order_change_requests;
drop policy if exists "Admins can manage staff calls" on public.staff_calls;
drop policy if exists "Admins can manage notifications" on public.notifications;

create policy "Admins can read admin profiles"
on public.admin_profiles for select
to authenticated
using (user_id = auth.uid() or public.is_admin());

create policy "Admins can manage admin profiles"
on public.admin_profiles for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

create policy "Public can read settings"
on public.restaurant_settings for select
to anon, authenticated
using (true);

create policy "Admins can manage settings"
on public.restaurant_settings for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

create policy "Public can read active tables"
on public.dining_tables for select
to anon, authenticated
using (status <> 'disabled');

create policy "Admins can manage tables"
on public.dining_tables for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

create policy "Public can read active categories"
on public.menu_categories for select
to anon, authenticated
using (is_active = true);

create policy "Admins can manage categories"
on public.menu_categories for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

create policy "Public can read available items"
on public.menu_items for select
to anon, authenticated
using (is_available = true);

create policy "Admins can manage items"
on public.menu_items for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

create policy "Public can read active offers"
on public.offers for select
to anon, authenticated
using (is_active = true);

create policy "Admins can manage offers"
on public.offers for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

create policy "Admins can manage sessions"
on public.customer_sessions for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

create policy "Admins can manage orders"
on public.orders for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

create policy "Admins can manage order items"
on public.order_items for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

create policy "Admins can manage change requests"
on public.order_change_requests for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

create policy "Admins can manage staff calls"
on public.staff_calls for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

create policy "Admins can manage notifications"
on public.notifications for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

grant execute on function public.start_table_session(uuid, text, text) to anon, authenticated;
grant execute on function public.place_order(uuid, jsonb) to anon, authenticated;
grant execute on function public.call_staff(uuid, text) to anon, authenticated;
grant execute on function public.request_order_change(uuid, uuid, text, integer, text) to anon, authenticated;
grant execute on function public.get_customer_session_summary(uuid) to anon, authenticated;
grant execute on function public.admin_approve_change_request(uuid, text) to authenticated;
grant execute on function public.admin_reject_change_request(uuid, text) to authenticated;
grant execute on function public.admin_close_paid_session(uuid) to authenticated;

insert into storage.buckets (id, name, public)
values ('menu-images', 'menu-images', true)
on conflict (id) do update set public = true;

drop policy if exists "Public can read menu images" on storage.objects;
drop policy if exists "Admins can upload menu images" on storage.objects;
drop policy if exists "Admins can update menu images" on storage.objects;
drop policy if exists "Admins can delete menu images" on storage.objects;

create policy "Public can read menu images"
on storage.objects for select
to anon, authenticated
using (bucket_id = 'menu-images');

create policy "Admins can upload menu images"
on storage.objects for insert
to authenticated
with check (bucket_id = 'menu-images' and public.is_admin());

create policy "Admins can update menu images"
on storage.objects for update
to authenticated
using (bucket_id = 'menu-images' and public.is_admin())
with check (bucket_id = 'menu-images' and public.is_admin());

create policy "Admins can delete menu images"
on storage.objects for delete
to authenticated
using (bucket_id = 'menu-images' and public.is_admin());

select
  u.email,
  ap.role,
  'RLS repair complete. Sign out and sign back in to refresh the admin session.' as message
from public.admin_profiles ap
join auth.users u on u.id = ap.user_id
order by ap.created_at desc
limit 10;
