/** A transient panel layout controller owned by one live session. */
export interface LiveLayout {
  destroy(): void;
}

export interface LiveLayoutOptions {
  document: Document;
  createObserver?: (callback: MutationCallback) => Pick<MutationObserver, 'observe' | 'disconnect'>;
}

const LEFT = 'data-te-layout-left-hidden';
const CHAT = 'data-te-layout-chat-hidden';
const CONTENT = 'data-te-layout-content-expanded';
const CONTROL = 'data-te-layout-control';

const css = `
[${LEFT}] { width: 0 !important; min-width: 0 !important; max-width: 0 !important; flex: 0 0 0 !important; padding: 0 !important; }
[${LEFT}] > [data-key-interaction="side_nav"] { display: none !important; }
[${CHAT}] { display: none !important; }
[${CONTENT}] { width: 100% !important; flex-grow: 1 !important; }
[${CONTROL}] { position: fixed; top: 100px; z-index: 2147483646; width: 24px; height: 36px; border: 1px solid #888; border-radius: 5px; background: #252525; color: white; cursor: pointer; font-size: 20px; line-height: 1; padding: 0; }
`;

/** Mount independent edge controls, watching for late or replaced TikTok panels. */
export function createLiveLayout(options: LiveLayoutOptions): LiveLayout {
  const doc = options.document;
  const view = doc.defaultView;
  const style = doc.createElement('style');
  style.textContent = css;
  doc.head.appendChild(style);
  const saved = new Map<Element, Map<string, string | null>>();
  let leftHidden = false;
  let chatHidden = false;
  let host: HTMLElement | null = null;
  let nav: HTMLElement | null = null;
  let room: HTMLElement | null = null;
  let chat: HTMLElement | null = null;
  let content: HTMLElement | null = null;
  let leftButton: HTMLButtonElement | null = null;
  let rightButton: HTMLButtonElement | null = null;
  let destroyed = false;

  function mark(element: Element, name: string, enabled: boolean): void {
    let attrs = saved.get(element);
    if (!attrs) { attrs = new Map(); saved.set(element, attrs); }
    if (!attrs.has(name)) attrs.set(name, element.getAttribute(name));
    if (enabled) element.setAttribute(name, '');
    else {
      const original = attrs.get(name);
      if (original === null || original === undefined) element.removeAttribute(name);
      else element.setAttribute(name, original);
    }
  }

  function restore(element: Element | null): void {
    if (!element) return;
    const attrs = saved.get(element);
    if (!attrs) return;
    for (const [name, value] of attrs) {
      if (value === null) element.removeAttribute(name);
      else element.setAttribute(name, value);
    }
    saved.delete(element);
  }

  function place(): void {
    if (!view) return;
    const clamp = (x: number) => Math.max(0, Math.min(view.innerWidth - 24, x));
    if (leftButton && host) leftButton.style.left = `${clamp(leftHidden ? host.getBoundingClientRect().left : host.getBoundingClientRect().right - 12)}px`;
    if (rightButton && chat) rightButton.style.left = `${clamp(chatHidden ? view.innerWidth - 24 : chat.getBoundingClientRect().left - 12)}px`;
  }

  function update(): void {
    if (host && leftButton) {
      mark(host, LEFT, leftHidden);
      leftButton.textContent = leftHidden ? '›' : '‹';
      leftButton.setAttribute('aria-expanded', String(!leftHidden));
      leftButton.setAttribute('aria-label', leftHidden ? 'Show navigation' : 'Hide navigation');
      leftButton.title = leftHidden ? 'Show navigation' : 'Hide navigation';
    }
    if (chat && content && rightButton) {
      mark(chat, CHAT, chatHidden);
      mark(content, CONTENT, chatHidden);
      rightButton.textContent = chatHidden ? '‹' : '›';
      rightButton.setAttribute('aria-expanded', String(!chatHidden));
      rightButton.setAttribute('aria-label', chatHidden ? 'Show chat' : 'Hide chat');
      rightButton.title = chatHidden ? 'Show chat' : 'Hide chat';
    }
    place();
  }

  const toggleLeft = () => { leftHidden = !leftHidden; update(); };
  const toggleChat = () => { chatHidden = !chatHidden; update(); };
  function removeLeft(): void {
    if (leftButton) { leftButton.removeEventListener('click', toggleLeft); leftButton.remove(); leftButton = null; }
    restore(host); host = null; nav = null;
  }
  function removeRight(): void {
    if (rightButton) { rightButton.removeEventListener('click', toggleChat); rightButton.remove(); rightButton = null; }
    restore(chat); restore(content); room = null; chat = null; content = null;
  }
  function button(listener: () => void): HTMLButtonElement {
    const result = doc.createElement('button');
    result.type = 'button'; result.setAttribute(CONTROL, ''); result.addEventListener('click', listener);
    return result;
  }
  function sync(): void {
    if (destroyed) return;
    const root = doc.querySelector('main#tiktok-live-main-container-id');
    const nextNav = root?.querySelector<HTMLElement>('[data-key-interaction="side_nav"]') ?? null;
    const nextHost = nextNav?.parentElement ?? null;
    if (nextNav !== nav || nextHost !== host || (leftButton && leftButton.parentElement !== host)) {
      removeLeft();
      if (nextNav && nextHost) {
        nav = nextNav; host = nextHost;
        leftButton = button(toggleLeft); host.appendChild(leftButton);
      }
    }
    const nextChat = root?.querySelector<HTMLElement>('[data-e2e="public-screen-container"]') ?? null;
    const nextRoom = nextChat?.parentElement ?? null;
    const nextContent = nextRoom?.querySelector<HTMLElement>(':scope > [data-e2e="live-content-container"]') ?? null;
    if (nextChat !== chat || nextRoom !== room || nextContent !== content || (rightButton && rightButton.parentElement !== room)) {
      removeRight();
      if (nextChat && nextRoom && nextContent && nextRoom.matches('.live-room-container')) {
        chat = nextChat; room = nextRoom; content = nextContent;
        rightButton = button(toggleChat); room.appendChild(rightButton);
      }
    }
    update();
  }
  const onMutation: MutationCallback = records => {
    if ((leftButton && leftButton.parentElement !== host) || (rightButton && rightButton.parentElement !== room)) {
      sync();
      return;
    }
    if (records.every(record => {
      const target = record.target;
      if (nav?.contains(target) || chat?.contains(target) || content?.contains(target) || leftButton?.contains(target) || rightButton?.contains(target)) return true;
      const nodes = [...record.addedNodes, ...record.removedNodes];
      return nodes.length > 0 && nodes.every(node => node === leftButton || node === rightButton || node === style || (node instanceof Element && node.hasAttribute(CONTROL)));
    })) return;
    sync();
  };
  let observer: Pick<MutationObserver, 'observe' | 'disconnect'> | undefined;
  try {
    observer = (options.createObserver ?? (callback => new MutationObserver(callback)))(onMutation);
    observer.observe(doc.documentElement, { childList: true, subtree: true });
    view?.addEventListener('resize', place);
    sync();
  } catch (error) {
    observer?.disconnect(); view?.removeEventListener('resize', place);
    removeLeft(); removeRight(); style.remove();
    throw error;
  }
  return { destroy() {
    if (destroyed) return;
    destroyed = true; observer?.disconnect(); view?.removeEventListener('resize', place);
    removeLeft(); removeRight(); style.remove();
  } };
}
