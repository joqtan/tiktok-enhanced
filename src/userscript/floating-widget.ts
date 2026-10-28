import type { EngineStatus } from '../autolike/click-engine.ts';
import type { AutolikeCore, StorageAdapter } from '../autolike/contract.ts';
import type { RegularMode } from '../autolike/config.ts';
import { liveProfile, readAutostartProfiles, saveAutostartProfiles } from './autostart.ts';

export interface WidgetPosition {
  left: number;
  top: number;
}

export type WidgetStorage = StorageAdapter;

export interface WidgetTimer {
  setInterval(callback: () => void, delay: number): unknown;
  clearInterval(id: unknown): void;
}

export interface FloatingWidgetOptions {
  document: Document;
  window: Window;
  storage?: WidgetStorage;
  storageKey?: string;
  moduleStorageKey?: string;
  timer?: WidgetTimer;
  updateInterval?: number;
  engine?: AutolikeCore;
  initiallyRunning?: boolean;
}

export const FLOATING_WIDGET_STORAGE_KEY = 'tiktok-enhanced:floating-widget-position';
export const COLLAPSED_STORAGE_KEY = 'tiktok-enhanced:floating-widget-collapsed';
export const ACTIVE_MODULE_STORAGE_KEY = 'tiktok-enhanced:floating-widget-module';
export const AUTOLIKE_MODE_STORAGE_KEY = 'tiktok-enhanced:autolike-mode';
export const VISIBLE_MODES: readonly RegularMode[] = ['calm', 'natural', 'active'];

/** Format large counters so compact stat cells remain readable. */
export function formatCompactCount(value: number): string {
  if (value < 1_000) return String(value);
  const units = ['', 'K', 'M', 'B'];
  let unit = 0;
  let scaled = value;
  while (scaled >= 1_000 && unit < units.length - 1) { scaled /= 1_000; unit++; }
  if (Number(scaled.toFixed(1)) >= 1_000 && unit < units.length - 1) { scaled /= 1_000; unit++; }
  return `${scaled.toFixed(scaled >= 100 ? 0 : 1).replace('.0', '')}${units[unit]}`;
}

type WidgetElement = HTMLElement & { value?: string };

/** Keep a widget fully visible, including when the viewport becomes smaller. */
export function clampWidgetPosition(
  position: WidgetPosition,
  viewport: { width: number; height: number },
  widget: { width: number; height: number },
): WidgetPosition {
  const maxLeft = Math.max(0, viewport.width - widget.width);
  const maxTop = Math.max(0, viewport.height - widget.height);
  return {
    left: Math.min(maxLeft, Math.max(0, position.left)),
    top: Math.min(maxTop, Math.max(0, position.top)),
  };
}

function readPosition(storage: WidgetStorage | undefined, key: string): WidgetPosition | null {
  if (!storage) return null;
  try {
    const parsed: unknown = JSON.parse(storage.getItem(key) ?? 'null');
    if (!parsed || typeof parsed !== 'object') return null;
    const value = parsed as Record<string, unknown>;
    return typeof value.left === 'number' && Number.isFinite(value.left) &&
      typeof value.top === 'number' && Number.isFinite(value.top)
      ? { left: value.left, top: value.top }
      : null;
  } catch { return null; }
}

function readMode(storage: WidgetStorage | undefined, key: string): RegularMode {
  try {
    const value = storage?.getItem(key);
    return value && VISIBLE_MODES.includes(value as RegularMode) ? value as RegularMode : 'natural';
  } catch { return 'natural'; }
}

function readModule(storage: WidgetStorage | undefined, key: string): 'autolike' {
  try { return storage?.getItem(key) === 'autolike' ? 'autolike' : 'autolike'; } catch { return 'autolike'; }
}

function save(storage: WidgetStorage | undefined, key: string, value: string): void {
  try { storage?.setItem(key, value); } catch { /* Storage may be unavailable. */ }
}

function browserTimer(window: Window): WidgetTimer {
  return {
    setInterval: (callback, delay) => window.setInterval(callback, delay),
    clearInterval: (id) => window.clearInterval(id as number),
  };
}

/** A small, dependency-injected, draggable TikTok-themed runtime module shell. */
export class FloatingWidget {
  readonly element: HTMLDivElement;
  private readonly options: FloatingWidgetOptions;
  private readonly storageKey: string;
  private readonly moduleStorageKey: string;
  private readonly timer: WidgetTimer;
  private position: WidgetPosition = { left: 16, top: 16 };
  private drag: { pointerId: number; offsetX: number; offsetY: number } | null = null;
  private intervalId: unknown = null;
  private destroyed = false;
  private running: boolean;
  private collapsed = false;
  private mode: RegularMode = 'natural';
  private readonly activeModuleName: 'autolike' = 'autolike';

  constructor(options: FloatingWidgetOptions) {
    this.options = options;
    this.storageKey = options.storageKey ?? FLOATING_WIDGET_STORAGE_KEY;
    this.moduleStorageKey = options.moduleStorageKey ?? ACTIVE_MODULE_STORAGE_KEY;
    this.timer = options.timer ?? browserTimer(options.window);
    this.running = options.initiallyRunning ?? false;
    this.mode = readMode(options.storage, AUTOLIKE_MODE_STORAGE_KEY);
    options.engine?.setMode(this.mode);
    this.element = options.document.createElement('div');
    this.element.setAttribute('aria-label', 'TikTok Enhanced autolike');
    this.element.style.cssText = [
      'position:fixed', 'z-index:2147483647', 'width:224px', 'box-sizing:border-box',
      'padding:12px', 'border-radius:12px', 'color:#f7f7f8', 'font:12px system-ui,sans-serif',
      'background:#121216', 'border:1px solid #35353d', 'border-top:2px solid #25f4ee', 'box-shadow:3px 3px 0 #fe2c55,0 6px 18px #0008',
      'user-select:none', 'touch-action:none', 'cursor:grab', 'transition:box-shadow .2s ease',
    ].join(';');
    this.element.innerHTML = `<style>
      [data-widget-control][hidden], [data-widget-settings][hidden], [data-widget-stats][hidden] { display:none !important; }
      [data-widget-settings-content] { display:grid; grid-template-rows:0fr; opacity:0; transition:grid-template-rows .2s ease, opacity .2s ease; }
      [data-widget-settings-content] > div { overflow:hidden; }
      [data-widget-settings].is-expanded [data-widget-settings-content] { grid-template-rows:1fr; opacity:1; }
      [data-widget-module] { color:#fe2c55; }
      [data-widget-status] { color:#25f4ee; font-weight:600; }
      [data-widget-control] { box-sizing:border-box; border:1px solid #45454f; border-radius:7px; padding:6px 8px; color:#f7f7f8; background:#202027; font:inherit; cursor:pointer; transition:background .2s ease, border-color .2s ease, color .2s ease; }
      [data-widget-control]:hover, [data-widget-control]:focus-visible { border-color:#25f4ee; color:#25f4ee; outline:none; }
      [data-widget-toggle] { background:#fe2c55; border-color:#fe2c55; color:#fff; font-weight:600; }
      [data-widget-toggle]:hover, [data-widget-toggle]:focus-visible { background:#ff5577; border-color:#ff5577; color:#fff; }
      [data-widget-mode] { min-width:92px; }
      [data-widget-settings-content] { color:#b8b8c2; }
      [data-widget-stats] { color:#aaaab5; line-height:1.5; }
      [data-widget-stats] > span { white-space:nowrap; font-size:11px; }
      [data-widget-stat] { color:#fff; transition:color .2s ease, transform .2s ease; }
      @media (prefers-reduced-motion: reduce) { [data-widget-settings-content], [data-widget-stat], [data-widget-settings].is-expanded [data-widget-settings-content] { transition:none; } }
    </style>
    <div data-drag-handle style="display:flex;align-items:center;justify-content:space-between;font-weight:700;cursor:grab">TikTok Enhanced
      <button type="button" data-widget-control data-widget-collapse aria-label="Collapse panel" aria-expanded="true">Collapse</button>
    </div>
    <div data-widget-module style="display:flex;align-items:center;justify-content:space-between;margin-top:8px">
      <span data-widget-module-entry aria-current="true">Autolike</span><span data-widget-status style="opacity:.8">${this.engineStatusLabel()}</span>
    </div>
    <div style="display:flex;gap:6px;margin-top:8px">
      <button type="button" data-widget-control data-widget-toggle style="flex:1">${this.engineStatus() === 'stopped' ? 'Resume' : 'Pause'}</button>
      <select data-widget-control data-widget-mode aria-label="Autolike mode">${VISIBLE_MODES.map(value => `<option value="${value}"${value === this.mode ? ' selected' : ''}>${value[0].toUpperCase()}${value.slice(1)}</option>`).join('')}</select>
    </div>
    <button type="button" data-widget-control data-widget-settings-toggle aria-expanded="false" style="margin-top:8px;width:100%">Settings</button>
    <div data-widget-settings><div data-widget-settings-content><div style="padding-top:8px;opacity:.8">
      Choose a mode above to tune click pacing.
      <p>Autostart profiles (next live entry)</p>
      <button type="button" data-widget-control data-widget-autostart-current></button>
      <div data-widget-autostart-list></div>
      <p data-widget-autostart-message role="status" aria-live="polite"></p>
    </div></div></div>
    <div data-widget-stats style="display:grid;grid-template-columns:1fr 1fr;gap:3px;margin-top:8px;opacity:.85">
      <span>Total <b data-widget-stat="total">0</b></span><span>Success <b data-widget-stat="success">0</b></span>
      <span>Failure <b data-widget-stat="failure">0</b></span><span>Skips <b data-widget-stat="skips">0</b></span>
          <span>Retries <b data-widget-stat="retries">0</b></span><span>Multi-taps <b data-widget-stat="multi-taps">0</b></span>
          <span>Completed combos <b data-widget-stat="combos">0</b></span><span>Current combo <b data-widget-stat="current-combo">0</b></span>
      <span>Max combo <b data-widget-stat="max-combo">0</b></span>
    </div>`;

    const savedModule = readModule(options.storage, this.moduleStorageKey);
    this.element.setAttribute('data-active-module', savedModule);
    try {
      if (options.storage && options.storage.getItem(this.moduleStorageKey) === null) save(options.storage, this.moduleStorageKey, savedModule);
    } catch { /* Storage may be unavailable. */ }
    this.position = clampWidgetPosition(readPosition(options.storage, this.storageKey) ?? this.position,
      { width: options.window.innerWidth, height: options.window.innerHeight }, this.size());
    this.applyPosition();
    options.document.body.appendChild(this.element);
    this.element.addEventListener('pointerdown', this.onPointerDown);
    options.document.addEventListener('pointermove', this.onPointerMove);
    options.document.addEventListener('pointerup', this.onPointerEnd);
    options.document.addEventListener('pointercancel', this.onPointerEnd);
    options.window.addEventListener('resize', this.onResize);
    this.control('[data-widget-toggle]')?.addEventListener?.('click', this.onToggle);
    this.control('[data-widget-mode]')?.addEventListener?.('change', this.onModeChange);
    this.control('[data-widget-settings-toggle]')?.addEventListener?.('click', this.onSettingsToggle);
    this.control('[data-widget-collapse]')?.addEventListener?.('click', this.onCollapse);
    this.control('[data-widget-autostart-current]')?.addEventListener?.('click', this.onAutostartCurrent);
    this.control('[data-widget-autostart-list]')?.addEventListener?.('click', this.onAutostartRemove);
    this.renderAutostart();
    try { this.collapsed = options.storage?.getItem(COLLAPSED_STORAGE_KEY) === 'true'; } catch { /* Storage may be unavailable. */ }
    this.applyCollapsed();
    this.intervalId = this.timer.setInterval(() => this.refresh(), options.updateInterval ?? 1000);
    this.refresh();
  }

  getPosition(): WidgetPosition { return { ...this.position }; }
  get activeModule(): 'autolike' { return this.activeModuleName; }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.element.removeEventListener('pointerdown', this.onPointerDown);
    this.options.document.removeEventListener('pointermove', this.onPointerMove);
    this.options.document.removeEventListener('pointerup', this.onPointerEnd);
    this.options.document.removeEventListener('pointercancel', this.onPointerEnd);
    this.options.window.removeEventListener('resize', this.onResize);
    this.control('[data-widget-toggle]')?.removeEventListener?.('click', this.onToggle);
    this.control('[data-widget-mode]')?.removeEventListener?.('change', this.onModeChange);
    this.control('[data-widget-settings-toggle]')?.removeEventListener?.('click', this.onSettingsToggle);
    this.control('[data-widget-collapse]')?.removeEventListener?.('click', this.onCollapse);
    this.control('[data-widget-autostart-current]')?.removeEventListener?.('click', this.onAutostartCurrent);
    this.control('[data-widget-autostart-list]')?.removeEventListener?.('click', this.onAutostartRemove);
    if (this.intervalId !== null) this.timer.clearInterval(this.intervalId);
    this.intervalId = null; this.drag = null; this.element.remove();
  }

  private control(selector: string): WidgetElement | null {
    return this.element.querySelector(selector) as WidgetElement | null;
  }
  private size(): { width: number; height: number } {
    return { width: this.element.offsetWidth || 224, height: this.element.offsetHeight || 70 };
  }
  private applyPosition(): void {
    this.element.style.left = `${this.position.left}px`; this.element.style.top = `${this.position.top}px`;
    this.element.style.right = 'auto'; this.element.style.bottom = 'auto';
  }
  private onToggle = (): void => {
    this.running = this.engineStatus() === 'stopped';
    if (this.running) this.options.engine?.start(); else this.options.engine?.stop();
    this.refresh();
  };
  private onModeChange = (): void => {
    const value = this.control('[data-widget-mode]')?.value as RegularMode | undefined;
    if (value && VISIBLE_MODES.includes(value)) {
      this.mode = value;
      this.options.engine?.setMode(value);
      save(this.options.storage, AUTOLIKE_MODE_STORAGE_KEY, value);
    }
  };
  private renderAutostart(): void {
    const profiles = readAutostartProfiles(this.options.storage);
    const current = liveProfile(this.options.window.location.pathname);
    const button = this.control('[data-widget-autostart-current]') as HTMLButtonElement | null;
    if (button) {
      button.disabled = current === null;
      button.textContent = current
        ? `${profiles.includes(current) ? 'Remove' : 'Add'} @${current}`
        : 'Open a creator live to add a profile';
    }
    const list = this.control('[data-widget-autostart-list]');
    if (!list) return;
    list.replaceChildren();
    for (const profile of profiles) {
      const remove = this.options.document.createElement('button');
      remove.type = 'button';
      remove.setAttribute('data-widget-control', '');
      remove.setAttribute('data-autostart-remove', profile);
      remove.textContent = `Remove @${profile}`;
      list.appendChild(remove);
    }
    this.onResize();
  }
  private updateAutostart(profiles: string[]): void {
    const message = this.control('[data-widget-autostart-message]');
    try {
      saveAutostartProfiles(this.options.storage, profiles);
      this.renderAutostart();
      if (message) message.textContent = 'Saved. Changes apply on the next live entry.';
    } catch {
      if (message) message.textContent = 'Could not save autostart profiles. Storage is unavailable; try again.';
    }
    this.onResize();
  }
  private onAutostartCurrent = (): void => {
    const profile = liveProfile(this.options.window.location.pathname);
    if (!profile) return;
    const profiles = readAutostartProfiles(this.options.storage);
    this.updateAutostart(profiles.includes(profile) ? profiles.filter(value => value !== profile) : [...profiles, profile]);
  };
  private onAutostartRemove = (event: Event): void => {
    const button = (event.target as Element | null)?.closest?.('[data-autostart-remove]');
    const profile = button?.getAttribute('data-autostart-remove');
    if (profile) this.updateAutostart(readAutostartProfiles(this.options.storage).filter(value => value !== profile));
  };
  private onCollapse = (): void => {
    this.collapsed = !this.collapsed;
    save(this.options.storage, COLLAPSED_STORAGE_KEY, String(this.collapsed));
    this.applyCollapsed();
  };
  private applyCollapsed(): void {
    for (const name of ['mode', 'settings-toggle', 'settings', 'stats']) {
      const control = this.control(`[data-widget-${name}]`);
      if (control) {
        control.hidden = this.collapsed;

      }
    }
    const toggle = this.control('[data-widget-collapse]');
    if (toggle) {
      toggle.textContent = this.collapsed ? 'Expand' : 'Collapse';
      toggle.setAttribute('aria-expanded', String(!this.collapsed));
      toggle.setAttribute('aria-label', this.collapsed ? 'Expand panel' : 'Collapse panel');
    }
    this.onResize();
  }
  private onSettingsToggle = (): void => {
    const settings = this.control('[data-widget-settings]');
    const toggle = this.control('[data-widget-settings-toggle]');
    if (!settings || !toggle) return;
    const expanded = settings.classList.toggle('is-expanded');
    toggle.setAttribute('aria-expanded', String(expanded));
  };
  private onPointerDown = (event: PointerEvent): void => {
    if (this.destroyed) return;
    const target = event.target as Element | null;
    if (target?.closest?.('[data-widget-control]')) return;
    this.drag = { pointerId: event.pointerId, offsetX: event.clientX - this.position.left, offsetY: event.clientY - this.position.top };
    this.element.style.cursor = 'grabbing';
  };
  private onPointerMove = (event: PointerEvent): void => {
    if (!this.drag || event.pointerId !== this.drag.pointerId) return;
    this.position = clampWidgetPosition({ left: event.clientX - this.drag.offsetX, top: event.clientY - this.drag.offsetY },
      { width: this.options.window.innerWidth, height: this.options.window.innerHeight }, this.size());
    this.applyPosition();
  };
  private onPointerEnd = (event: PointerEvent): void => {
    if (!this.drag || event.pointerId !== this.drag.pointerId) return;
    this.drag = null; this.element.style.cursor = 'grab'; save(this.options.storage, this.storageKey, JSON.stringify(this.position));
  };
  private onResize = (): void => {
    this.position = clampWidgetPosition(this.position, { width: this.options.window.innerWidth, height: this.options.window.innerHeight }, this.size());
    this.applyPosition(); save(this.options.storage, this.storageKey, JSON.stringify(this.position));
  };
  private engineStatus(): EngineStatus {
    return this.options.engine?.status ?? (this.running ? 'running' : 'stopped');
  }
  private engineStatusLabel(): string {
    const status = this.engineStatus();
    return status === 'unavailable' ? 'Unavailable' : status === 'running' ? 'Running' : 'Stopped';
  }

  refresh(): void {
    if (this.destroyed) return;
    const status = this.control('[data-widget-status]');
    const toggle = this.control('[data-widget-toggle]');
    if (status) status.textContent = this.engineStatusLabel();
    if (toggle) toggle.textContent = this.engineStatus() === 'stopped' ? 'Resume' : 'Pause';
    const stats = this.options.engine?.statistics.stats;
    if (!stats) return;
    const values: Record<string, number> = { total: stats.totalClicks ?? 0, success: stats.successfulClicks ?? 0, failure: stats.failedClicks ?? 0, skips: stats.skippedClicks ?? 0, retries: stats.retries ?? 0, 'multi-taps': stats.multiTaps ?? 0, combos: stats.combos ?? 0, 'current-combo': stats.currentCombo ?? 0, 'max-combo': stats.maxCombo ?? 0 };
    for (const [name, value] of Object.entries(values)) {
      const node = this.element.querySelector(`[data-widget-stat="${name}"]`);
      if (node) {
        node.textContent = formatCompactCount(value);
        node.setAttribute('title', String(value));
      }
    }
  }
}

export function createFloatingWidget(options: FloatingWidgetOptions): FloatingWidget {
  return new FloatingWidget(options);
}
