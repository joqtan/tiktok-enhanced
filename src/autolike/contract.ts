import type { LikeButtonElement } from './detector.ts';
import type { StatisticsTracker } from './statistics.ts';
import type { Mode } from './config.ts';

/** Injectable scheduling boundary used by reusable autolike logic. */
export interface Timer {
  set(callback: () => void, delay: number): unknown;
  clear(id: unknown): void;
}

/** Narrow storage boundary shared by browser integrations and module UI. */
export interface StorageAdapter {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

/** Browser-independent operations required by the reusable core. */
export type LikeButtonFinder = () => LikeButtonElement | null;
export type LikeDispatcher = (button: LikeButtonElement) => boolean;

export interface AutolikeBrowserAdapters {
  findButton: LikeButtonFinder;
  clickButton: LikeDispatcher;
  timer: Timer;
  storage?: StorageAdapter;
}

/** Public behavior the module UI may use without depending on engine internals. */
export interface AutolikeCore {
  readonly status: 'stopped' | 'running' | 'unavailable';
  readonly statistics: StatisticsTracker;
  start(): void;
  stop(): void;
  setMode(mode: Mode): void;
}

/** Lifecycle owned by the route/session runtime. */
export interface AutolikeView {
  destroy(): void;
}

export interface AutolikeSession {
  readonly core: AutolikeCore;
  readonly view: AutolikeView;
  destroy(): void;
}
