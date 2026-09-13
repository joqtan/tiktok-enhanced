// Derived from AmpedWasTaken/TikTok-Live-Liker (MIT); see THIRD_PARTY_NOTICES.md.

import { COMBO_TIMEOUT, MODES, nextDelay, randomInteger } from './config.ts';
import type { DebugConfig, Mode, ModeConfig } from './config.ts';
import { dispatchLikeClick } from './detector.ts';
import type { LikeButtonElement, DetectorEnvironment } from './detector.ts';
import { StatisticsTracker } from './statistics.ts';

export type EngineStatus = 'stopped' | 'running' | 'unavailable';
export type EngineDiagnosticCode =
  | 'started'
  | 'stopped'
  | 'unavailable'
  | 'recovered'
  | 'retry-exhausted'
  | 'detector-error'
  | 'cancelled-work';

export interface EngineDiagnostic {
  readonly code: EngineDiagnosticCode;
  readonly message: string;
  readonly details?: Readonly<Record<string, string | number | boolean>>;
}

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
  onStatusChange?(status: EngineStatus): void;
  onDiagnostic?(diagnostic: EngineDiagnostic): void;
}

export class AutoLikeEngine {
  private enabled = false;
  private currentStatus: EngineStatus = 'stopped';
  private readonly random: () => number;
  private readonly stats: StatisticsTracker;
  private readonly pending = new Set<unknown>();
  private comboTimeoutId: unknown = null;
  private readonly deps: ClickEngineDependencies;
  private sessionGeneration = 0;
  private mode: Mode;
  private debugConfig: DebugConfig;

  constructor(deps: ClickEngineDependencies, mode: Mode = 'natural', debugConfig: DebugConfig) {
    this.deps = deps;
    this.mode = mode;
    this.debugConfig = debugConfig;
    this.random = deps.random ?? Math.random;
    this.stats = deps.stats ?? new StatisticsTracker(deps.now ?? Date.now);
  }

  get status(): EngineStatus {
    return this.currentStatus;
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
    this.setStatus('running');
    this.diagnostic({ code: 'started', message: 'Autolike engine started' });
    void this.runCycle(generation, 0, 0, 0);
  }

  stop(): void {
    if (!this.enabled && this.currentStatus === 'stopped') return;
    const hadWork = this.pending.size > 0 || this.comboTimeoutId !== null;
    this.enabled = false;
    ++this.sessionGeneration;
    for (const id of this.pending) this.deps.timer.clear(id);
    this.pending.clear();
    if (this.comboTimeoutId !== null) {
      this.deps.timer.clear(this.comboTimeoutId);
      this.comboTimeoutId = null;
    }
    if (hadWork) {
      this.diagnostic({ code: 'cancelled-work', message: 'Pending autolike work was cancelled' });
    }
    this.setStatus('stopped');
    this.diagnostic({ code: 'stopped', message: 'Autolike engine stopped' });
  }

  private diagnostic(diagnostic: EngineDiagnostic): void {
    this.deps.onDiagnostic?.(diagnostic);
  }

  private setStatus(status: EngineStatus): void {
    if (this.currentStatus === status) return;
    this.currentStatus = status;
    this.deps.onStatusChange?.(status);
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

  private schedule(callback: () => void, delay: number, generation = this.sessionGeneration): void {
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
    if (!this.enabled || generation !== this.sessionGeneration) return;
    this.schedule(
      () => void this.runCycle(generation, 0, 0, 0),
      nextDelay(this.mode, this.debugConfig, this.random),
      generation,
    );
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

    let button: LikeButtonElement | null;
    try {
      button = this.deps.findButton();
    } catch {
      this.diagnostic({ code: 'detector-error', message: 'Like button detection failed' });
      button = null;
    }

    if (!button) {
      this.setStatus('unavailable');
      this.stats.recordSkip();
      this.diagnostic({ code: 'unavailable', message: 'Like button is unavailable' });
      if (retries >= config.maxRetries || work + 1 >= config.maxWorkPerCycle) {
        this.diagnostic({
          code: 'retry-exhausted',
          message: 'Like button was unavailable after retries',
          details: { retries },
        });
        this.scheduleNext(generation);
        return;
      }
      this.stats.recordRetry();
      await this.wait(nextDelay(this.mode, this.debugConfig, this.random), generation);
      await this.runCycle(generation, retries + 1, clicks, work + 1);
      return;
    }

    if (this.currentStatus === 'unavailable') {
      this.setStatus('running');
      this.diagnostic({ code: 'recovered', message: 'Like button became available' });
    }

    let success: boolean;
    try {
      success = dispatchLikeClick(button, this.deps.browser);
    } catch {
      this.diagnostic({ code: 'detector-error', message: 'Like button dispatch failed' });
      success = false;
    }
    this.record(success);
    if (!success) {
      if (retries >= config.maxRetries || work + 1 >= config.maxWorkPerCycle) {
        this.diagnostic({
          code: 'retry-exhausted',
          message: 'Like click retries exhausted',
          details: { retries },
        });
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
