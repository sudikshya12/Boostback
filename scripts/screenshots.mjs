// Visual QA: captures the key states of the game with Playwright.
// Usage: node scripts/screenshots.mjs [outDir] [baseUrl]
// Requires the dev server (npm run dev) because it uses the dev-only debug handle.
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

const out = process.argv[2] ?? 'qa-screens';
const base = process.argv[3] ?? 'http://localhost:5173/';
mkdirSync(out, { recursive: true });

const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });

async function page(viewport, opts = {}) {
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: 1, hasTouch: !!opts.touch, isMobile: !!opts.touch });
  const p = await ctx.newPage();
  p.on('console', (m) => m.type() === 'error' && console.log('[console]', m.text()));
  p.on('pageerror', (e) => console.log('[pageerror]', e.message));
  await p.addInitScript((s) => {
    localStorage.setItem('boostback:v1', JSON.stringify({ storageVersion: 1, settings: s, bests: {}, recent: [], replays: [] }));
  }, { tutorialSeen: true, difficulty: opts.difficulty ?? 'standard', quality: opts.quality ?? 'high', touch: opts.touch ? 'on' : 'auto' });
  await p.goto(base);
  await p.waitForFunction(() => !!window.__boostback);
  // Wait for the canvas and first shader compile (slow in software WebGL).
  await p.waitForSelector('canvas');
  await p.waitForTimeout(6000);
  return p;
}

const waitFor = (p, fn, timeout = 120000) => p.waitForFunction(fn, null, { timeout, polling: 100 });
const shot = async (p, name) => {
  await p.screenshot({ path: join(out, `${name}.png`) });
  console.log('saved', name);
};

const only = process.env.ONLY?.split(',');
const want = (n) => !only || only.includes(n);

if (want('desktop')) {
  const p = await page({ width: 1440, height: 900 });
  await shot(p, '01-ready');
  await p.getByTestId('start').click();
  await p.waitForTimeout(3500);
  await shot(p, '02-mid-descent');
  // Successful landing with the demo controller.
  await p.evaluate(() => window.__boostback.useGame.getState().watchDemo());
  await waitFor(p, () => window.__boostback.runtime.view.clearance < 60 && window.__boostback.runtime.view.t > 3);
  await shot(p, '03-final-approach');
  await waitFor(p, () => ['landed', 'failed'].includes(window.__boostback.useGame.getState().phase));
  await p.waitForTimeout(900);
  await shot(p, '04-success');
  await p.getByTestId('watch-replay').click();
  await p.waitForTimeout(400);
  await p.evaluate(() => window.__boostback.runtime.seekReplay(window.__boostback.runtime.replay.duration * 0.55));
  await p.evaluate(() => window.__boostback.useGame.getState().setReplayPlaying(false));
  await p.waitForTimeout(600);
  await shot(p, '05-replay');
  await p.getByTestId('replay-back').click();
  await p.getByTestId('toggle-analysis').click();
  await p.waitForTimeout(400);
  await shot(p, '06-analysis');
  // Failure: no input, the booster falls onto the deck.
  await p.getByTestId('try-again').click();
  await waitFor(p, () => ['landed', 'failed'].includes(window.__boostback.useGame.getState().phase));
  await p.waitForTimeout(600);
  await shot(p, '07-failure');
}

if (want('mobile')) {
  const p = await page({ width: 390, height: 844 }, { touch: true, difficulty: 'training' });
  await shot(p, '08-mobile-ready');
  await p.getByTestId('start').click();
  await p.waitForTimeout(2500);
  await shot(p, '09-mobile-play');
}

await browser.close();
