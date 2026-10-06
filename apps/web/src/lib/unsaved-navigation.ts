'use client';

import { useEffect, useRef } from 'react';

type Entry = { url: string; state: unknown; index: number | undefined };
type Guard = { enabled: boolean; message: string; entry: Entry | null };
type SharedGuard = { guards: Map<symbol, () => Guard>; installed: boolean; index: number };
const STATE_KEY = Symbol.for('abonten.unsavedNavigation');
const INDEX_KEY = '__abontenHistoryIndex';

function sharedGuard(): SharedGuard {
  const host = window as unknown as { [STATE_KEY]?: SharedGuard };
  return (host[STATE_KEY] ??= { guards: new Map(), installed: false, index: 0 });
}
function activeGuard(shared: SharedGuard): Guard | undefined {
  for (const read of shared.guards.values()) {
    const value = read();
    if (value.enabled) return value;
  }
}
function stateIndex(value: unknown): number | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const index = (value as Record<string, unknown>)[INDEX_KEY];
  return typeof index === 'number' && Number.isSafeInteger(index) ? index : undefined;
}
function entry(): Entry {
  return {
    url: window.location.href,
    state: window.history.state,
    index: stateIndex(window.history.state),
  };
}

/** Workspace buttons and form-local navigation share one affirmative discard decision. */
export function confirmUnsavedNavigation(): boolean {
  const guard = activeGuard(sharedGuard());
  return !guard || window.confirm(guard.message);
}

/** Install before the router and retain listeners across route remounts and HMR. */
export function installUnsavedNavigationGuard(): void {
  const shared = sharedGuard();
  if (shared.installed) return;
  shared.installed = true;
  shared.index = stateIndex(window.history.state) ?? 0;
  const nativePush = window.history.pushState.bind(window.history);
  const nativeReplace = window.history.replaceState.bind(window.history);
  const indexed = (data: unknown, index: number) =>
    data === null || (typeof data === 'object' && !Array.isArray(data))
      ? { ...(data as Record<string, unknown> | null), [INDEX_KEY]: index }
      : data;
  // Router state remains intact. The index makes cancelled Back/Forward and
  // multi-entry traversals reversible in browsers without the Navigation API.
  nativeReplace(indexed(window.history.state, shared.index), '', window.location.href);
  window.history.pushState = (data, unused, url) => {
    shared.index = (stateIndex(window.history.state) ?? shared.index) + 1;
    nativePush(indexed(data, shared.index), unused, url);
  };
  window.history.replaceState = (data, unused, url) => {
    shared.index = stateIndex(data) ?? stateIndex(window.history.state) ?? shared.index;
    nativeReplace(indexed(data, shared.index), unused, url);
  };
  let restoring = false;
  let replaying = false;
  let approvedTraversal = false;
  const navigation = (window as unknown as { navigation?: EventTarget }).navigation;
  navigation?.addEventListener('navigate', (rawEvent) => {
    const event = rawEvent as Event & { navigationType?: string };
    const guard = activeGuard(shared);
    if (event.navigationType !== 'traverse' || !event.cancelable || !guard) return;
    if (window.confirm(guard.message)) approvedTraversal = true;
    else event.preventDefault();
  });
  window.addEventListener('beforeunload', (event) => {
    if (activeGuard(shared)) {
      event.preventDefault();
      event.returnValue = '';
    }
  });
  document.addEventListener(
    'click',
    (event) => {
      if (
        !activeGuard(shared) ||
        event.defaultPrevented ||
        event.button !== 0 ||
        event.ctrlKey ||
        event.metaKey ||
        event.shiftKey ||
        event.altKey
      )
        return;
      const link = event.target instanceof Element ? event.target.closest('a[href]') : null;
      if (
        !(link instanceof HTMLAnchorElement) ||
        link.target === '_blank' ||
        link.hasAttribute('download')
      )
        return;
      const target = new URL(link.href);
      if (
        target.origin === window.location.origin &&
        target.pathname === window.location.pathname &&
        target.search === window.location.search
      )
        return;
      if (!confirmUnsavedNavigation()) {
        event.preventDefault();
        event.stopImmediatePropagation();
      }
    },
    true,
  );
  window.addEventListener(
    'popstate',
    (event) => {
      const nextIndex = stateIndex(event.state);
      if (nextIndex !== undefined) shared.index = nextIndex;
      if (replaying) return;
      if (approvedTraversal) {
        approvedTraversal = false;
        return;
      }
      if (restoring) {
        restoring = false;
        event.stopImmediatePropagation();
        return;
      }
      const guard = activeGuard(shared);
      if (!guard?.entry) return;
      event.stopImmediatePropagation();
      if (window.confirm(guard.message)) {
        replaying = true;
        window.dispatchEvent(new PopStateEvent('popstate', { state: event.state }));
        replaying = false;
        return;
      }
      const previous = guard.entry;
      if (previous.index !== undefined && nextIndex !== undefined && previous.index !== nextIndex) {
        restoring = true;
        window.history.go(previous.index - nextIndex);
      } else {
        // Pre-bootstrap entries may have no index. Keep the form mounted and
        // recover its precise URL/state rather than guessing traversal direction.
        nativePush(previous.state, '', previous.url);
        shared.index = previous.index ?? shared.index;
      }
    },
    true,
  );
}

export function useUnsavedNavigation(enabled: boolean, message: string): void {
  const id = useRef(Symbol('unsaved-work')).current;
  const state = useRef<Guard>({ enabled, message, entry: null });
  state.current = { enabled, message, entry: typeof window === 'undefined' ? null : entry() };
  useEffect(() => {
    installUnsavedNavigationGuard();
    const shared = sharedGuard();
    shared.guards.set(id, () => state.current);
    return () => {
      shared.guards.delete(id);
    };
  }, [id]);
}
