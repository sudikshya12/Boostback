import { expect, test } from '@playwright/test';
import { expectNoHorizontalOverflow, expectUnobstructed, open, view } from './helpers';

test('touch controls appear and work on a phone', async ({ page }) => {
  await open(page, { tutorialSeen: true, difficulty: 'training', touch: 'on' });
  await expectUnobstructed(page, 'start');
  await expectNoHorizontalOverflow(page);
  await page.getByTestId('start').tap();

  const slider = page.getByRole('slider', { name: 'Throttle' });
  await expect(slider).toBeVisible();
  await expect(page.getByRole('button', { name: 'Tilt left' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Tilt right' })).toBeVisible();

  // Drag the throttle slider to the top.
  const box = (await slider.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height - 10);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2, box.y + 5, { steps: 5 });
  await page.waitForTimeout(500);
  await page.mouse.up();
  expect((await view(page)).throttleCmd).toBeGreaterThan(0.9);

  await page.getByRole('button', { name: 'Deploy landing legs' }).dispatchEvent('pointerdown');
  await expect.poll(async () => (await view(page)).legsCommanded).toBe(true);
  await expectNoHorizontalOverflow(page);
});
