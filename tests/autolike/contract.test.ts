import test from 'node:test';
import assert from 'node:assert/strict';
import { AutoLikeEngine } from '../../src/autolike/click-engine.ts';
import { normalizeDebugConfig } from '../../src/autolike/config.ts';
import type { LikeButtonElement } from '../../src/autolike/detector.ts';

const button: LikeButtonElement = {
  isConnected: true,
  parentElement: null,
  getBoundingClientRect: () => ({ width: 1, height: 1 }),
  closest: () => null,
  querySelector: () => null,
  querySelectorAll: () => [],
  getElementsByClassName: () => [],
  dispatchEvent: () => true,
  click: () => {},
};

test('core consumes injected finder, click, and timer adapters without browser globals', async () => {
  const callbacks: Array<() => void> = [];
  let clicks = 0;
  const engine = new AutoLikeEngine({
    findButton: () => button,
    clickButton: () => { clicks++; return true; },
    timer: {
      set: callback => { callbacks.push(callback); return callbacks.length - 1; },
      clear: () => {},
    },
    random: () => 0.99,
  }, 'debug', normalizeDebugConfig({
    doubleTapChance: 0,
    tripleTapChance: 0,
    minDelay: 10,
    maxDelay: 10,
  }));

  engine.start();
  await Promise.resolve();
  assert.equal(clicks, 1);
  assert.equal(engine.status, 'running');
  engine.stop();
});
