// Derived from AmpedWasTaken/TikTok-Live-Liker (MIT); see THIRD_PARTY_NOTICES.md.

export interface DebugConfig {
  minDelay: number;
  maxDelay: number;
  doubleTapChance: number;
  tripleTapChance: number;
  pauseChance: number;
  pauseMin: number;
  pauseMax: number;
  extraMinDelay: number;
  extraMaxDelay: number;
  maxRetries: number;
  maxClicksPerCycle: number;
  maxWorkPerCycle: number;
}

export const DEBUG_CONFIG_DEFAULTS: Readonly<DebugConfig> = Object.freeze({
  minDelay: 200,
  maxDelay: 450,
  doubleTapChance: 0.25,
  tripleTapChance: 0.08,
  pauseChance: 0.06,
  pauseMin: 100,
  pauseMax: 500,
  extraMinDelay: 40,
  extraMaxDelay: 130,
  maxRetries: 3,
  maxClicksPerCycle: 3,
  maxWorkPerCycle: 5,
});

export type RegularMode = 'calm' | 'natural' | 'active';
export type Mode = RegularMode | 'debug';

export interface ModeConfig extends DebugConfig {}

export const MODES: Readonly<Record<RegularMode, ModeConfig>> = Object.freeze({
  calm: {
    minDelay: 205,
    maxDelay: 255,
    doubleTapChance: 0.12,
    tripleTapChance: 0.02,
    pauseChance: 0.08,
    pauseMin: 350,
    pauseMax: 550,
    extraMinDelay: 40,
    extraMaxDelay: 130,
    maxRetries: 3,
    maxClicksPerCycle: 3,
    maxWorkPerCycle: 5,
  },
  natural: {
    minDelay: 160,
    maxDelay: 230,
    doubleTapChance: 0.20,
    tripleTapChance: 0.05,
    pauseChance: 0.06,
    pauseMin: 350,
    pauseMax: 550,
    extraMinDelay: 40,
    extraMaxDelay: 130,
    maxRetries: 3,
    maxClicksPerCycle: 3,
    maxWorkPerCycle: 5,
  },
  active: {
    minDelay: 105,
    maxDelay: 175,
    doubleTapChance: 0.10,
    tripleTapChance: 0.02,
    pauseChance: 0.05,
    pauseMin: 300,
    pauseMax: 500,
    extraMinDelay: 40,
    extraMaxDelay: 130,
    maxRetries: 3,
    maxClicksPerCycle: 3,
    maxWorkPerCycle: 5,
  },
});

export const COMBO_TIMEOUT = 800;

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));

export function normalizeDebugConfig(saved: unknown): DebugConfig {
  const result = { ...DEBUG_CONFIG_DEFAULTS };
  if (!saved || typeof saved !== 'object') return result;

  const input = saved as Record<string, unknown>;
  for (const key of [
    'minDelay',
    'maxDelay',
    'pauseMin',
    'pauseMax',
    'extraMinDelay',
    'extraMaxDelay',
    'maxRetries',
    'maxClicksPerCycle',
    'maxWorkPerCycle',
  ] as const) {
    const value = Number(input[key]);
    if (Number.isFinite(value)) result[key] = Math.round(value);
    const minimum = key === 'maxClicksPerCycle' || key === 'maxWorkPerCycle' ? 1 : 0;
    result[key] = clamp(result[key], minimum, 2000);
  }

  for (const key of ['doubleTapChance', 'tripleTapChance', 'pauseChance'] as const) {
    const value = Number(input[key]);
    if (Number.isFinite(value)) result[key] = value;
    result[key] = clamp(result[key], 0, 1);
  }

  if (result.maxDelay < result.minDelay) result.maxDelay = result.minDelay;
  if (result.pauseMax < result.pauseMin) result.pauseMax = result.pauseMin;
  if (result.extraMaxDelay < result.extraMinDelay) {
    result.extraMaxDelay = result.extraMinDelay;
  }
  return result;
}

export function randomInteger(random: () => number, min: number, max: number): number {
  return Math.floor(random() * (max - min + 1)) + min;
}

export function nextDelay(
  mode: Mode,
  debugConfig: DebugConfig,
  random: () => number,
): number {
  const config = mode === 'debug' ? debugConfig : MODES[mode];
  return random() < config.pauseChance
    ? randomInteger(random, config.pauseMin, config.pauseMax)
    : randomInteger(random, config.minDelay, config.maxDelay);
}
