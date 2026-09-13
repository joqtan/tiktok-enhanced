import test from 'node:test';
import assert from 'node:assert/strict';
import { createAutolikeRuntime, isLivePath } from '../../src/userscript/index.ts';

class EventTargetFake {
  private readonly listeners = new Map<string, Set<() => void>>();
  addEventListener(name: string, listener: () => void): void {
    const set = this.listeners.get(name) ?? new Set(); set.add(listener); this.listeners.set(name, set);
  }
  removeEventListener(name: string, listener: () => void): void { this.listeners.get(name)?.delete(listener); }
  dispatch(name: string): void { this.listeners.get(name)?.forEach(listener => listener()); }
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
  assert.equal(sessions.length, 1);
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
