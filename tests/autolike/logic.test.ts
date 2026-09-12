import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeDebugConfig, nextDelay } from '../../src/autolike/config.ts';
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
test('human delay uses pause or regular range', () => {
  assert.equal(nextDelay('human', normalizeDebugConfig({}), () => 0), 100);
  let calls = 0;
  assert.equal(nextDelay('human', normalizeDebugConfig({}), () => (++calls === 1 ? 0.99 : 0.999999)), 450);
});
test('statistics track successful and failed attempts', () => {
  const tracker = new StatisticsTracker(() => 1234);
  tracker.record(true); tracker.record(false);
  assert.deepEqual(tracker.stats, { hasActivity: true, totalClicks: 2, startTime: 1234, successfulClicks: 1, failedClicks: 1, combos: 1, maxCombo: 1, currentCombo: 0 });
});
test('button finder prefers a visible stable e2e button', () => {
  const hidden = button({ getBoundingClientRect: () => ({ width: 0, height: 0 }) });
  const visible = button();
  assert.equal(createButtonFinder(detector([hidden, visible]))(), visible);
});
test('combo dispatch failure counts one attempt', async () => {
  const failing = button({ dispatchEvent: () => false });
  const timer = { set: (_callback: () => void, _delay: number) => 1, clear: (_id: unknown) => {} };
  const engine = new AutoLikeEngine({ findButton: () => failing, browser: detector([failing]), timer }, 'combo', normalizeDebugConfig({}));
  engine.start(); await Promise.resolve();
  assert.equal(engine.statistics.stats.totalClicks, 1); assert.equal(engine.statistics.stats.failedClicks, 1);
  engine.stop();
});
