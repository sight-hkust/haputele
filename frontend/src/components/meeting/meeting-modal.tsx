"use client";

import { X } from "lucide-react";

import { MeetingRoom } from "./meeting-room";

type Props = {
  token: string;
  serverUrl: string;
  onClose: () => void;
};

// Full-screen overlay so the call sits on top of the cockpit / consultation
// form without unmounting them. Closing only disconnects the local LiveKit
// session — it does NOT transition the appointment status. The healthworker
// must use the explicit "End meeting" button to flip to awaiting_notes.
export function MeetingModal({ token, serverUrl, onClose }: Props) {
  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black">
      <div className="flex items-center justify-end px-4 py-2">
        <button
          type="button"
          onClick={onClose}
          aria-label="Close meeting view"
          className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-white/10 text-white transition hover:bg-white/20"
        >
          <X className="h-5 w-5" />
        </button>
      </div>
      <div className="min-h-0 flex-1">
        <MeetingRoom token={token} serverUrl={serverUrl} onLeave={onClose} />
      </div>
    </div>
  );
}
