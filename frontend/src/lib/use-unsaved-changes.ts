"use client";

import { useCallback, useEffect, useRef } from "react";
import { subscribeHistoryGuard } from "./unsaved-navigation";

const DEFAULT_MESSAGE =
  "You have unsaved changes. Select OK to discard them and leave, or Cancel to stay and save.";

type NavigationEvent = Event & {
  navigationType: string;
  hashChange: boolean;
  destination: { url: string };
};

type LeavePermission = { destination: string | null; persistent: boolean; unload: boolean };

/** Check all mounted draft editors before invalidating authentication. */
export function confirmPendingChanges() {
  const event = new Event("app:confirm-leave", { cancelable: true });
  window.dispatchEvent(event);
  if (event.defaultPrevented) window.dispatchEvent(new Event("app:navigation-cancelled"));
  return !event.defaultPrevented;
}

/** Guards navigation without putting patient data in browser storage. */
export function useUnsavedChanges(dirty: boolean, message = DEFAULT_MESSAGE) {
  const dirtyRef = useRef(dirty);
  dirtyRef.current = dirty;
  const saved = useRef(false);
  if (!dirty) saved.current = false;
  const permission = useRef<LeavePermission | null>(null);
  const timer = useRef<number | undefined>(undefined);

  const rearm = useCallback(() => {
    permission.current = null;
    window.clearTimeout(timer.current);
  }, []);

  const accept = useCallback(
    (destination: string | null, persistent: boolean, asynchronousUnload = false) => {
      window.clearTimeout(timer.current);
      const accepted = { destination, persistent, unload: true };
      permission.current = accepted;
      if (!asynchronousUnload) {
        // A no-op exit must not authorize a later unload. Retain only a
        // destination match for a slow Next transition's navigate event.
        timer.current = window.setTimeout(() => {
          if (permission.current !== accepted) return;
          if (persistent) accepted.unload = false;
          else permission.current = null;
        }, 0);
      }
    },
    [],
  );

  const confirmAttempt = useCallback(
    (destination: string | null = null, persistent = false, asynchronousUnload = false) => {
      if (!dirtyRef.current || saved.current) return true;
      const pending = permission.current;
      if (pending && (pending.destination === null || pending.destination === destination)) {
        accept(destination, persistent, asynchronousUnload);
        return true;
      }
      rearm();
      if (!window.confirm(message)) return false;
      accept(destination, persistent, asynchronousUnload);
      return true;
    },
    [accept, message, rearm],
  );

  const markSaved = useCallback(() => {
    // Successful saves can redirect immediately, before React commits reset().
    // The next edit clears this baseline even if dirty never rendered false.
    saved.current = true;
    rearm();
  }, [rearm]);

  const confirmLeave = useCallback(
    (destination?: string) => {
      // Router transitions can finish asynchronously; authorize only their target.
      // Destination-less actions (week changes, no-op callbacks) remain one-shot.
      rearm();
      return destination
        ? confirmAttempt(new URL(destination, window.location.href).href, true)
        : confirmAttempt();
    },
    [confirmAttempt, rearm],
  );

  useEffect(() => {
    const explicitLeave = (event: Event) => {
      if (event.defaultPrevented) return;
      rearm();
      // Sign-out awaits its request before replacing the document. Keep only
      // this attempt authorized; another interaction/edit always revokes it.
      if (!confirmAttempt(null, true, true)) event.preventDefault();
    };
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (!dirtyRef.current || saved.current || permission.current?.unload) return;
      event.preventDefault();
      event.returnValue = "";
    };
    const edit = () => {
      saved.current = false;
      rearm();
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
      rearm();
      if (!confirmAttempt(destination.href, true)) {
        event.preventDefault();
        event.stopImmediatePropagation();
        window.dispatchEvent(new Event("app:navigation-cancelled"));
      }
    };
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
      if (!confirmAttempt(navigationEvent.destination.url, true)) {
        event.preventDefault();
        window.dispatchEvent(new Event("app:navigation-cancelled"));
      }
    };
    const unsubscribe = subscribeHistoryGuard(() => {
      // A native traversal is a new attempt, not an old pending link/signout.
      // A synchronous explicit confirmLeave + back() may share its permission.
      if (permission.current?.persistent) rearm();
      return confirmAttempt(window.location.href, true);
    });
    window.addEventListener("beforeunload", beforeUnload);
    window.addEventListener("app:confirm-leave", explicitLeave);
    window.addEventListener("app:navigation-cancelled", rearm);
    window.addEventListener("app:navigation-finished", rearm);
    document.addEventListener("pointerdown", rearm, true);
    document.addEventListener("keydown", rearm, true);
    document.addEventListener("input", edit, true);
    document.addEventListener("change", edit, true);
    document.addEventListener("click", linkClick, true);
    navigation?.addEventListener("navigate", navigate);
    navigation?.addEventListener("navigateerror", rearm);
    navigation?.addEventListener("navigatesuccess", rearm);
    return () => {
      unsubscribe();
      rearm();
      window.removeEventListener("beforeunload", beforeUnload);
      window.removeEventListener("app:confirm-leave", explicitLeave);
      window.removeEventListener("app:navigation-cancelled", rearm);
      window.removeEventListener("app:navigation-finished", rearm);
      document.removeEventListener("pointerdown", rearm, true);
      document.removeEventListener("keydown", rearm, true);
      document.removeEventListener("input", edit, true);
      document.removeEventListener("change", edit, true);
      document.removeEventListener("click", linkClick, true);
      navigation?.removeEventListener("navigate", navigate);
      navigation?.removeEventListener("navigateerror", rearm);
      navigation?.removeEventListener("navigatesuccess", rearm);
    };
  }, [confirmAttempt, rearm]);

  return { confirmLeave, markSaved };
}
