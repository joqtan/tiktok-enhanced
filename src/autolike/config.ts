// Derived from AmpedWasTaken/TikTok-Live-Liker (MIT); see THIRD_PARTY_NOTICES.md.

export interface DebugConfig {
  minDelay: number;
  maxDelay: number;
  doubleTapChance: number;
  tripleTapChance: number;
  pauseChance: number;
  pauseMin: number;
  pauseMax: number;
}

export const DEBUG_CONFIG_DEFAULTS: Readonly<DebugConfig> = Object.freeze({
  minDelay: 200, maxDelay: 450, doubleTapChance: 0.25,
  tripleTapChance: 0.08, pauseChance: 0.06, pauseMin: 100, pauseMax: 500,
});

export type Mode = 'normal' | 'turbo' | 'stealth' | 'human' | 'combo' | 'debug';
export interface ModeConfig {
  min?: number; max?: number; minDelay?: number; maxDelay?: number;
  doubleTapChance?: number; tripleTapChance?: number; pauseChance?: number;
  pauseMin?: number; pauseMax?: number; burstCount: number;
  burstDelay?: number; comboTimeout?: number;
}
export type RegularMode = Exclude<Mode, 'debug'>;
export const MODES: Readonly<Record<RegularMode, ModeConfig>> = Object.freeze({
  normal: { min: 50, max: 150, burstCount: 2 },
  turbo: { min: 20, max: 50, burstCount: 4 },
  stealth: { min: 200, max: 500, burstCount: 1 },
  human: { ...DEBUG_CONFIG_DEFAULTS, burstCount: 1 },
  combo: { min: 5, max: 15, burstCount: 10, burstDelay: 5, comboTimeout: 800 },
});

const clamp = (value: number, min: number, max: number): number => Math.min(max, Math.max(min, value));

export function normalizeDebugConfig(saved: unknown): DebugConfig {
  const result = { ...DEBUG_CONFIG_DEFAULTS };
  if (!saved || typeof saved !== 'object') return result;
  const input = saved as Record<string, unknown>;
  for (const key of ['minDelay', 'maxDelay', 'pauseMin', 'pauseMax'] as const) {
    const value = Number(input[key]);
    if (Number.isFinite(value)) result[key] = Math.round(value);
    result[key] = clamp(result[key], 10, 2000);
  }
  for (const key of ['doubleTapChance', 'tripleTapChance', 'pauseChance'] as const) {
    const value = Number(input[key]);
    if (Number.isFinite(value)) result[key] = value;
    result[key] = clamp(result[key], 0, 1);
  }
  if (result.maxDelay < result.minDelay) result.maxDelay = result.minDelay;
  if (result.pauseMax < result.pauseMin) result.pauseMax = result.pauseMin;
  return result;
}

export function randomInteger(random: () => number, min: number, max: number): number {
  return Math.floor(random() * (max - min + 1)) + min;
}

export function nextDelay(mode: Mode, debugConfig: DebugConfig, random: () => number): number {
  if (mode === 'human' || mode === 'debug') {
    const config = mode === 'debug' ? debugConfig : MODES.human;
    return random() < config.pauseChance!
      ? randomInteger(random, config.pauseMin!, config.pauseMax!)
      : randomInteger(random, config.minDelay!, config.maxDelay!);
  }
  const config = MODES[mode];
  return Math.floor(random() * (config.max! - config.min!) + config.min!);
}
