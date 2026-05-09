import { expect, test } from '@playwright/test'

test('home and admin routes render on GitHub Pages base path', async ({ page }) => {
  await page.goto('/Smart-Table/')
  await expect(page.getByRole('heading', { name: /restaurant ordering/i })).toBeVisible()

  await page.goto('/Smart-Table/#/admin')
  await expect(page.getByRole('heading', { name: /sign in to manage/i })).toBeVisible()
  await expect(page.getByRole('button', { name: /sign in/i })).toBeVisible()
})

test('customer QR route shows a setup-safe state when Supabase is unavailable', async ({ page }) => {
  await page.route('https://soopgkjsapuraqvqwtly.supabase.co/**', (route) =>
    route.fulfill({
      status: 503,
      contentType: 'application/json',
      body: JSON.stringify({ message: 'Supabase unavailable during smoke test' }),
    }),
  )
  await page.goto('/Smart-Table/#/table/demo-table')
  await expect(page.getByText(/setup needed/i)).toBeVisible({ timeout: 20_000 })
})
