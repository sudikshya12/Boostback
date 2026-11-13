import { expect, test } from '@playwright/test';
import { expectNoHorizontalOverflow, expectUnobstructed, open, phase, replayTime, simTime, view, waitForPhase } from './helpers';

test('ready screen shows the essentials without overflow', async ({ page }) => {
  await open(page);
  await expect(page.getByRole('heading', { name: 'Bring it home.' })).toBeVisible();
  await expect(page.getByRole('radiogroup', { name: 'Difficulty' })).toBeVisible();
  await expectUnobstructed(page, 'start');
  await expectNoHorizontalOverflow(page);
});

test('first start shows the tutorial, then starts a run that responds to controls', async ({ page }) => {
  await open(page, { difficulty: 'training' });
  await page.getByTestId('start').click();
  await expect(page.getByRole('dialog', { name: 'How to play' })).toBeVisible();
  await page.getByRole('dialog').getByRole('button', { name: 'Start descent' }).click();
  await expect(page.getByRole('group', { name: 'Flight readouts' })).toBeVisible();
  expect(await phase(page)).toBe('playing');

  const before = await view(page);
  await page.keyboard.down('KeyW');
  await page.waitForTimeout(1200);
  await page.keyboard.up('KeyW');
  const after = await view(page);
  expect(after.t).toBeGreaterThan(before.t);
  expect(after.throttle).toBeGreaterThan(before.throttle + 0.1);

  await page.keyboard.press('KeyL');
  await page.waitForFunction(() => (window as any).__boostback.runtime.view.legsCommanded === true);
});

test('pause freezes the simulation and resume continues it', async ({ page }) => {
  await open(page, { tutorialSeen: true, difficulty: 'training' });
  await page.getByTestId('start').click();
  await page.waitForTimeout(800);
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog', { name: 'Paused' })).toBeVisible();
  const t1 = await simTime(page);
  await page.waitForTimeout(1200);
  expect(await simTime(page)).toBe(t1);
  await page.getByRole('button', { name: 'Resume' }).click();
  await page.waitForTimeout(800);
  expect(await simTime(page)).toBeGreaterThan(t1);
});

test('a crash produces a result, and R restarts', async ({ page }) => {
  await open(page, { tutorialSeen: true, difficulty: 'standard' });
  await page.getByTestId('start').click();
  await waitForPhase(page, ['failed', 'landed']);
  expect(await phase(page)).toBe('failed');
  await expect(page.getByTestId('outcome')).not.toHaveText('Touchdown confirmed');
  await expectUnobstructed(page, 'try-again');
  await page.keyboard.press('KeyR');
  await expect.poll(() => phase(page)).toBe('playing');
  expect(await simTime(page)).toBeLessThan(3);
});

test('demo landing, replay with scrubbing, and analysis', async ({ page }) => {
  await open(page, { tutorialSeen: true, difficulty: 'training' });
  await page.getByRole('button', { name: 'Watch a landing' }).click();
  await expect(page.getByText(/Demo controller flying/)).toBeVisible();
  await waitForPhase(page, ['landed', 'failed']);
  await expect(page.getByTestId('outcome')).toHaveText('Touchdown confirmed');

  await page.getByTestId('toggle-analysis').click();
  await expect(page.getByTestId('analysis')).toBeVisible();
  await expect(page.getByRole('table')).toContainText('Pass');

  await page.getByTestId('watch-replay').click();
  await expect(page.getByTestId('replay-bar')).toBeVisible();
  await page.getByTestId('replay-play').click(); // pause
  const scrub = page.getByTestId('replay-scrub');
  await scrub.evaluate((el: HTMLInputElement) => {
    el.value = String(Number(el.max) * 0.5);
    el.dispatchEvent(new Event('input', { bubbles: true }));
  });
  const t = await replayTime(page);
  const max = Number(await scrub.getAttribute('max'));
  expect(Math.abs(t - max * 0.5)).toBeLessThan(0.1);
  await page.getByRole('radio', { name: '2×' }).click();
  await expect(page.getByRole('radio', { name: '2×' })).toHaveAttribute('aria-checked', 'true');
  await page.getByTestId('replay-back').click();
  await expect(page.getByTestId('result')).toBeVisible();
});

test('settings change and persist', async ({ page }) => {
  await open(page, { tutorialSeen: true });
  await page.getByRole('button', { name: 'Settings' }).click();
  const dialog = page.getByRole('dialog', { name: 'Settings' });
  await expect(dialog).toBeVisible();
  await dialog.getByRole('radiogroup', { name: 'Visual quality' }).getByRole('radio', { name: 'Low' }).click();
  await dialog.getByRole('radiogroup', { name: 'Motion' }).getByRole('radio', { name: 'Reduced' }).click();
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('boostback:v1')!).settings);
  expect(stored.quality).toBe('low');
  expect(stored.motion).toBe('reduce');
  await page.reload();
  await page.getByRole('button', { name: 'Settings' }).click();
  await expect(page.getByRole('radiogroup', { name: 'Visual quality' }).getByRole('radio', { name: 'Low' })).toHaveAttribute('aria-checked', 'true');
});

test('about panel is reachable and keyboard dismissable', async ({ page }) => {
  await open(page, { tutorialSeen: true });
  await page.getByRole('button', { name: 'About this simulation' }).click();
  await expect(page.getByRole('dialog', { name: 'About this simulation' })).toContainText('not affiliated');
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toBeHidden();
});
