import { expect, test } from '@playwright/test';

test('bundle frontend không chứa key AI hay DATABASE_URL', async ({ page }) => {
  const bodies: string[] = [];
  page.on('response', async (res) => {
    if (res.request().resourceType() === 'script') bodies.push(await res.text().catch(() => ''));
  });
  for (const path of ['/chat', '/context']) await page.goto(path, { waitUntil: 'networkidle' });
  const all = bodies.join('\n') + (await page.content());
  expect(all).not.toContain('e2e-secret-ai-key');
  expect(all).not.toContain('e2e-secret-db-url');
});
