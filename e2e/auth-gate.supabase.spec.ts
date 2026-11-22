import { expect, test } from '@playwright/test';
import { SUPABASE_BASE_URL } from '../playwright.config';

// AUTH_MODE=supabase with an unreachable Supabase URL: nobody can have a session, and getUser() failing
// must count as "no user" instead of crashing the page.
test.use({ baseURL: SUPABASE_BASE_URL });

for (const path of ['/chat', '/context']) {
  test(`chưa đăng nhập: ${path} chuyển về /login`, async ({ page }) => {
    await page.goto(path);
    await expect(page).toHaveURL(/\/login$/);
    await expect(page.getByRole('heading', { level: 1, name: 'Đăng nhập' })).toBeVisible();
  });
}

test('segment prefetch của /context không trả nội dung trang khi chưa đăng nhập', async ({ request }) => {
  // Next first redirects an RSC request without `_rsc` to the cache-busted URL; follow redirects like the router does.
  const res = await request.get('/context', {
    headers: { RSC: '1', 'Next-Router-Prefetch': '1', 'Next-Router-Segment-Prefetch': '/!KGFwcCk/context/__PAGE__' },
  });
  const body = await res.text();
  // The page's own <h1>Context</h1> (a not-found boundary may carry an unrelated h1).
  expect(body, `${res.status()} ${res.url()}`).not.toMatch(/"h1",null,\{[^{}]*"children":"Context"/);
  // The proxy sends page requests without a user, RSC ones included, to /login.
  expect(new URL(res.url()).pathname).toBe('/login');
});

test('/login có form email + mật khẩu và không có link đăng ký', async ({ page }) => {
  await page.goto('/login');
  await expect(page.getByLabel('Email')).toHaveAttribute('type', 'email');
  await expect(page.getByLabel('Mật khẩu')).toHaveAttribute('type', 'password');
  await expect(page.getByRole('button', { name: 'Đăng nhập' })).toBeVisible();
  await expect(page.getByRole('link')).toHaveCount(0);
  await expect(page.getByText(/đăng ký|sign up|register/i)).toHaveCount(0);
});
