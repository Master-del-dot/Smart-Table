# Smart Table

Premium QR ordering app for restaurants. Admins create tables, generate QR codes, manage menu items and offers, receive live notifications, approve or reject order change requests, and close paid bills. Customers scan a table QR, occupy that table, browse menu sections, order items, call staff, request quantity changes or cancellations, see savings from offers, and open the Google review link after payment.

## Tech Stack

- React + TypeScript + Vite
- Supabase Auth, Postgres, RLS, RPC, Realtime, and Storage
- GitHub Pages deployment workflow
- Vitest unit tests and Playwright smoke tests

## Supabase Setup

1. Open Supabase SQL Editor for `https://soopgkjsapuraqvqwtly.supabase.co`.
2. Run the full SQL in [`supabase/schema.sql`](supabase/schema.sql).
3. In Supabase Authentication, create the admin email/password user.
4. Run the admin promotion snippet at the bottom of `supabase/schema.sql`, replacing `YOUR_ADMIN_EMAIL@example.com`.
5. In the app, sign in at `/#/admin`.

The SQL creates:

- `menu-images` public storage bucket
- RLS policies for public customer reads and admin-only writes
- Safe customer RPCs for occupying tables, placing orders, calling staff, requesting changes, and reading session summaries
- Admin-only RPCs for approving/rejecting changes and closing paid sessions

## Local Development

```bash
npm install
npm run dev
```

The public Supabase URL and anon key are already included in `.env.example`. `.env.local` is supported for local overrides and is ignored by git.

## Validation

```bash
npm test
npm run build
npm run smoke
```

Live end-to-end Supabase behavior requires running `supabase/schema.sql` first.

## Deployment

The GitHub Pages workflow in `.github/workflows/pages.yml` builds and deploys on pushes to `main`. The expected public URL is:

```text
https://master-del-dot.github.io/Smart-Table/
```

Customer QR URLs use hash routing, for example:

```text
https://master-del-dot.github.io/Smart-Table/#/table/<table-id>
```
