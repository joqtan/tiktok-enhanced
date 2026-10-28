import test from 'node:test';
import assert from 'node:assert/strict';
import { createLiveLayout } from '../../src/live-layout/index.ts';

class ElementFake {
  parentElement: ElementFake | null = null;
  children: ElementFake[] = [];
  attributes = new Map<string, string>();
  style = { cssText: '' };
  textContent = '';
  type = '';
  private listeners = new Map<string, () => void>();
  tagName: string;
  constructor(tagName = 'DIV') { this.tagName = tagName; }
  appendChild(child: ElementFake): ElementFake { child.remove(); child.parentElement = this; this.children.push(child); return child; }
  remove(): void { if (this.parentElement) this.parentElement.children = this.parentElement.children.filter(child => child !== this); this.parentElement = null; }
  setAttribute(name: string, value: string): void { this.attributes.set(name, value); }
  getAttribute(name: string): string | null { return this.attributes.get(name) ?? null; }
  removeAttribute(name: string): void { this.attributes.delete(name); }
  addEventListener(name: string, listener: () => void): void { this.listeners.set(name, listener); }
  removeEventListener(name: string): void { this.listeners.delete(name); }
  click(): void { this.listeners.get('click')?.(); }
  contains(other: ElementFake): boolean { return this === other || this.children.some(child => child.contains(other)); }
  matches(selector: string): boolean { return selector === '.live-room-container'; }
  get listenerCount(): number { return this.listeners.size; }
}

function fixture() {
  const head = new ElementFake('HEAD');
  const root = new ElementFake('MAIN');
  const shell = root.appendChild(new ElementFake());
  const host = shell.appendChild(new ElementFake());
  const nav = host.appendChild(new ElementFake());
  const room = shell.appendChild(new ElementFake());
  const content = room.appendChild(new ElementFake());
  const chat = room.appendChild(new ElementFake());
  chat.style.cssText = 'width:var(--live-chat-width)';
  content.style.cssText = 'width:calc(100% - var(--live-chat-width) - 12px)';
  let mounted = true;
  let panelsMounted = true;
  let current = { host, nav, room, content, chat };
  let callback: ((records: MutationRecord[]) => void) | undefined;
  let disconnected = 0;
  let queries = 0;
  const document = {
    head,
    createElement: (tag: string) => new ElementFake(tag.toUpperCase()),
    querySelector: (selector: string) => {
      queries++;
      if (selector === 'main#tiktok-live-main-container-id') return mounted ? root : null;
      return null;
    },
  };
  Object.assign(root, { querySelector: (selector: string) => {
    if (!panelsMounted) return null;
    if (selector === '[data-key-interaction="side_nav"]') return current.nav;
    if (selector === '[data-e2e="public-screen-container"]') return current.chat;
    return null;
  } });
  Object.assign(room, { querySelector: (selector: string) => selector === ':scope > [data-e2e="live-content-container"]' ? current.content : null });
  const createObserver = (cb: (records: MutationRecord[]) => void) => {
    callback = cb;
    return { observe: () => {}, disconnect: () => { disconnected++; } };
  };
  return { document, root, shell, host, nav, room, content, chat, head, createObserver,
    mount: () => { mounted = true; callback?.([{ target: shell, addedNodes: [], removedNodes: [] } as unknown as MutationRecord]); },
    unmount: () => { mounted = false; },
    hidePanels: () => { panelsMounted = false; },
    showPanels: () => { panelsMounted = true; callback?.([{ target: shell, addedNodes: [], removedNodes: [] } as unknown as MutationRecord]); },
    notify: (target: ElementFake) => callback?.([{ target, addedNodes: [], removedNodes: [] } as unknown as MutationRecord]),
    replace: () => {
      const newHost = shell.appendChild(new ElementFake());
      const newNav = newHost.appendChild(new ElementFake());
      host.remove();
      current = { ...current, host: newHost, nav: newNav };
      callback?.([{ target: shell, addedNodes: [], removedNodes: [] } as unknown as MutationRecord]);
      return { host: newHost, nav: newNav };
    },
    replaceChat: () => {
      const nextChat = room.appendChild(new ElementFake());
      current.chat.remove();
      current = { ...current, chat: nextChat };
      callback?.([{ target: room, addedNodes: [], removedNodes: [] } as unknown as MutationRecord]);
      return nextChat;
    },
    get queries() { return queries; },
    get disconnected() { return disconnected; },
  };
}

test('panel edge buttons independently hide and restore panels without replacing site DOM', () => {
  const f = fixture();
  const layout = createLiveLayout({ document: f.document as unknown as Document, createObserver: f.createObserver as never });
  const left = f.host.children.find(child => child.tagName === 'BUTTON')!;
  const right = f.room.children.find(child => child.tagName === 'BUTTON')!;
  assert.ok(left && right);
  assert.match(f.head.children[0].textContent, /\[data-te-layout-content-expanded\] \{[^}]*flex-grow: 1 !important;/,
    'hidden chat must let the content grow beyond TikTok\'s reserved chat width');
  assert.equal(left.getAttribute('aria-label'), 'Hide navigation');
  assert.equal(right.getAttribute('aria-label'), 'Hide chat');
  assert.equal(left.type, 'button');
  assert.equal(left.getAttribute('aria-expanded'), 'true');
  assert.equal(right.getAttribute('aria-expanded'), 'true');
  left.click();
  assert.equal(f.host.getAttribute('data-te-layout-left-hidden'), '');
  assert.equal(right.getAttribute('aria-expanded'), 'true');
  right.click();
  assert.equal(f.chat.getAttribute('data-te-layout-chat-hidden'), '');
  assert.equal(f.content.getAttribute('data-te-layout-content-expanded'), '');
  assert.equal(left.getAttribute('aria-expanded'), 'false');
  assert.equal(right.getAttribute('aria-expanded'), 'false');
  assert.equal(f.nav.parentElement, f.host);
  assert.equal(f.chat.parentElement, f.room);
  left.click(); right.click();
  assert.equal(f.host.getAttribute('data-te-layout-left-hidden'), null);
  assert.equal(f.chat.getAttribute('data-te-layout-chat-hidden'), null);
  assert.equal(f.content.getAttribute('data-te-layout-content-expanded'), null);
  assert.equal(f.chat.style.cssText, 'width:var(--live-chat-width)');
  layout.destroy();
});

test('observer setup failure removes the injected stylesheet', () => {
  const f = fixture();
  assert.throws(() => createLiveLayout({ document: f.document as unknown as Document,
    createObserver: () => { throw new Error('observer unavailable'); } }), /observer unavailable/);
  assert.equal(f.head.children.length, 0);
});

test('missing panels mount later and a removed control is recreated', () => {
  const f = fixture(); f.hidePanels();
  const layout = createLiveLayout({ document: f.document as unknown as Document, createObserver: f.createObserver as never });
  assert.equal(f.host.children.length, 1);
  f.showPanels();
  const button = f.host.children.find(child => child.tagName === 'BUTTON')!;
  button.click(); button.remove(); f.notify(f.host);
  const replacement = f.host.children.find(child => child.tagName === 'BUTTON')!;
  assert.notEqual(replacement, button);
  assert.equal(replacement.getAttribute('aria-expanded'), 'false');
  assert.equal(button.listenerCount, 0);
  layout.destroy();
});

test('late mounts and replacement retain choice; teardown restores site and disconnects once', () => {
  const f = fixture(); f.unmount();
  const layout = createLiveLayout({ document: f.document as unknown as Document, createObserver: f.createObserver as never });
  assert.equal(f.head.children.length, 1);
  f.mount();
  const left = f.host.children.find(child => child.tagName === 'BUTTON')!;
  const right = f.room.children.find(child => child.tagName === 'BUTTON')!;
  left.click(); right.click();
  const replacement = f.replace();
  assert.equal(replacement.host.getAttribute('data-te-layout-left-hidden'), '');
  assert.equal(f.host.getAttribute('data-te-layout-left-hidden'), null);
  const queries = f.queries;
  f.notify(f.chat); f.notify(right);
  assert.equal(f.queries, queries, 'chat and control mutations do not trigger rediscovery');
  const newChat = f.replaceChat();
  assert.equal(f.chat.getAttribute('data-te-layout-chat-hidden'), null);
  assert.equal(newChat.getAttribute('data-te-layout-chat-hidden'), '');
  layout.destroy(); layout.destroy();
  assert.equal(newChat.getAttribute('data-te-layout-chat-hidden'), null);
  assert.equal(f.disconnected, 1);
  assert.equal(replacement.host.getAttribute('data-te-layout-left-hidden'), null);
  assert.equal(f.chat.getAttribute('data-te-layout-chat-hidden'), null);
  assert.equal(f.content.getAttribute('data-te-layout-content-expanded'), null);
  assert.equal(f.head.children.length, 0);
  assert.equal(left.listenerCount, 0);
  assert.equal(right.listenerCount, 0);
  assert.equal(newChat.parentElement, f.room);
});
