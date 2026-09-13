// Derived from AmpedWasTaken/TikTok-Live-Liker (MIT); see THIRD_PARTY_NOTICES.md.

import { COMBO_TIMEOUT, MODES, nextDelay, randomInteger } from './config.ts';
import type { DebugConfig, Mode, ModeConfig } from './config.ts';
import { dispatchLikeClick } from './detector.ts';
import type { LikeButtonElement, DetectorEnvironment } from './detector.ts';
import { StatisticsTracker } from './statistics.ts';

export interface Timer {
  set(callback: () => void, delay: number): unknown;
  clear(id: unknown): void;
}

export interface ClickEngineDependencies {
  findButton(): LikeButtonElement | null;
  browser: DetectorEnvironment;
  timer: Timer;
  random?: () => number;
  now?: () => number;
  stats?: StatisticsTracker;
  notify?(message: string, type?: 'info' | 'success' | 'warning' | 'error'): void;
}

export class AutoLikeEngine {
  private enabled = false;
  private readonly random: () => number;
  private readonly stats: StatisticsTracker;
  private readonly pending = new Set<unknown>();
  private comboTimeoutId: unknown = null;
  private readonly deps: ClickEngineDependencies;
  private sessionGeneration = 0;
  private mode: Mode;
  private debugConfig: DebugConfig;

  constructor(
    deps: ClickEngineDependencies,
    mode: Mode = 'natural',
    debugConfig: DebugConfig,
  ) {
    this.deps = deps;
    this.mode = mode;
    this.debugConfig = debugConfig;
    this.random = deps.random ?? Math.random;
    this.stats = deps.stats ?? new StatisticsTracker(deps.now ?? Date.now);
  }

  get statistics(): StatisticsTracker {
    return this.stats;
  }

  setMode(mode: Mode): void {
    this.mode = mode;
  }

  setDebugConfig(config: DebugConfig): void {
    this.debugConfig = config;
  }

  start(): void {
    if (this.enabled) return;
    this.enabled = true;
    const generation = ++this.sessionGeneration;
    void this.runCycle(generation, 0, 0, 0);
  }

  stop(): void {
    this.enabled = false;
    ++this.sessionGeneration;
    for (const id of this.pending) this.deps.timer.clear(id);
    this.pending.clear();
    if (this.comboTimeoutId !== null) {
      this.deps.timer.clear(this.comboTimeoutId);
      this.comboTimeoutId = null;
    }
  }

  private config(): ModeConfig {
    return this.mode === 'debug' ? this.debugConfig : MODES[this.mode];
  }

  private record(success: boolean, multiTap = false): void {
    this.stats.recordClick(success, multiTap);
    if (!success) {
      if (this.comboTimeoutId !== null) this.deps.timer.clear(this.comboTimeoutId);
      this.comboTimeoutId = null;
      return;
    }

    if (this.comboTimeoutId !== null) this.deps.timer.clear(this.comboTimeoutId);
    const generation = this.sessionGeneration;
    this.comboTimeoutId = this.deps.timer.set(() => {
      if (!this.enabled || generation !== this.sessionGeneration) return;
      this.comboTimeoutId = null;
      this.stats.finishCombo();
    }, COMBO_TIMEOUT);
  }

  private schedule(
    callback: () => void,
    delay: number,
    generation = this.sessionGeneration,
  ): void {
    let id: unknown;
    id = this.deps.timer.set(() => {
      this.pending.delete(id);
      if (this.enabled && generation === this.sessionGeneration) callback();
    }, delay);
    this.pending.add(id);
  }

  private wait(delay: number, generation: number): Promise<void> {
    return new Promise(resolve => this.schedule(resolve, delay, generation));
  }

  private scheduleNext(generation: number): void {
    if (this.enabled && generation === this.sessionGeneration) {
      this.schedule(
        () => void this.runCycle(generation, 0, 0, 0),
        nextDelay(this.mode, this.debugConfig, this.random),
        generation,
      );
    }
  }

  private async runCycle(
    generation: number,
    retries: number,
    clicks: number,
    work: number,
  ): Promise<void> {
    if (!this.enabled || generation !== this.sessionGeneration) return;

    const config = this.config();
    if (work >= config.maxWorkPerCycle || clicks >= config.maxClicksPerCycle) {
      this.scheduleNext(generation);
      return;
    }

    const button = this.deps.findButton();
    if (!button) {
      this.stats.recordSkip();
      if (retries >= config.maxRetries || work + 1 >= config.maxWorkPerCycle) {
        this.scheduleNext(generation);
        return;
      }
      this.stats.recordRetry();
      await this.wait(nextDelay(this.mode, this.debugConfig, this.random), generation);
      await this.runCycle(generation, retries + 1, clicks, work + 1);
      return;
    }

    const success = dispatchLikeClick(button, this.deps.browser);
    this.record(success);
    if (!success) {
      if (retries >= config.maxRetries || work + 1 >= config.maxWorkPerCycle) {
        this.scheduleNext(generation);
        return;
      }
      this.stats.recordRetry();
      await this.wait(nextDelay(this.mode, this.debugConfig, this.random), generation);
      await this.runCycle(generation, retries + 1, clicks + 1, work + 1);
      return;
    }

    const roll = this.random();
    const requestedExtras = roll < config.tripleTapChance
      ? 2
      : roll < config.tripleTapChance + config.doubleTapChance ? 1 : 0;
    const extraCount = Math.min(
      requestedExtras,
      config.maxClicksPerCycle - clicks - 1,
      config.maxWorkPerCycle - work - 1,
    );

    for (let extra = 0; extra < extraCount; extra++) {
      await this.wait(
        randomInteger(this.random, config.extraMinDelay, config.extraMaxDelay),
        generation,
      );
      const extraSuccess = dispatchLikeClick(button, this.deps.browser);
      this.record(extraSuccess, true);
      if (!extraSuccess) break;
    }
    this.scheduleNext(generation);
  }
}
