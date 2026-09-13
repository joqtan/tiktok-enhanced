import test from 'node:test';
import assert from 'node:assert/strict';
import {
  AUTOLIKE_MODE_STORAGE_KEY,
  clampWidgetPosition,
  FloatingWidget,
  formatCompactCount,
  VISIBLE_MODES,
} from '../../src/userscript/floating-widget.ts';

class Events {
  private listeners = new Map<string, Set<(event: unknown) => void>>();
  addEventListener(name: string, listener: (event: unknown) => void): void {
    const listeners = this.listeners.get(name) ?? new Set();
    listeners.add(listener); this.listeners.set(name, listeners);
  }
  removeEventListener(name: string, listener: (event: unknown) => void): void { this.listeners.get(name)?.delete(listener); }
  dispatch(name: string, event: unknown): void { this.listeners.get(name)?.forEach(listener => listener(event)); }
  count(name: string): number { return this.listeners.get(name)?.size ?? 0; }
}

function setup(saved?: string, savedMode?: string, storageFailure = false) {
  const documentEvents = new Events();
  const windowEvents = new Events();
  const values = new Map<string, string>();
  if (saved !== undefined) values.set('tiktok-enhanced:floating-widget-position', saved);
  if (savedMode !== undefined) values.set(AUTOLIKE_MODE_STORAGE_KEY, savedMode);
  const storage = {
    value: saved ?? null,
    getItem: (key: string) => {
      if (storageFailure) throw new Error('storage unavailable');
      return values.get(key) ?? null;
    },
    setItem: (key: string, value: string) => {
      if (storageFailure) throw new Error('storage unavailable');
      values.set(key, value); storage.value = value;
    },
  };
  const elementEvents = new Events();
  const modeControl = {
    value: 'natural',
    addEventListener: elementEvents.addEventListener.bind(elementEvents),
    removeEventListener: elementEvents.removeEventListener.bind(elementEvents),
  };
  const element = {
    style: { cssText: '', left: '', top: '', right: '', bottom: '' }, offsetWidth: 190, offsetHeight: 70,
    innerHTML: '', setAttribute: () => {}, addEventListener: elementEvents.addEventListener.bind(elementEvents),
    removeEventListener: elementEvents.removeEventListener.bind(elementEvents), remove: () => { removed = true; },
    querySelector: (selector: string) => selector === '[data-widget-mode]' ? modeControl : ({ textContent: '', setAttribute: () => {} }),
  };
  let removed = false;
  const document = { body: { appendChild: () => {} }, createElement: () => element,
    addEventListener: documentEvents.addEventListener.bind(documentEvents), removeEventListener: documentEvents.removeEventListener.bind(documentEvents) };
  const window = { innerWidth: 400, innerHeight: 300, addEventListener: windowEvents.addEventListener.bind(windowEvents),
    removeEventListener: windowEvents.removeEventListener.bind(windowEvents), setInterval: () => 1, clearInterval: () => {} };
  const timer = { setInterval: () => 1, clearInterval: () => { cleared = true; } };
  let cleared = false;
  const engine = {
    modes: [] as string[],
    setMode: (mode: string) => { engine.modes.push(mode); },
    statistics: { stats: { totalClicks: 0, successfulClicks: 0, failedClicks: 0, currentCombo: 0, maxCombo: 0 } },
  };
  const widget = new FloatingWidget({ document: document as never, window: window as never, storage, timer, engine: engine as never });
  return { widget, documentEvents, windowEvents, elementEvents, modeControl, storage, values, engine, window, get removed() { return removed; }, get cleared() { return cleared; } };
}

const pointer = (pointerId: number, clientX: number, clientY: number) => ({ pointerId, clientX, clientY }) as PointerEvent;

test('formats large counters for compact stat cells', () => {
  assert.equal(formatCompactCount(999), '999');
  assert.equal(formatCompactCount(1_200), '1.2K');
  assert.equal(formatCompactCount(999_999), '1M');
  assert.equal(formatCompactCount(1_000_000), '1M');
  assert.equal(formatCompactCount(1_200_000_000), '1.2B');
});

test('clamps positions to the viewport', () => {
  assert.deepEqual(clampWidgetPosition({ left: -5, top: 500 }, { width: 400, height: 300 }, { width: 100, height: 80 }), { left: 0, top: 220 });
});

test('renders the autolike module shell and visible controls', () => {
  const app = setup();
  assert.equal(app.widget.activeModule, 'autolike');
  assert.match(app.widget.element.innerHTML, /data-widget-toggle/);
  assert.match(app.widget.element.innerHTML, /data-widget-mode/);
  assert.deepEqual(VISIBLE_MODES, ['calm', 'natural', 'active']);
  assert.match(app.widget.element.innerHTML, /value="calm">Calm/);
  assert.match(app.widget.element.innerHTML, /value="natural" selected>Natural/);
  assert.match(app.widget.element.innerHTML, /value="active">Active/);
  assert.doesNotMatch(app.widget.element.innerHTML, /value="(?:normal|turbo|stealth|human|combo)"/);
  assert.match(app.widget.element.innerHTML, /data-widget-settings/);
  assert.match(app.widget.element.innerHTML, /data-widget-stat="max-combo"/);
});

for (const mode of VISIBLE_MODES) {
  test(`restores ${mode} mode and synchronizes the engine during mount`, () => {
    const app = setup(undefined, mode);
    assert.deepEqual(app.engine.modes, [mode]);
    assert.match(app.widget.element.innerHTML, new RegExp(`value="${mode}" selected>${mode[0].toUpperCase()}${mode.slice(1)}`));
  });
}

test('persists valid mode changes', () => {
  const app = setup();
  app.modeControl.value = 'calm';
  app.elementEvents.dispatch('change', {});
  assert.equal(app.values.get(AUTOLIKE_MODE_STORAGE_KEY), 'calm');
});

test('falls back to natural for invalid and obsolete stored modes', () => {
  for (const stored of ['normal', 'turbo', 'stealth', 'human', 'combo', '{bad']) {
    const app = setup(undefined, stored);
    assert.match(app.widget.element.innerHTML, /value="natural" selected>Natural/);
    assert.deepEqual(app.engine.modes, ['natural']);
  }
});

test('ignores storage failures while using the natural fallback', () => {
  assert.doesNotThrow(() => {
    const app = setup(undefined, undefined, true);
    assert.deepEqual(app.engine.modes, ['natural']);
    app.modeControl.value = 'active';
    app.elementEvents.dispatch('change', {});
  });
});

test('restores stored position and persists a drag', () => {
  const app = setup('{"left":40,"top":50}');
  assert.deepEqual(app.widget.getPosition(), { left: 40, top: 50 });
  app.elementEvents.dispatch('pointerdown', pointer(1, 50, 60));
  app.documentEvents.dispatch('pointermove', pointer(1, 150, 160));
  app.documentEvents.dispatch('pointerup', pointer(1, 150, 160));
  assert.deepEqual(app.widget.getPosition(), { left: 140, top: 150 });
  assert.equal(app.storage.value, '{"left":140,"top":150}');
});

test('pointer cancellation ends the drag and saves its position', () => {
  const app = setup();
  app.elementEvents.dispatch('pointerdown', pointer(2, 20, 20));
  app.documentEvents.dispatch('pointermove', pointer(2, -10, -10));
  app.documentEvents.dispatch('pointercancel', pointer(2, -10, -10));
  assert.deepEqual(app.widget.getPosition(), { left: 0, top: 0 });
  assert.equal(app.storage.value, '{"left":0,"top":0}');
});

test('resize clamps and persists the current position', () => {
  const app = setup('{"left":200,"top":200}');
  app.window.innerWidth = 210; app.window.innerHeight = 100;
  app.windowEvents.dispatch('resize', {});
  assert.deepEqual(app.widget.getPosition(), { left: 20, top: 30 });
  assert.equal(app.storage.value, '{"left":20,"top":30}');
});

test('destroy removes listeners, timer, and element', () => {
  const app = setup();
  app.widget.destroy(); app.widget.destroy();
  assert.equal(app.documentEvents.count('pointermove'), 0);
  assert.equal(app.windowEvents.count('resize'), 0);
  assert.equal(app.cleared, true);
  assert.equal(app.removed, true);
});
