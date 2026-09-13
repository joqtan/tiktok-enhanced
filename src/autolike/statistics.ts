// Derived from AmpedWasTaken/TikTok-Live-Liker (MIT); see THIRD_PARTY_NOTICES.md.

export interface LikeStatistics {
  hasActivity: boolean;
  totalClicks: number;
  startTime: number | null;
  successfulClicks: number;
  failedClicks: number;
  skippedClicks: number;
  retries: number;
  multiTaps: number;
  combos: number;
  maxCombo: number;
  currentCombo: number;
}

export function createStatistics(): LikeStatistics {
  return {
    hasActivity: false,
    totalClicks: 0,
    startTime: null,
    successfulClicks: 0,
    failedClicks: 0,
    skippedClicks: 0,
    retries: 0,
    multiTaps: 0,
    combos: 0,
    maxCombo: 0,
    currentCombo: 0,
  };
}

export class StatisticsTracker {
  readonly stats: LikeStatistics = createStatistics();
  private readonly now: () => number;
  private readonly onCombo?: (message: string) => void;

  constructor(now: () => number = Date.now, onCombo?: (message: string) => void) {
    this.now = now;
    this.onCombo = onCombo;
  }

  record(success: boolean): void {
    this.recordClick(success);
  }

  recordClick(success: boolean, multiTap = false): void {
    this.stats.hasActivity = true;
    this.stats.startTime ??= this.now();
    this.stats.totalClicks++;
    if (multiTap) this.stats.multiTaps++;

    if (success) {
      this.stats.successfulClicks++;
      this.stats.currentCombo++;
      this.stats.maxCombo = Math.max(this.stats.maxCombo, this.stats.currentCombo);
    } else {
      this.stats.failedClicks++;
      this.finishCombo();
    }
  }

  recordSkip(): void {
    this.stats.hasActivity = true;
    this.stats.startTime ??= this.now();
    this.stats.skippedClicks++;
  }

  recordRetry(): void {
    this.stats.hasActivity = true;
    this.stats.startTime ??= this.now();
    this.stats.retries++;
  }

  finishCombo(): void {
    if (this.stats.currentCombo > 0) {
      this.stats.combos++;
      this.onCombo?.(`Combo End: ${this.stats.currentCombo}x`);
      this.stats.currentCombo = 0;
    }
  }
}
