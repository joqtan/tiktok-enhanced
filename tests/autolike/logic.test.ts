import test from 'node:test';
import assert from 'node:assert/strict';
import { MODES, normalizeDebugConfig, nextDelay } from '../../src/autolike/config.ts';
import { createButtonFinder, type DetectorEnvironment, type LikeButtonElement } from '../../src/autolike/detector.ts';
import { AutoLikeEngine } from '../../src/autolike/click-engine.ts';
import { StatisticsTracker } from '../../src/autolike/statistics.ts';

function button(overrides: Partial<LikeButtonElement> = {}): LikeButtonElement {
  return {
    isConnected: true, parentElement: null, className: '',
    getBoundingClientRect: () => ({ width: 10, height: 10 }),
    closest: () => null, querySelector: () => null, querySelectorAll: () => [],
    getElementsByClassName: () => [], dispatchEvent: () => true, click: () => {}, ...overrides,
  };
}
function detector(buttons: LikeButtonElement[]): DetectorEnvironment {
  return {
    document: { querySelectorAll: () => buttons, getElementsByClassName: () => [] },
    getComputedStyle: () => ({ display: 'block', visibility: 'visible', opacity: '1', cursor: 'pointer' }),
  };
}

test('normalizes debug values and preserves ordering', () => {
  const config = normalizeDebugConfig({ minDelay: 3000, maxDelay: 2, pauseChance: 4 });
  assert.equal(config.minDelay, 2000); assert.equal(config.maxDelay, 2000); assert.equal(config.pauseChance, 1);
});
test('new modes expose exact human-style pacing defaults', () => {
  assert.deepEqual(Object.keys(MODES), ['calm', 'natural', 'active']);
  assert.deepEqual(MODES, {
    calm: { minDelay: 205, maxDelay: 255, doubleTapChance: 0.12, tripleTapChance: 0.02, pauseChance: 0.08, pauseMin: 350, pauseMax: 550 },
    natural: { minDelay: 160, maxDelay: 230, doubleTapChance: 0.20, tripleTapChance: 0.05, pauseChance: 0.06, pauseMin: 350, pauseMax: 550 },
    active: { minDelay: 105, maxDelay: 175, doubleTapChance: 0.10, tripleTapChance: 0.02, pauseChance: 0.05, pauseMin: 300, pauseMax: 500 },
  });
});
test('new mode delays are deterministic at regular and pause bounds', () => {
  const debug = normalizeDebugConfig({});
  assert.equal(nextDelay('calm', debug, (() => { const values = [0.99, 0]; return () => values.shift() ?? 0; })()), 205);
  assert.equal(nextDelay('natural', debug, (() => { const values = [0.99, 0]; return () => values.shift() ?? 0; })()), 160);
  assert.equal(nextDelay('active', debug, (() => { const values = [0.99, 0]; return () => values.shift() ?? 0; })()), 105);
  assert.equal(nextDelay('calm', debug, (() => { const values = [0.99, 0.99]; return () => values.shift() ?? 0; })()), 255);
  assert.equal(nextDelay('natural', debug, (() => { const values = [0.99, 0.99]; return () => values.shift() ?? 0; })()), 230);
  assert.equal(nextDelay('active', debug, (() => { const values = [0.99, 0.99]; return () => values.shift() ?? 0; })()), 175);
  assert.equal(nextDelay('calm', debug, (() => { const values = [0.08, 0]; return () => values.shift() ?? 0; })()), 205);
  assert.equal(nextDelay('calm', debug, (() => { const values = [0.079, 0]; return () => values.shift() ?? 0; })()), 350);
});
test('each new mode deterministically selects double and triple taps', async () => {
  for (const [mode, roll, extraCount] of [['calm', 0.03, 1], ['natural', 0, 2], ['active', 0.03, 1]] as const) {
    const scheduled: number[] = []; const callbacks: Array<() => void> = [];
    const target = button({ dispatchEvent: () => true });
    const timer = { set: (callback: () => void, delay: number) => { callbacks.push(callback); scheduled.push(delay); return scheduled.length; }, clear: (_id: unknown) => {} };
    const values = [roll, 0, 0.99, 0, 0];
    const engine = new AutoLikeEngine({ findButton: () => target, browser: detector([target]), timer, random: () => values.shift() ?? 0 }, mode, normalizeDebugConfig({}));
    engine.start(); await Promise.resolve(); assert.equal(scheduled.filter(delay => delay === 40).length, 1);
    callbacks[1]?.(); assert.equal(scheduled.filter(delay => delay === 40).length, extraCount); engine.stop();
  }
});
test('stays stopped until explicitly started and ignores stale timer callbacks', async () => {
  const callbacks: Array<() => void> = []; const target = button({ dispatchEvent: () => true });
  const timer = { set: (callback: () => void) => { callbacks.push(callback); return callbacks.length; }, clear: (_id: unknown) => {} };
  const engine = new AutoLikeEngine({ findButton: () => target, browser: detector([target]), timer }, 'natural', normalizeDebugConfig({}));
  assert.equal(engine.statistics.stats.totalClicks, 0); engine.start(); await Promise.resolve(); assert.equal(engine.statistics.stats.totalClicks, 1);
  engine.stop(); callbacks.forEach(callback => callback()); assert.equal(engine.statistics.stats.totalClicks, 1); engine.start(); await Promise.resolve(); assert.equal(engine.statistics.stats.totalClicks, 2); engine.stop();
});
test('statistics track successful and failed attempts', () => {
  const tracker = new StatisticsTracker(() => 1234); tracker.record(true); tracker.record(false);
  assert.deepEqual(tracker.stats, { hasActivity: true, totalClicks: 2, startTime: 1234, successfulClicks: 1, failedClicks: 1, combos: 1, maxCombo: 1, currentCombo: 0 });
});
test('button finder prefers a visible stable e2e button', () => {
  const hidden = button({ getBoundingClientRect: () => ({ width: 0, height: 0 }) }); const visible = button();
  assert.equal(createButtonFinder(detector([hidden, visible]))(), visible);
});
test('button finder abandons detached roots and discovers a replacement', () => {
  let connected = true;
  const root = button({ isConnected: true });
  const oldButton = button({ closest: () => root }); const replacement = button();
  const documentRoot = { querySelectorAll: () => connected ? [oldButton] : [replacement], getElementsByClassName: () => [], contains: (element: LikeButtonElement) => element === root && connected };
  const finder = createButtonFinder({ ...detector([]), document: documentRoot });
  assert.equal(finder(), oldButton); connected = false; root.isConnected = false; oldButton.isConnected = false; assert.equal(finder(), replacement);
});
test('dispatch failure counts one attempt', async () => {
  const failing = button({ dispatchEvent: () => false }); const timer = { set: (_callback: () => void, _delay: number) => 1, clear: (_id: unknown) => {} };
  const engine = new AutoLikeEngine({ findButton: () => failing, browser: detector([failing]), timer }, 'natural', normalizeDebugConfig({}));
  engine.start(); await Promise.resolve(); assert.equal(engine.statistics.stats.totalClicks, 1); assert.equal(engine.statistics.stats.failedClicks, 1); engine.stop();
});
