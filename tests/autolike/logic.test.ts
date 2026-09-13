import test from 'node:test';
import assert from 'node:assert/strict';
import { MODES, normalizeDebugConfig, nextDelay } from '../../src/autolike/config.ts';
import { createButtonFinder, type DetectorEnvironment, type LikeButtonElement } from '../../src/autolike/detector.ts';
import { AutoLikeEngine } from '../../src/autolike/click-engine.ts';
import { StatisticsTracker } from '../../src/autolike/statistics.ts';

function button(overrides: Partial<LikeButtonElement> = {}): LikeButtonElement {
  return {
    isConnected: true,
    parentElement: null,
    className: '',
    getBoundingClientRect: () => ({ width: 10, height: 10 }),
    closest: () => null,
    querySelector: () => null,
    querySelectorAll: () => [],
    getElementsByClassName: () => [],
    dispatchEvent: () => true,
    click: () => {},
    ...overrides,
  };
}

function detector(buttons: LikeButtonElement[]): DetectorEnvironment {
  return {
    document: {
      querySelectorAll: () => buttons,
      getElementsByClassName: () => [],
    },
    getComputedStyle: () => ({
      display: 'block',
      visibility: 'visible',
      opacity: '1',
      cursor: 'pointer',
    }),
  };
}

function timerHarness() {
  const callbacks: Array<() => void> = [];
  const delays: number[] = [];
  const timer = {
    set: (callback: () => void, delay: number) => {
      callbacks.push(callback);
      delays.push(delay);
      return callbacks.length - 1;
    },
    clear: (_id: unknown) => {},
  };
  return {
    callbacks,
    delays,
    timer,
    fire(index: number): void {
      callbacks[index]?.();
    },
  };
}

async function settle(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

test('normalizes debug values and preserves ordering', () => {
  const config = normalizeDebugConfig({ minDelay: 3000, maxDelay: 2, pauseChance: 4 });
  assert.equal(config.minDelay, 2000);
  assert.equal(config.maxDelay, 2000);
  assert.equal(config.pauseChance, 1);
});

test('normalizes cycle limits to a positive minimum', () => {
  const config = normalizeDebugConfig({ maxClicksPerCycle: 0, maxWorkPerCycle: -1 });
  assert.equal(config.maxClicksPerCycle, 1);
  assert.equal(config.maxWorkPerCycle, 1);
});

test('new modes expose exact human-style pacing defaults', () => {
  assert.deepEqual(Object.keys(MODES), ['calm', 'natural', 'active']);
  assert.deepEqual(MODES, {
    calm: {
      minDelay: 205,
      maxDelay: 255,
      doubleTapChance: 0.12,
      tripleTapChance: 0.02,
      pauseChance: 0.08,
      pauseMin: 350,
      pauseMax: 550,
      extraMinDelay: 40,
      extraMaxDelay: 130,
      maxRetries: 3,
      maxClicksPerCycle: 3,
      maxWorkPerCycle: 5,
    },
    natural: {
      minDelay: 160,
      maxDelay: 230,
      doubleTapChance: 0.20,
      tripleTapChance: 0.05,
      pauseChance: 0.06,
      pauseMin: 350,
      pauseMax: 550,
      extraMinDelay: 40,
      extraMaxDelay: 130,
      maxRetries: 3,
      maxClicksPerCycle: 3,
      maxWorkPerCycle: 5,
    },
    active: {
      minDelay: 105,
      maxDelay: 175,
      doubleTapChance: 0.10,
      tripleTapChance: 0.02,
      pauseChance: 0.05,
      pauseMin: 300,
      pauseMax: 500,
      extraMinDelay: 40,
      extraMaxDelay: 130,
      maxRetries: 3,
      maxClicksPerCycle: 3,
      maxWorkPerCycle: 5,
    },
  });
});

test('new mode delays are deterministic at regular and pause bounds', () => {
  const debug = normalizeDebugConfig({});
  const random = (values: number[]) => () => values.shift() ?? 0;
  assert.equal(nextDelay('calm', debug, random([0.99, 0])), 205);
  assert.equal(nextDelay('natural', debug, random([0.99, 0])), 160);
  assert.equal(nextDelay('active', debug, random([0.99, 0])), 105);
  assert.equal(nextDelay('calm', debug, random([0.99, 0.99])), 255);
  assert.equal(nextDelay('natural', debug, random([0.99, 0.99])), 230);
  assert.equal(nextDelay('active', debug, random([0.99, 0.99])), 175);
  assert.equal(nextDelay('calm', debug, random([0.08, 0])), 205);
  assert.equal(nextDelay('calm', debug, random([0.079, 0])), 350);
});

test('each new mode deterministically selects double and triple taps', async () => {
  for (const [mode, roll, extraCount] of [
    ['calm', 0.03, 1],
    ['natural', 0, 2],
    ['active', 0.03, 1],
  ] as const) {
    const harness = timerHarness();
    const target = button({ dispatchEvent: () => true });
    const values = [roll, 0, 0.99, 0, 0];
    const engine = new AutoLikeEngine({
      findButton: () => target,
      browser: detector([target]),
      timer: harness.timer,
      random: () => values.shift() ?? 0,
    }, mode, normalizeDebugConfig({}));

    engine.start();
    await settle();
    assert.equal(harness.delays.filter(delay => delay === 40).length, 1);
    harness.fire(1);
    await settle();
    assert.equal(engine.statistics.stats.multiTaps, 1);
    if (extraCount === 2) {
      harness.fire(3);
      await settle();
    }
    assert.equal(engine.statistics.stats.multiTaps, extraCount);
    engine.stop();
  }
});

test('bounds multi-taps to one scheduling cycle', async () => {
  const harness = timerHarness();
  const target = button({ dispatchEvent: () => true });
  const config = normalizeDebugConfig({
    minDelay: 10,
    maxDelay: 10,
    doubleTapChance: 1,
    tripleTapChance: 1,
    maxClicksPerCycle: 2,
    maxWorkPerCycle: 2,
  });
  const engine = new AutoLikeEngine({
    findButton: () => target,
    browser: detector([target]),
    timer: harness.timer,
    random: () => 0,
  }, 'debug', config);

  engine.start();
  await settle();
  assert.equal(engine.statistics.stats.totalClicks, 1);
  harness.fire(1);
  await settle();
  assert.equal(engine.statistics.stats.totalClicks, 2);
  assert.equal(engine.statistics.stats.multiTaps, 1);
  assert.ok(harness.delays[1] >= 40 && harness.delays[1] <= 130);
  engine.stop();
});

test('missing buttons count skips and retries before a later click', async () => {
  const harness = timerHarness();
  const target = button();
  let lookups = 0;
  const engine = new AutoLikeEngine({
    findButton: () => lookups++ === 0 ? null : target,
    browser: detector([target]),
    timer: harness.timer,
    random: () => 0,
    now: () => 1234,
  }, 'debug', normalizeDebugConfig({
    minDelay: 10,
    maxDelay: 10,
    pauseChance: 0,
  }));

  engine.start();
  await settle();
  assert.deepEqual(engine.statistics.stats, {
    hasActivity: true,
    totalClicks: 0,
    startTime: 1234,
    successfulClicks: 0,
    failedClicks: 0,
    skippedClicks: 1,
    retries: 1,
    multiTaps: 0,
    combos: 0,
    maxCombo: 0,
    currentCombo: 0,
  });
  assert.equal(harness.delays[0], 10);
  harness.fire(0);
  await settle();
  assert.equal(engine.statistics.stats.successfulClicks, 1);
  assert.equal(engine.statistics.stats.skippedClicks, 1);
  assert.equal(engine.statistics.stats.retries, 1);
  engine.stop();
});

test('retry exhaustion stops retrying after maxRetries', async () => {
  const harness = timerHarness();
  const engine = new AutoLikeEngine({
    findButton: () => null,
    browser: detector([]),
    timer: harness.timer,
    random: () => 0,
  }, 'debug', normalizeDebugConfig({
    minDelay: 10,
    maxDelay: 10,
    maxRetries: 2,
  }));

  engine.start();
  await settle();
  harness.fire(0);
  await settle();
  harness.fire(1);
  await settle();
  assert.equal(engine.statistics.stats.skippedClicks, 3);
  assert.equal(engine.statistics.stats.retries, 2);
  assert.equal(engine.statistics.stats.totalClicks, 0);
  engine.stop();
});

test('retry pacing uses nextDelay pause selection', async () => {
  const harness = timerHarness();
  const target = button();
  let lookups = 0;
  const config = normalizeDebugConfig({
    minDelay: 10,
    maxDelay: 10,
    pauseChance: 1,
    pauseMin: 70,
    pauseMax: 70,
  });
  const engine = new AutoLikeEngine({
    findButton: () => lookups++ === 0 ? null : target,
    browser: detector([target]),
    timer: harness.timer,
    random: () => 0,
  }, 'debug', config);

  engine.start();
  await settle();
  assert.equal(harness.delays[0], 70);
  harness.fire(0);
  await settle();
  assert.equal(engine.statistics.stats.successfulClicks, 1);
  engine.stop();
});

test('maxWorkPerCycle bounds retries and successful work together', async () => {
  const harness = timerHarness();
  const target = button();
  let lookups = 0;
  const engine = new AutoLikeEngine({
    findButton: () => lookups++ === 0 ? null : target,
    browser: detector([target]),
    timer: harness.timer,
    random: () => 0,
  }, 'debug', normalizeDebugConfig({
    minDelay: 10,
    maxDelay: 10,
    maxWorkPerCycle: 2,
    maxClicksPerCycle: 3,
  }));

  engine.start();
  await settle();
  harness.fire(0);
  await settle();
  assert.equal(engine.statistics.stats.totalClicks, 1);
  assert.equal(engine.statistics.stats.skippedClicks, 1);
  const workBeforeNextCycle = engine.statistics.stats.totalClicks;
  assert.equal(harness.delays.length, 3);
  engine.stop();
  assert.equal(engine.statistics.stats.totalClicks, workBeforeNextCycle);
});

test('cancellation while awaiting a retry prevents the retry', async () => {
  const harness = timerHarness();
  let lookups = 0;
  const engine = new AutoLikeEngine({
    findButton: () => {
      lookups++;
      return null;
    },
    browser: detector([]),
    timer: harness.timer,
    random: () => 0,
  }, 'debug', normalizeDebugConfig({ minDelay: 10, maxDelay: 10 }));

  engine.start();
  await settle();
  engine.stop();
  harness.fire(0);
  await settle();
  assert.equal(lookups, 1);
  assert.equal(engine.statistics.stats.skippedClicks, 1);
});

test('cancellation while awaiting an extra tap prevents the extra click', async () => {
  const harness = timerHarness();
  let clicks = 0;
  const target = button({ dispatchEvent: () => { clicks++; return true; } });
  const engine = new AutoLikeEngine({
    findButton: () => target,
    browser: detector([target]),
    timer: harness.timer,
    random: () => 0,
  }, 'debug', normalizeDebugConfig({
    doubleTapChance: 1,
    tripleTapChance: 0,
  }));

  engine.start();
  await settle();
  assert.equal(clicks, 1);
  engine.stop();
  harness.fire(1);
  await settle();
  assert.equal(clicks, 1);
});

test('stays stopped until explicitly started and ignores stale timer callbacks', async () => {
  const harness = timerHarness();
  const target = button();
  const engine = new AutoLikeEngine({
    findButton: () => target,
    browser: detector([target]),
    timer: harness.timer,
  }, 'natural', normalizeDebugConfig({}));

  assert.equal(engine.statistics.stats.totalClicks, 0);
  engine.start();
  await settle();
  assert.equal(engine.statistics.stats.totalClicks, 1);
  engine.stop();
  harness.callbacks.forEach(callback => callback());
  assert.equal(engine.statistics.stats.totalClicks, 1);
  engine.start();
  await settle();
  assert.equal(engine.statistics.stats.totalClicks, 2);
  engine.stop();
});

test('statistics track successful and failed attempts', () => {
  const tracker = new StatisticsTracker(() => 1234);
  tracker.record(true);
  tracker.record(false);
  assert.deepEqual(tracker.stats, {
    hasActivity: true,
    totalClicks: 2,
    startTime: 1234,
    successfulClicks: 1,
    failedClicks: 1,
    skippedClicks: 0,
    retries: 0,
    multiTaps: 0,
    combos: 1,
    maxCombo: 1,
    currentCombo: 0,
  });
});

test('button finder prefers a visible stable e2e button', () => {
  const hidden = button({ getBoundingClientRect: () => ({ width: 0, height: 0 }) });
  const visible = button();
  assert.equal(createButtonFinder(detector([hidden, visible]))(), visible);
});

test('button finder abandons detached roots and discovers a replacement', () => {
  let connected = true;
  const root = button({ isConnected: true });
  const oldButton = button({ closest: () => root });
  const replacement = button();
  const documentRoot = {
    querySelectorAll: () => connected ? [oldButton] : [replacement],
    getElementsByClassName: () => [],
    contains: (element: LikeButtonElement) => element === root && connected,
  };
  const finder = createButtonFinder({ ...detector([]), document: documentRoot });
  assert.equal(finder(), oldButton);
  connected = false;
  root.isConnected = false;
  oldButton.isConnected = false;
  assert.equal(finder(), replacement);
});

test('dispatch failure counts one attempt', async () => {
  const failing = button({ dispatchEvent: () => false });
  const harness = timerHarness();
  const engine = new AutoLikeEngine({
    findButton: () => failing,
    browser: detector([failing]),
    timer: harness.timer,
  }, 'natural', normalizeDebugConfig({ maxRetries: 0 }));
  engine.start();
  await settle();
  assert.equal(engine.statistics.stats.totalClicks, 1);
  assert.equal(engine.statistics.stats.failedClicks, 1);
  engine.stop();
});
