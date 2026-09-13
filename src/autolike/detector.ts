// Derived from AmpedWasTaken/TikTok-Live-Liker (MIT); see THIRD_PARTY_NOTICES.md.

export interface LikeButtonElement {
  isConnected: boolean;
  parentElement: LikeButtonElement | null;
  className?: string;
  getBoundingClientRect(): { width: number; height: number };
  closest(selector: string): LikeButtonElement | null;
  querySelector(selector: string): LikeButtonElement | null;
  querySelectorAll(selector: string): Iterable<LikeButtonElement>;
  getElementsByClassName(className: string): Iterable<LikeButtonElement>;
  dispatchEvent(event: unknown): boolean;
  click(): void;
}

export interface SearchRoot {
  querySelectorAll(selector: string): Iterable<LikeButtonElement>;
  getElementsByClassName(className: string): Iterable<LikeButtonElement>;
  contains?(element: LikeButtonElement): boolean;
}

export interface DetectorEnvironment {
  document: SearchRoot;
  getComputedStyle(element: LikeButtonElement): { display: string; visibility: string; opacity: string; cursor: string };
  createClickEvent?(): unknown;
  logError?(message: string, error: unknown): void;
}

export const BUTTON_SELECTORS = Object.freeze({
  e2e: '[data-e2e="room-chat-like-btn"]',
  container: 'tiktok-1f32i2v e1tv929b0',
  outer: 'tiktok-yl9fg8 e1tv929b1',
  middle: 'tiktok-pn4agh e1tv929b2',
  inner: 'tiktok-1cu4ad e1tv929b3',
});

export function isUsableLikeButton(element: LikeButtonElement | null, env: DetectorEnvironment): boolean {
  try {
    if (!element || !element.isConnected) return false;
    const rect = element.getBoundingClientRect();
    const style = env.getComputedStyle(element);
    return rect.width > 0 && rect.height > 0 && style.display !== 'none' &&
      style.visibility !== 'hidden' && style.opacity !== '0';
  } catch { return false; }
}

export function createButtonFinder(env: DetectorEnvironment): () => LikeButtonElement | null {
  let root: LikeButtonElement | null = null;
  const visibleE2e = (searchRoot: SearchRoot): LikeButtonElement | null => {
    for (const element of searchRoot.querySelectorAll(BUTTON_SELECTORS.e2e)) {
      if (isUsableLikeButton(element, env)) return element;
    }
    return null;
  };
  const validLegacy = (searchRoot: SearchRoot): LikeButtonElement | null => {
    for (const key of ['container', 'outer', 'middle', 'inner'] as const) {
      for (const element of searchRoot.getElementsByClassName(BUTTON_SELECTORS[key])) {
        try {
          const hasClass = (element.className || '').includes('e1tv929b');
          if (isUsableLikeButton(element, env) && hasClass &&
            (element.closest(`.${BUTTON_SELECTORS.container}`) !== null ||
              env.getComputedStyle(element).cursor === 'pointer')) return element;
        } catch { /* DOM can change during navigation. */ }
      }
    }
    return null;
  };
  return () => {
    try {
      if (root && (!root.isConnected || env.document.contains?.(root) === false)) root = null;
      const focused = root || env.document;
      let button = visibleE2e(focused);
      if (button) { root = button.closest(`.${BUTTON_SELECTORS.container}`); return button; }
      if (focused !== env.document) { root = null; button = visibleE2e(env.document); if (button) { root = button.closest(`.${BUTTON_SELECTORS.container}`); return button; } }
      const legacyRoot = root || env.document;
      button = validLegacy(legacyRoot);
      if (!button && legacyRoot !== env.document) { root = null; button = validLegacy(env.document); }
      return button;
    } catch (error) { env.logError?.('Error finding like button', error); return null; }
  };
}

export function dispatchLikeClick(button: LikeButtonElement, env: DetectorEnvironment): boolean {
  return isUsableLikeButton(button, env) && button.dispatchEvent(
    env.createClickEvent ? env.createClickEvent() : { type: 'click', bubbles: true, cancelable: true },
  );
}
