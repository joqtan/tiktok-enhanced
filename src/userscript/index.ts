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
import type { AutolikeBrowserAdapters, StorageAdapter } from '../autolike/contract.ts';
import { createButtonFinder, dispatchLikeClick } from '../autolike/detector.ts';
import { DEBUG_CONFIG_DEFAULTS } from '../autolike/config.ts';
import type { DetectorEnvironment, LikeButtonElement, SearchRoot } from '../autolike/detector.ts';
import { createFloatingWidget, type FloatingWidget } from './floating-widget.ts';

/** Return whether a TikTok pathname represents a live stream page. */
export function isLivePath(pathname: string): boolean {
  return pathname === '/live' || pathname.startsWith('/live/') || /^\/@[^/]+\/live\/?$/.test(pathname);
}

function createBrowserEnvironment(documentRef: Document, windowRef: Window): DetectorEnvironment {
  const searchRoot = documentRef as unknown as SearchRoot;
  return {
    document: searchRoot,
    getComputedStyle: (element: LikeButtonElement) => windowRef.getComputedStyle(element as unknown as Element),
    createClickEvent: () => new MouseEvent('click', { bubbles: true, cancelable: true, view: windowRef }),
    logError: (message, error) => console.error(`[tiktok-enhanced] ${message}`, error),
  };
}

/** Compose the browser-specific DOM, timer, and storage adapters at the integration boundary. */
export function createBrowserAdapters(documentRef: Document, windowRef: Window): AutolikeBrowserAdapters {
  const browser = createBrowserEnvironment(documentRef, windowRef);
  return {
    findButton: createButtonFinder(browser),
    clickButton: button => dispatchLikeClick(button, browser),
    timer: {
      set: (callback, delay) => windowRef.setTimeout(callback, delay),
      clear: id => windowRef.clearTimeout(id as number),
    },
    storage: getStorage(windowRef),
  };
}

export interface AutolikeRuntimeOptions {
  window: Window;
  document: Document;
  createEngine?: () => AutoLikeEngine;
  createWidget?: (engine: AutoLikeEngine) => FloatingWidget;
}

/**
 * Owns one engine/widget session and replaces it at every live route entry.
 * A replacement receives a new engine, so its statistics are route-scoped.
 */
export function createAutolikeRuntime(options: AutolikeRuntimeOptions) {
  let activeEngine: AutoLikeEngine | null = null;
  let activeWidget: FloatingWidget | null = null;
  let installed = false;
  let originalPushState: typeof options.window.history.pushState | null = null;
  let originalReplaceState: typeof options.window.history.replaceState | null = null;

  let sessionAdapters: AutolikeBrowserAdapters | undefined;
  const createEngine = options.createEngine ?? (() => {
    sessionAdapters = createBrowserAdapters(options.document, options.window);
    return new AutoLikeEngine({ ...sessionAdapters }, 'natural', DEBUG_CONFIG_DEFAULTS);
  });
  const createWidget = options.createWidget ?? ((engine: AutoLikeEngine) => createFloatingWidget({
    document: options.document, window: options.window, storage: sessionAdapters?.storage ?? getStorage(options.window), engine, initiallyRunning: false,
  }));

  function destroy(): void {
    const engine = activeEngine;
    const widget = activeWidget;
    activeEngine = null;
    activeWidget = null;
    engine?.stop();
    widget?.destroy();
  }

  function start(): AutoLikeEngine | null {
    if (!isLivePath(options.window.location.pathname)) { destroy(); return null; }
    destroy();
    const engine = createEngine();
    activeWidget = createWidget(engine);
    activeEngine = engine;
    return engine;
  }

  function sync(): void { if (isLivePath(options.window.location.pathname)) start(); else destroy(); }

  function install(): void {
    if (installed) return;
    installed = true;
    options.window.addEventListener('popstate', sync);
    options.window.addEventListener('hashchange', sync);
    originalPushState = options.window.history.pushState;
    originalReplaceState = options.window.history.replaceState;
    for (const method of ['pushState', 'replaceState'] as const) {
      const original = options.window.history[method];
      options.window.history[method] = function (this: History, ...args: Parameters<typeof original>): ReturnType<typeof original> {
        const result = original.apply(this, args);
        sync();
        return result;
      } as typeof original;
    }
  }

  function uninstall(): void {
    if (!installed) return;
    options.window.removeEventListener('popstate', sync);
    options.window.removeEventListener('hashchange', sync);
    if (originalPushState) options.window.history.pushState = originalPushState;
    if (originalReplaceState) options.window.history.replaceState = originalReplaceState;
    originalPushState = null;
    originalReplaceState = null;
    installed = false;
  }

  return { start, destroy, sync, install, uninstall, get engine() { return activeEngine; }, get widget() { return activeWidget; } };
}

function getStorage(windowRef: Window): StorageAdapter | undefined {
  try { return windowRef.localStorage; } catch { return undefined; }
}

let runtime: ReturnType<typeof createAutolikeRuntime> | null = null;
if (typeof document !== 'undefined' && typeof window !== 'undefined') {
  runtime = createAutolikeRuntime({ window, document });
  runtime.install();
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => { runtime?.start(); }, { once: true });
  else runtime.start();
}

export function startAutolike(): AutoLikeEngine | null { return runtime?.start() ?? null; }

/** Stop the runtime and remove the floating widget when the userscript is unloaded. */
export function destroyAutolike(): void { runtime?.destroy(); }
