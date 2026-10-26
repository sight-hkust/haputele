"use client";

// Only opaque positions enter history. Never store a draft or patient identifier.
const POSITION = "__haputeleHistoryPosition";
type HistoryTracking = { guards: Set<() => boolean>; initialized: boolean };
const host = globalThis as typeof globalThis & { __haputeleHistoryTracking?: HistoryTracking };
const tracking = host.__haputeleHistoryTracking ?? {
  guards: new Set<() => boolean>(),
  initialized: false,
};
host.__haputeleHistoryTracking = tracking;

export function subscribeHistoryGuard(guard: () => boolean) {
  tracking.guards.add(guard);
  return () => {
    tracking.guards.delete(guard);
  };
}

function confirmTraversal() {
  for (const guard of tracking.guards) {
    if (!guard()) {
      window.dispatchEvent(new Event("app:navigation-cancelled"));
      return false;
    }
  }
  return true;
}

/** Install before Next's history wrappers, once for this document's lifetime. */
function initializeHistory() {
  if (tracking.initialized || typeof window === "undefined") return;
  tracking.initialized = true;
  const history = window.history;
  let realm = `${Date.now()}-${Math.random()}`;
  let position = 0;
  let currentUrl = new URL(window.location.href);
  let currentState: unknown = history.state;
  const remember = () => {
    currentUrl = new URL(window.location.href);
    currentState = history.state;
  };
  const samePage = (url: URL) =>
    url.origin === currentUrl.origin &&
    url.pathname === currentUrl.pathname &&
    url.search === currentUrl.search;
  let restoring: number | null = null;
  const push = history.pushState.bind(history);
  const replace = history.replaceState.bind(history);
  const go = history.go.bind(history);
  const readPosition = (state: unknown): number | null => {
    const entry = (state as Record<string, unknown> | null)?.[POSITION] as
      | { realm?: string; index?: number }
      | undefined;
    return entry?.realm === realm && Number.isInteger(entry.index) ? (entry.index as number) : null;
  };
  const stamp = (state: unknown, index: number) => ({
    ...(state as Record<string, unknown> | null),
    [POSITION]: { realm, index },
  });
  // A reload starts a new tracking realm: previous-document positions are not
  // evidence of a same-document traversal distance in this document.
  replace(stamp(history.state, position), "");
  remember();
  history.pushState = (state, unused, url) => {
    const nextPosition = position + 1;
    push(stamp(state, nextPosition), unused, url);
    position = nextPosition;
    remember();
    window.dispatchEvent(new Event("app:navigation-finished"));
  };
  history.replaceState = (state, unused, url) => {
    replace(stamp(state, position), unused, url);
    remember();
    window.dispatchEvent(new Event("app:navigation-finished"));
  };
  window.addEventListener(
    "popstate",
    (event) => {
      const url = new URL(window.location.href);
      let target = readPosition(event.state);
      const fragmentChange = samePage(url) && url.hash !== currentUrl.hash;
      if (target === null && event.state === null && fragmentChange) {
        // Native anchors/location.hash create entries without carrying state.
        // Stamp the new entry while retaining this route's Next state and realm.
        target = position + 1;
        replace(stamp(currentState, target), "");
      }
      if (restoring !== null) {
        // Next never saw the rejected traversal, so it must not see its
        // compensating traversal either. The original tree remains mounted.
        event.stopImmediatePropagation();
        if (target !== null) position = target;
        remember();
        restoring = null;
        return;
      }
      const delta = target !== null ? target - position : null;
      if (
        !fragmentChange &&
        !(window as Window & { navigation?: EventTarget }).navigation &&
        delta !== null
      ) {
        if (!confirmTraversal()) {
          event.stopImmediatePropagation();
          restoring = position;
          go(-delta);
          return;
        }
      }
      // Native traversals to untracked same-document entries have no exposed
      // distance in legacy browsers. Do not guess +/-1 or rewrite Next's URL
      // and tree. Early app initialization tracks every app-created entry;
      // cross-document departures remain protected by beforeunload.
      if (target !== null) position = target;
      else {
        realm = `${Date.now()}-${Math.random()}`;
        position = 0;
        replace(stamp(event.state, position), "");
      }
      remember();
      window.dispatchEvent(new Event("app:navigation-finished"));
    },
    true,
  );
}

initializeHistory();
