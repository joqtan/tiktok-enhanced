// ==UserScript==
// @name         TikTok Enhanced Autolike
// @namespace    tiktok-enhanced
// @version      0.1.0
// @description  Automatically like TikTok live streams.
// @match        https://www.tiktok.com/*
// @grant        none
// @run-at       document-idle
// ==/UserScript==

import { AutoLikeEngine } from '../autolike/click-engine.ts';
import { createButtonFinder } from '../autolike/detector.ts';
import { DEBUG_CONFIG_DEFAULTS } from '../autolike/config.ts';
import type { DetectorEnvironment, LikeButtonElement, SearchRoot } from '../autolike/detector.ts';
import { createFloatingWidget, type FloatingWidget } from './floating-widget.ts';

/** Return whether a TikTok pathname represents a live stream page. */
export function isLivePath(pathname: string): boolean {
  return pathname === '/live' || pathname.startsWith('/live/') || /^\/@[^/]+\/live\/?$/.test(pathname);
}

function createBrowserEnvironment(): DetectorEnvironment {
  const searchRoot = document as unknown as SearchRoot;
  return {
    document: searchRoot,
    getComputedStyle: (element: LikeButtonElement) => window.getComputedStyle(element as unknown as Element),
    createClickEvent: () => new MouseEvent('click', { bubbles: true, cancelable: true, view: window }),
    logError: (message, error) => console.error(`[tiktok-enhanced] ${message}`, error),
  };
}

let activeEngine: AutoLikeEngine | null = null;
let activeWidget: FloatingWidget | null = null;
let lifecycleInstalled = false;
let originalPushState: typeof history.pushState | null = null;
let originalReplaceState: typeof history.replaceState | null = null;

function syncAutolikeRoute(): void {
  if (isLivePath(window.location.pathname)) startAutolike(); else destroyAutolike();
}

function installLifecycle(): void {
  if (lifecycleInstalled) return;
  lifecycleInstalled = true;
  window.addEventListener('popstate', syncAutolikeRoute);
  window.addEventListener('hashchange', syncAutolikeRoute);
  originalPushState = window.history.pushState;
  originalReplaceState = window.history.replaceState;
  for (const method of ['pushState', 'replaceState'] as const) {
    const original = window.history[method];
    window.history[method] = function (this: History, ...args: Parameters<typeof original>): ReturnType<typeof original> {
      const result = original.apply(this, args);
      syncAutolikeRoute();
      return result;
    } as typeof original;
  }
}

function uninstallLifecycle(): void {
  if (!lifecycleInstalled) return;
  window.removeEventListener('popstate', syncAutolikeRoute);
  window.removeEventListener('hashchange', syncAutolikeRoute);
  if (originalPushState) window.history.pushState = originalPushState;
  if (originalReplaceState) window.history.replaceState = originalReplaceState;
  originalPushState = null; originalReplaceState = null; lifecycleInstalled = false;
}

export function startAutolike(): AutoLikeEngine | null {
  if (!isLivePath(window.location.pathname)) { destroyAutolike(); return null; }
  activeEngine?.stop();
  activeWidget?.destroy();
  const browser = createBrowserEnvironment();
  const engine = new AutoLikeEngine(
    { findButton: createButtonFinder(browser), browser, timer: {
      set: (callback, delay) => window.setTimeout(callback, delay),
      clear: (id) => window.clearTimeout(id as number),
    } },
    'natural',
    DEBUG_CONFIG_DEFAULTS,
  );
  // Live entry is deliberately stopped; the widget is the explicit start boundary.
  activeWidget = createFloatingWidget({
    document, window, storage: getStorage(), engine, initiallyRunning: false,
  });
  activeEngine = engine;
  return engine;
}

function getStorage(): Storage | undefined {
  try { return window.localStorage; } catch { return undefined; }
}

/** Stop the runtime and remove the floating widget when the userscript is unloaded. */
export function destroyAutolike(): void {
  activeEngine?.stop();
  activeEngine = null;
  activeWidget?.destroy();
  activeWidget = null;
}

if (typeof document !== 'undefined' && typeof window !== 'undefined') {
  installLifecycle();
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => { startAutolike(); }, { once: true });
  } else {
    startAutolike();
  }
}
