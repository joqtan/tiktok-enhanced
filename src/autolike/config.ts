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

export type RegularMode = 'calm' | 'natural' | 'active';
export type Mode = RegularMode | 'debug';
export interface ModeConfig {
  minDelay: number;
  maxDelay: number;
  doubleTapChance: number;
  tripleTapChance: number;
  pauseChance: number;
  pauseMin: number;
  pauseMax: number;
}

export const MODES: Readonly<Record<RegularMode, ModeConfig>> = Object.freeze({
  calm: { minDelay: 205, maxDelay: 255, doubleTapChance: 0.12, tripleTapChance: 0.02, pauseChance: 0.08, pauseMin: 350, pauseMax: 550 },
  natural: { minDelay: 160, maxDelay: 230, doubleTapChance: 0.20, tripleTapChance: 0.05, pauseChance: 0.06, pauseMin: 350, pauseMax: 550 },
  active: { minDelay: 105, maxDelay: 175, doubleTapChance: 0.10, tripleTapChance: 0.02, pauseChance: 0.05, pauseMin: 300, pauseMax: 500 },
});

/** The inactivity window used to close a statistics combo. */
export const COMBO_TIMEOUT = 800;

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
  const config = mode === 'debug' ? debugConfig : MODES[mode];
  return random() < config.pauseChance
    ? randomInteger(random, config.pauseMin, config.pauseMax)
    : randomInteger(random, config.minDelay, config.maxDelay);
}
