import { expect, type Page } from '@playwright/test';

type Win = Window & { __boostback: { runtime: { view: { t: number; throttle: number; legs: number; legsCommanded: boolean }; mode: string; replay: { time: number } | null }; useGame: { getState(): { phase: string } } } };

export async function open(page: Page, settings: Record<string, unknown> = {}) {
  await page.addInitScript((s) => {
    if (!sessionStorage.getItem('seeded')) {
      sessionStorage.setItem('seeded', '1');
      localStorage.setItem('boostback:v1', JSON.stringify({ storageVersion: 1, settings: s, bests: {}, recent: [], replays: [] }));
    }
  }, settings);
  await page.goto('/');
  await page.waitForFunction(() => !!(window as unknown as Win).__boostback);
  await expect(page.locator('canvas')).toBeVisible();
}

export const phase = (page: Page) => page.evaluate(() => (window as unknown as Win).__boostback.useGame.getState().phase);
export const simTime = (page: Page) => page.evaluate(() => (window as unknown as Win).__boostback.runtime.view.t);
export const view = (page: Page) => page.evaluate(() => ({ ...(window as unknown as Win).__boostback.runtime.view }));
export const replayTime = (page: Page) => page.evaluate(() => (window as unknown as Win).__boostback.runtime.replay?.time ?? -1);

export async function waitForPhase(page: Page, phases: string[], timeout = 120_000) {
  await page.waitForFunction(
    (ps) => ps.includes((window as unknown as Win).__boostback.useGame.getState().phase),
    phases,
    { timeout, polling: 200 },
  );
}

/** Asserts nothing overflows the viewport horizontally and the element is the topmost thing at its centre. */
export async function expectUnobstructed(page: Page, testId: string) {
  const ok = await page.getByTestId(testId).evaluate((el) => {
    const r = el.getBoundingClientRect();
    const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    return {
      inside: r.left >= 0 && r.top >= 0 && r.right <= window.innerWidth && r.bottom <= window.innerHeight,
      topmost: !!top && (top === el || el.contains(top)),
    };
  });
  expect(ok).toEqual({ inside: true, topmost: true });
}

export async function expectNoHorizontalOverflow(page: Page) {
  const o = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(o).toBeLessThanOrEqual(0);
}
