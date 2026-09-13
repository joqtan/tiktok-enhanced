// Derived from AmpedWasTaken/TikTok-Live-Liker (MIT); see THIRD_PARTY_NOTICES.md.

import { COMBO_TIMEOUT, MODES, nextDelay, randomInteger } from './config.ts';
import type { DebugConfig, Mode } from './config.ts';
import { dispatchLikeClick } from './detector.ts';
import type { LikeButtonElement, DetectorEnvironment } from './detector.ts';
import { StatisticsTracker } from './statistics.ts';

export interface Timer { set(callback: () => void, delay: number): unknown; clear(id: unknown): void; }
export interface ClickEngineDependencies {
  findButton(): LikeButtonElement | null; browser: DetectorEnvironment; timer: Timer;
  random?: () => number; now?: () => number; stats?: StatisticsTracker;
  notify?(message: string, type?: 'info' | 'success' | 'warning' | 'error'): void;
}

export class AutoLikeEngine {
  private enabled = false; private missingButtonDelay = 250;
  private readonly random: () => number; private readonly now: () => number;
  private readonly stats: StatisticsTracker; private readonly pending = new Set<unknown>();
  private comboTimeoutId: unknown = null; private readonly deps: ClickEngineDependencies;
  private sessionGeneration = 0; private mode: Mode; private debugConfig: DebugConfig;
  constructor(deps: ClickEngineDependencies, mode: Mode = 'natural', debugConfig: DebugConfig) {
    this.deps = deps; this.mode = mode; this.debugConfig = debugConfig;
    this.random = deps.random ?? Math.random; this.now = deps.now ?? Date.now;
    this.stats = deps.stats ?? new StatisticsTracker(this.now);
  }
  get statistics(): StatisticsTracker { return this.stats; }
  setMode(mode: Mode): void { this.mode = mode; }
  setDebugConfig(config: DebugConfig): void { this.debugConfig = config; }
  start(): void {
    if (this.enabled) return;
    this.enabled = true;
    const generation = ++this.sessionGeneration;
    void this.clickLikeButton(generation);
  }
  stop(): void {
    this.enabled = false; ++this.sessionGeneration;
    for (const id of this.pending) this.deps.timer.clear(id);
    this.pending.clear();
    if (this.comboTimeoutId !== null) { this.deps.timer.clear(this.comboTimeoutId); this.comboTimeoutId = null; }
  }
  private record(success: boolean): void {
    this.stats.record(success);
    if (!success) { if (this.comboTimeoutId !== null) this.deps.timer.clear(this.comboTimeoutId); this.comboTimeoutId = null; return; }
    if (this.comboTimeoutId !== null) this.deps.timer.clear(this.comboTimeoutId);
    const generation = this.sessionGeneration;
    this.comboTimeoutId = this.deps.timer.set(() => {
      if (!this.enabled || generation !== this.sessionGeneration) return;
      this.comboTimeoutId = null; this.stats.finishCombo();
    }, COMBO_TIMEOUT);
  }
  private schedule(callback: () => void, delay: number, generation = this.sessionGeneration): void {
    let id: unknown;
    id = this.deps.timer.set(() => {
      this.pending.delete(id);
      if (this.enabled && generation === this.sessionGeneration) callback();
    }, delay);
    this.pending.add(id);
  }
  private retry(generation: number): void {
    if (!this.enabled || generation !== this.sessionGeneration) return;
    this.record(false); this.schedule(() => void this.clickLikeButton(generation), this.missingButtonDelay, generation);
    this.missingButtonDelay = Math.min(this.missingButtonDelay * 2, 5000);
  }
  private async wait(delay: number): Promise<void> { await new Promise<void>(resolve => this.schedule(resolve, delay)); }
  private extra(button: LikeButtonElement, remaining: number): void {
    if (remaining <= 0) return;
    this.schedule(() => {
      if (!this.enabled) return;
      if (dispatchLikeClick(button, this.deps.browser)) { this.record(true); this.extra(button, remaining - 1); }
      else this.record(false);
    }, randomInteger(this.random, 40, 130));
  }
  private async clickLikeButton(generation: number): Promise<void> {
    if (!this.enabled || generation !== this.sessionGeneration) return;
    const button = this.deps.findButton(); if (!button) { this.retry(generation); return; }
    this.missingButtonDelay = 250;
    if (!dispatchLikeClick(button, this.deps.browser)) { this.retry(generation); return; }
    this.record(true);
    const config = this.mode === 'debug' ? this.debugConfig : MODES[this.mode];
    const roll = this.random();
    if (roll < config.tripleTapChance) this.extra(button, 2);
    else if (roll < config.tripleTapChance + config.doubleTapChance) this.extra(button, 1);
    if (this.enabled && generation === this.sessionGeneration) {
      this.schedule(() => void this.clickLikeButton(generation), nextDelay(this.mode, this.debugConfig, this.random), generation);
    }
  }
}
