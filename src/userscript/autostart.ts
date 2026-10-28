import type { StorageAdapter } from '../autolike/contract.ts';

export const AUTOSTART_STORAGE_KEY = 'tiktok-enhanced:autostart-profiles';

function isProfile(value: unknown): value is string {
  return typeof value === 'string' && /^[a-zA-Z0-9_.]+$/.test(value);
}

/** Only explicit creator live routes supply an identity; never infer one from DOM. */
export function liveProfile(pathname: string): string | null {
  const match = /^\/@([^/]+)\/live\/?$/.exec(pathname);
  return match && isProfile(match[1]) ? match[1].toLowerCase() : null;
}

export function readAutostartProfiles(storage: StorageAdapter | undefined): string[] {
  try {
    const value: unknown = JSON.parse(storage?.getItem(AUTOSTART_STORAGE_KEY) ?? '[]');
    if (!Array.isArray(value) || !value.every(isProfile)) return [];
    return [...new Set(value.map(profile => profile.toLowerCase()))];
  } catch { return []; }
}

/** A failed write must remain visible to the caller, not pretend it was saved. */
export function saveAutostartProfiles(storage: StorageAdapter | undefined, profiles: string[]): void {
  if (!storage) throw new Error('Storage unavailable');
  storage.setItem(AUTOSTART_STORAGE_KEY, JSON.stringify(profiles));
}
