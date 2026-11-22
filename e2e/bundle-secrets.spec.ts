import { expect, test } from '@playwright/test';
import { resetDb } from './helpers';

test('bundle frontend không chứa key AI hay DATABASE_URL', async ({ page, request, isMobile }) => {
  await resetDb(request); // onboarded: otherwise the onboarding dialog hides the page from the a11y tree
  const reads: Promise<{ url: string; body?: string; error?: string }>[] = [];
  page.on('response', (res) => {
    if (res.request().resourceType() !== 'script') return;
    if (res.status() >= 300 && res.status() < 400) return; // redirects have no body by definition
    const url = res.url();
    reads.push(res.text().then((body) => ({ url, body }), (e: Error) => ({ url, error: e.message })));
  });

  for (const [path, heading] of [['/chat', 'Chat'], ['/context', 'Context']] as const) {
    await page.goto(path, { waitUntil: 'networkidle' });
    // The page must really render, otherwise there is nothing to scan.
    await expect(page.getByRole('heading', { level: 1, name: heading })).toBeVisible();
    if (!isMobile) await expect(page.getByRole('navigation', { name: 'Chính' })).toBeVisible();
  }

  // A script body that cannot be read fails the test instead of being treated as empty.
  const results = await Promise.all(reads);
  expect(results.filter((r) => r.error), 'unreadable script responses').toEqual([]);
  const bodies = results.map((r) => r.body ?? '');
  expect(bodies.length).toBeGreaterThan(0);
  expect(bodies.some((b) => b.length > 0)).toBe(true);

  const all = bodies.join('\n') + (await page.content());
  expect(all).not.toContain('e2e-secret-ai-key');
  expect(all).not.toContain('e2e-secret-db-url');
});
