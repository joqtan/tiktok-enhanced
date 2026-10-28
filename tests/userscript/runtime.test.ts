import test from 'node:test';
import assert from 'node:assert/strict';
import { createAutolikeRuntime, isLivePath } from '../../src/userscript/index.ts';
import { liveProfile, readAutostartProfiles } from '../../src/userscript/autostart.ts';

class EventTargetFake {
  private readonly listeners = new Map<string, Set<() => void>>();
  addEventListener(name: string, listener: () => void): void {
    const set = this.listeners.get(name) ?? new Set(); set.add(listener); this.listeners.set(name, set);
  }
  removeEventListener(name: string, listener: () => void): void { this.listeners.get(name)?.delete(listener); }
  dispatch(name: string): void { this.listeners.get(name)?.forEach(listener => listener()); }
  count(name: string): number { return this.listeners.get(name)?.size ?? 0; }
}

test('recognizes live stream paths only', () => {
  assert.equal(isLivePath('/live'), true);
  assert.equal(isLivePath('/live/creator-name'), true);
  assert.equal(isLivePath('/@kleicastilloo/live'), true);
  assert.equal(isLivePath('/@kleicastilloo/live/'), true);
  assert.equal(isLivePath('/video/123'), false);
  assert.equal(isLivePath('/lifestyle'), false);
});

test('hardens live navigation through pushState, replaceState, and popstate', () => {
  const events = new EventTargetFake();
  const location = { pathname: '/@a/live' };
  const originalPush = function (this: History, _state: unknown, _title: string, url?: string | URL | null): void {
    if (url) location.pathname = new URL(String(url), 'https://www.tiktok.com').pathname;
  };
  const originalReplace = function (this: History, _state: unknown, _title: string, url?: string | URL | null): void {
    if (url) location.pathname = new URL(String(url), 'https://www.tiktok.com').pathname;
  };
  const history = { pushState: originalPush, replaceState: originalReplace };
  const window = { location, history, addEventListener: events.addEventListener.bind(events), removeEventListener: events.removeEventListener.bind(events) };
  const sessions: Array<{ starts: number; stops: number; destroyed: number; statistics: { totalClicks: number } }> = [];
  const runtime = createAutolikeRuntime({
    window: window as never, document: {} as Document,
    createLayout: () => ({ destroy: () => {} }),
    createEngine: () => {
      const session = { starts: 0, stops: 0, destroyed: 0, statistics: { totalClicks: 0 } };
      sessions.push(session);
      return { start: () => { session.starts++; }, stop: () => { session.stops++; }, statistics: { stats: session.statistics } } as never;
    },
    createWidget: () => {
      const session = sessions[sessions.length - 1];
      return { destroy: () => { session.destroyed++; } } as never;
    },
  });
  runtime.install(); runtime.start();
  window.history.pushState({}, '', '/@a/live?tab=1#chat');
  events.dispatch('hashchange');
  assert.equal(sessions.length, 1, 'same pathname must preserve the session');
  assert.equal(sessions[0].starts, 0);
  sessions[0].statistics.totalClicks = 7;
  window.history.pushState({}, '', '/@b/live');
  assert.equal(sessions.length, 2);
  assert.deepEqual(sessions[0], { starts: 0, stops: 1, destroyed: 1, statistics: { totalClicks: 7 } });
  window.history.replaceState({}, '', '/video/42');
  assert.equal(sessions.length, 2);
  assert.deepEqual(sessions[1], { starts: 0, stops: 1, destroyed: 1, statistics: { totalClicks: 0 } });
  location.pathname = '/@a/live'; events.dispatch('popstate');
  assert.equal(sessions.length, 3);
  assert.equal(sessions[2].stops, 0);
  assert.equal(sessions[2].destroyed, 0);
  assert.notEqual(sessions[1].statistics, sessions[2].statistics);
  assert.equal(sessions[2].statistics.totalClicks, 0);
  runtime.destroy(); runtime.destroy();
  assert.equal(sessions[2].stops, 1);
  assert.equal(sessions[2].destroyed, 1);
  runtime.uninstall();
});

for (const saved of ['["alice"]', '["ALICE"]', '[]', '{bad', '{}', '["alice",42]', '["<script>"]']) {
  test(`autostarts only validated allowlisted profiles: ${saved}`, () => {
    const location = { pathname: '/@alice/live/' };
    const order: string[] = [];
    let starts = 0;
    const runtime = createAutolikeRuntime({
      window: { location, localStorage: { getItem: () => saved } } as never,
      document: {} as Document,
      createLayout: () => ({ destroy: () => {} }),
      createEngine: () => ({ start: () => { starts++; order.push('start'); }, stop: () => {} }) as never,
      createWidget: () => { order.push('widget'); return { destroy: () => {}, refresh: () => {} } as never; },
    });
    runtime.start();
    const allowed = saved === '["alice"]' || saved === '["ALICE"]';
    assert.equal(starts, allowed ? 1 : 0);
    if (allowed) assert.deepEqual(order, ['widget', 'start'], 'widget restores mode before starting');
    runtime.sync();
    assert.equal(starts, allowed ? 1 : 0, 'same route never restarts');
    location.pathname = '/video/42'; runtime.sync();
    location.pathname = '/@alice/live/'; runtime.sync();
    assert.equal(starts, allowed ? 2 : 0, 'next entry may start again');
    location.pathname = '/live'; runtime.sync();
    location.pathname = '/live/alice'; runtime.sync();
    assert.equal(starts, allowed ? 2 : 0, 'unknown profile never starts');
    runtime.destroy();
  });
}

test('validates explicit profile paths and handles unavailable storage', () => {
  assert.equal(liveProfile('/@Alice.name_1/live/'), 'alice.name_1');
  for (const path of ['/live', '/live/alice', '/@alice/video', '/@alice/live/extra', '/@a%2Fb/live', '/@a b/live']) {
    assert.equal(liveProfile(path), null);
  }
  assert.deepEqual(readAutostartProfiles(undefined), []);
  assert.deepEqual(readAutostartProfiles({ getItem: () => { throw new Error('denied'); }, setItem: () => {} }), []);
});

test('manual pause survives same-path history and hash events until the next entry', () => {
  const events = new EventTargetFake();
  const location = { pathname: '/@alice/live' };
  const engines: Array<{ status: string; start(): void; stop(): void; starts: number; stops: number }> = [];
  const navigate = (_state: unknown, _title: string, url?: string | URL | null) => {
    if (url) location.pathname = new URL(String(url), 'https://www.tiktok.com').pathname;
  };
  const window = { location, history: { pushState: navigate, replaceState: navigate },
    localStorage: { getItem: () => '["alice","bob"]' },
    addEventListener: events.addEventListener.bind(events), removeEventListener: events.removeEventListener.bind(events) };
  const cleanup: string[] = [];
  const runtime = createAutolikeRuntime({ window: window as never, document: {} as Document,
    createLayout: () => ({ destroy: () => { cleanup.push('layout'); } }),
    createEngine: () => {
      const engine = { status: 'stopped', starts: 0, stops: 0,
        start: () => { engine.starts++; engine.status = 'running'; },
        stop: () => { engine.stops++; engine.status = 'stopped'; cleanup.push('stop'); } };
      engines.push(engine); return engine as never;
    },
    createWidget: () => ({ refresh: () => {}, destroy: () => { cleanup.push('destroy'); } }) as never,
  });
  runtime.install(); runtime.start();
  engines[0].stop();
  window.history.pushState({}, '', '/@alice/live?tab=chat');
  window.history.replaceState({}, '', '/@alice/live#chat');
  events.dispatch('hashchange'); events.dispatch('popstate');
  assert.equal(engines.length, 1);
  assert.equal(engines[0].starts, 1);
  assert.equal(engines[0].status, 'stopped');
  cleanup.length = 0;
  window.history.pushState({}, '', '/@bob/live');
  assert.deepEqual(cleanup, ['stop', 'destroy', 'layout']);
  assert.equal(engines.length, 2);
  assert.equal(engines[1].starts, 1);
  runtime.destroy(); runtime.uninstall();
  assert.equal(events.count('hashchange'), 0);
  assert.equal(events.count('popstate'), 0);
});

test('layout sessions are live-only and prior resources are disposed when layout construction fails', () => {
  const location = { pathname: '/video/1' };
  const events: string[] = [];
  const runtime = createAutolikeRuntime({
    window: { location } as never, document: {} as Document,
    createEngine: () => ({ stop: () => events.push('stop') }) as never,
    createWidget: () => ({ destroy: () => events.push('widget') }) as never,
    createLayout: () => { events.push('layout'); return { destroy: () => events.push('layout destroy') }; },
  });
  runtime.start();
  assert.deepEqual(events, []);
  location.pathname = '/@a/live'; runtime.start(); runtime.sync();
  assert.deepEqual(events, ['layout']);
  location.pathname = '/@b/live'; runtime.sync();
  assert.deepEqual(events, ['layout', 'stop', 'widget', 'layout destroy', 'layout']);
  location.pathname = '/video/1'; runtime.sync(); runtime.destroy();
  assert.deepEqual(events.slice(-3), ['stop', 'widget', 'layout destroy']);

  const failed = createAutolikeRuntime({
    window: { location: { pathname: '/live' } } as never, document: {} as Document,
    createEngine: () => ({ stop: () => events.push('failed stop') }) as never,
    createWidget: () => ({ destroy: () => events.push('failed widget') }) as never,
    createLayout: () => { throw new Error('layout failed'); },
  });
  assert.throws(() => failed.start(), /layout failed/);
  assert.deepEqual(events.slice(-2), ['failed stop', 'failed widget']);
});
