"use client";

import { useCallback, useEffect, useRef } from "react";

const DEFAULT_MESSAGE =
  "You have unsaved changes. Select OK to discard them and leave, or Cancel to stay and save.";

type NavigationEvent = Event & {
  navigationType: string;
  hashChange: boolean;
  destination: { url: string };
};

/** Check all mounted draft editors before invalidating authentication. */
export function confirmPendingChanges() {
  const event = new Event("app:confirm-leave", { cancelable: true });
  window.dispatchEvent(event);
  return !event.defaultPrevented;
}

/** Guards navigation without putting patient data in browser storage. */
export function useUnsavedChanges(dirty: boolean, message = DEFAULT_MESSAGE) {
  const bypassUntilClean = useRef(false);
  if (!dirty) bypassUntilClean.current = false;
  const dirtyRef = useRef(dirty);
  dirtyRef.current = dirty && !bypassUntilClean.current;
  const sentinel = useRef<string | null>(null);
  const restoring = useRef(false);

  const markSaved = useCallback(() => {
    // Clear synchronously before a successful submit's redirect. The caller
    // also resets its dirty state so future edits are protected again.
    bypassUntilClean.current = true;
    dirtyRef.current = false;
  }, []);

  const confirmLeave = useCallback(() => {
    if (!dirtyRef.current) return true;
    if (!window.confirm(message)) return false;
    bypassUntilClean.current = true;
    dirtyRef.current = false;
    return true;
  }, [message]);

  useEffect(() => {
    const explicitLeave = (event: Event) => {
      if (event.defaultPrevented) return;
      if (confirmLeave()) markSaved();
      else event.preventDefault();
    };
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (!dirtyRef.current) return;
      event.preventDefault();
      event.returnValue = "";
    };
    const linkClick = (event: MouseEvent) => {
      if (
        event.defaultPrevented ||
        event.button !== 0 ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey
      )
        return;
      const anchor = event.target instanceof Element ? event.target.closest("a[href]") : null;
      if (
        !(anchor instanceof HTMLAnchorElement) ||
        anchor.hasAttribute("download") ||
        (anchor.target && anchor.target !== "_self")
      )
        return;
      const destination = new URL(anchor.href, window.location.href);
      const current = new URL(window.location.href);
      if (
        destination.pathname === current.pathname &&
        destination.search === current.search &&
        destination.origin === current.origin
      )
        return;
      if (!confirmLeave()) {
        event.preventDefault();
        event.stopImmediatePropagation();
      }
    };
    // Cancel modern same-document navigation before a route unmounts.
    const navigation = (window as Window & { navigation?: EventTarget }).navigation;
    const navigate = (event: Event) => {
      const navigationEvent = event as NavigationEvent;
      if (
        !event.cancelable ||
        navigationEvent.hashChange ||
        navigationEvent.navigationType === "reload"
      )
        return;
      if (navigationEvent.destination.url === window.location.href) return;
      if (!confirmLeave()) event.preventDefault();
    };
    const popState = (event: PopStateEvent) => {
      if (restoring.current) {
        restoring.current = false;
        event.stopImmediatePropagation();
        return;
      }
      if (!sentinel.current) return;
      if (window.history.state?.__unsavedGuard === sentinel.current) return;
      // Stop Next's route handler for the duplicate entry, including after a
      // save. One Back action should still reach the actual previous page.
      event.stopImmediatePropagation();
      if (!confirmLeave()) {
        restoring.current = true;
        window.history.forward();
      } else {
        // First Back reached the duplicate of this page. Continue to the
        // actual previous page only after the clinician chooses Discard.
        sentinel.current = null;
        window.history.back();
      }
    };
    window.addEventListener("beforeunload", beforeUnload);
    window.addEventListener("app:confirm-leave", explicitLeave);
    document.addEventListener("click", linkClick, true);
    navigation?.addEventListener("navigate", navigate);
    if (!navigation) window.addEventListener("popstate", popState, true);
    return () => {
      window.removeEventListener("beforeunload", beforeUnload);
      window.removeEventListener("app:confirm-leave", explicitLeave);
      document.removeEventListener("click", linkClick, true);
      navigation?.removeEventListener("navigate", navigate);
      window.removeEventListener("popstate", popState, true);
    };
  }, [confirmLeave, markSaved]);

  useEffect(() => {
    if ((window as Window & { navigation?: EventTarget }).navigation) return;
    const existing = window.history.state?.__unsavedGuard;
    if (!sentinel.current && typeof existing === "string") {
      sentinel.current = existing;
    }
    if (dirty && !sentinel.current) {
      // Same-URL sentinel keeps Back on this form in browsers without the
      // Navigation API. Only an opaque token enters history, never form data.
      const token = `unsaved-${Date.now()}-${Math.random()}`;
      sentinel.current = token;
      window.history.pushState(
        { ...window.history.state, __unsavedGuard: token },
        "",
        window.location.href,
      );
    }
    // Do not traverse during a save/redirect. Retain the same-URL sentinel
    // until the clinician actually presses Back, when popState skips it.
  }, [dirty]);

  return { confirmLeave, markSaved };
}
