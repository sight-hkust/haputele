"use client";

import { useCallback, useEffect, useId, useRef, useState, type FocusEvent } from "react";

// Caps Lock detection for password fields.
//
// Caps Lock is the one typing mistake a masked field hides completely: every
// character looks identical, so the only feedback is a failed sign-in with a
// deliberately vague `invalid_credentials`. Same reasoning as
// loginWhitespaceHint in lib/credentials.ts, caught before submit rather than
// after a round-trip.
//
// `getModifierState` lives on keyboard and mouse events only — never on a
// focus event. So a field reached by Tab (that keydown landed on the PREVIOUS
// element) has no event of its own to read. One document-level listener
// therefore keeps the last known answer, and each field seeds itself from that
// cache the moment it is focused.
//
// The shared cache is deliberately NOT what decides visibility. Each hook
// instance renders the hint only while ITS OWN input is focused, so the setup
// wizard's bulk account rows never light up ten hints at once.
//
// Known gap: if Caps Lock was already on before the page loaded and the field
// is autoFocused, there has been no event to read and we cannot know. No
// browser API exposes modifier state without one. The first keystroke fixes it.

type Subscriber = (on: boolean) => void;

let sharedCapsLockOn = false;
const subscribers = new Set<Subscriber>();

// Both keydown AND keyup: the Caps Lock key does not produce a matching pair
// on every platform (macOS historically fires keydown to switch on and keyup
// to switch off). We never track the toggle ourselves — we re-read the
// authoritative answer from whatever event we happen to receive.
function readCapsLock(event: Event): void {
  const next = (event as KeyboardEvent | MouseEvent).getModifierState("CapsLock");
  if (next === sharedCapsLockOn) return;
  sharedCapsLockOn = next;
  subscribers.forEach((notify) => {
    notify(next);
  });
}

// capture: true so a click's mousedown is recorded before the browser's
// default action moves focus into the field and our onFocus reads the cache.
const CAPTURE = true;
const WATCHED = ["keydown", "keyup", "mousedown"] as const;

function subscribe(notify: Subscriber): () => void {
  if (subscribers.size === 0) {
    for (const name of WATCHED) document.addEventListener(name, readCapsLock, CAPTURE);
  }
  subscribers.add(notify);
  return () => {
    subscribers.delete(notify);
    if (subscribers.size === 0) {
      for (const name of WATCHED) document.removeEventListener(name, readCapsLock, CAPTURE);
    }
  };
}

/** Any caller handlers the hook must call rather than replace. */
export type CapsLockHandlers = {
  onFocus?: (event: FocusEvent<HTMLInputElement>) => void;
  onBlur?: (event: FocusEvent<HTMLInputElement>) => void;
};

export type UseCapsLock = {
  /** True only while this input is focused AND Caps Lock is on. */
  capsLockOn: boolean;
  /** Id shared by the hint element and the input's aria-describedby. */
  hintId: string;
  /** Spread LAST on the Input — it already calls any handlers passed in. */
  capsLockProps: {
    onFocus: (event: FocusEvent<HTMLInputElement>) => void;
    onBlur: (event: FocusEvent<HTMLInputElement>) => void;
    "aria-describedby"?: string;
  };
};

export function useCapsLock(handlers?: CapsLockHandlers): UseCapsLock {
  const [visible, setVisible] = useState(false);
  const focused = useRef(false);
  const hintId = useId();

  // react-hook-form's register() returns a fresh object every render; keeping
  // the latest in a ref lets the returned handlers stay identity-stable.
  const latest = useRef(handlers);
  useEffect(() => {
    latest.current = handlers;
  });

  useEffect(
    () =>
      subscribe((on) => {
        // Unfocused fields stay subscribed (so the cache is never stale when
        // they are tabbed into) but never re-render.
        if (focused.current) setVisible(on);
      }),
    [],
  );

  const onFocus = useCallback((event: FocusEvent<HTMLInputElement>) => {
    focused.current = true;
    setVisible(sharedCapsLockOn);
    latest.current?.onFocus?.(event);
  }, []);

  const onBlur = useCallback((event: FocusEvent<HTMLInputElement>) => {
    focused.current = false;
    setVisible(false);
    latest.current?.onBlur?.(event);
  }, []);

  return {
    capsLockOn: visible,
    hintId,
    capsLockProps: {
      onFocus,
      onBlur,
      // Only reference the hint while it actually exists in the DOM.
      ...(visible ? { "aria-describedby": hintId } : {}),
    },
  };
}
