"use client";

import "@livekit/components-styles";

import {
  ControlBar,
  GridLayout,
  LiveKitRoom,
  ParticipantTile,
  RoomAudioRenderer,
  useConnectionState,
  useTracks,
} from "@livekit/components-react";
import { Loader2, RotateCw } from "lucide-react";
import { ConnectionState, DisconnectReason, MediaDeviceFailure, Track } from "livekit-client";
import { useRef, useState } from "react";

type Props = {
  token: string;
  serverUrl: string;
  onLeave: () => void;
};

// Copy for the disconnect reasons a user can act on or should know about.
// Absent reasons fall back to the generic "check your connection" line.
const DROP_COPY: Partial<Record<DisconnectReason, string>> = {
  [DisconnectReason.DUPLICATE_IDENTITY]:
    "This call was joined from another device or tab — only one can stay connected.",
  [DisconnectReason.SERVER_SHUTDOWN]: "The call server restarted.",
  [DisconnectReason.ROOM_DELETED]: "This meeting has ended on the server.",
  [DisconnectReason.PARTICIPANT_REMOVED]: "You were removed from this meeting.",
  [DisconnectReason.CONNECTION_TIMEOUT]: "The connection timed out.",
  [DisconnectReason.SIGNAL_CLOSE]: "The connection to the call server was lost.",
};

function deviceFailureCopy(failure: MediaDeviceFailure | undefined): string {
  switch (failure) {
    case MediaDeviceFailure.PermissionDenied:
      return "Camera or microphone access was blocked. Allow permission in your browser, then use the controls below to turn them on.";
    case MediaDeviceFailure.DeviceInUse:
      return "Your camera or microphone is being used by another app. Close it, then toggle the control below.";
    case MediaDeviceFailure.NotFound:
      return "No camera or microphone was found on this device.";
    default:
      return "Your camera or microphone couldn't be started. Use the controls below to retry.";
  }
}

// LiveKit's room only ever told us "disconnected" — a failed join, a dropped
// call, and the user's own leave button all looked identical, so failures
// collapsed silently back to the "Join call" button. This wrapper keeps the
// same onLeave contract for deliberate exits but renders real states for the
// rest: connecting / reconnecting overlays, a media-permission warning, and a
// fatal panel offering Reconnect (remounts the room) or Leave.
export function MeetingRoom({ token, serverUrl, onLeave }: Props) {
  const [attempt, setAttempt] = useState(0);
  const [fatal, setFatal] = useState<{ title: string; detail?: string } | null>(null);
  const [deviceWarning, setDeviceWarning] = useState<string | null>(null);
  // Join failure vs mid-call drop need different copy, and past the first
  // successful connect an onError is no longer fatal — the room self-heals
  // and the reconnecting overlay covers instability.
  const wasConnected = useRef(false);

  const retry = () => {
    wasConnected.current = false;
    setFatal(null);
    setDeviceWarning(null);
    setAttempt((n) => n + 1);
  };

  return (
    <div className="relative h-full">
      <LiveKitRoom
        key={attempt}
        token={token}
        serverUrl={serverUrl}
        connect
        video
        audio
        data-lk-theme="default"
        style={{
          height: "100%",
          display: "flex",
          flexDirection: "column",
          position: "relative",
        }}
        onConnected={() => {
          wasConnected.current = true;
        }}
        onDisconnected={(reason) => {
          // The user pressed leave (ControlBar or header) — same contract as
          // before: collapse the panel/modal. Anything else is a drop the
          // user needs to know about, with a way back in.
          if (reason === DisconnectReason.CLIENT_INITIATED) {
            onLeave();
            return;
          }
          setFatal((prev) =>
            prev ?? {
              title: wasConnected.current
                ? "The call dropped"
                : "Couldn't connect to the call",
              detail: reason !== undefined ? DROP_COPY[reason] : undefined,
            },
          );
        }}
        onError={(error) => {
          if (!wasConnected.current) {
            setFatal((prev) => prev ?? { title: "Couldn't connect to the call" });
          }
          console.error("LiveKit error:", error);
        }}
        onMediaDeviceFailure={(failure) => setDeviceWarning(deviceFailureCopy(failure))}
      >
        <ConnectionOverlays />
        <Stage />
        <RoomAudioRenderer />
        <ControlBar />
      </LiveKitRoom>

      {deviceWarning && (
        <div
          role="alert"
          className="absolute inset-x-0 top-0 z-20 flex items-start justify-between gap-3 border-b border-amber-400/40 bg-amber-500/95 px-4 py-2 text-sm text-amber-950"
        >
          <span>{deviceWarning}</span>
          <button
            type="button"
            onClick={() => setDeviceWarning(null)}
            className="shrink-0 font-medium underline underline-offset-2"
          >
            Dismiss
          </button>
        </div>
      )}

      {fatal && (
        <div
          role="alert"
          className="absolute inset-0 z-30 flex flex-col items-center justify-center gap-4 bg-black/90 px-6 text-center text-white"
        >
          <div className="flex flex-col gap-1.5">
            <h3 className="text-lg font-semibold tracking-[-0.01em]">{fatal.title}</h3>
            <p className="max-w-sm text-sm leading-relaxed text-white/70">
              {fatal.detail ??
                "Check your connection and try again. If it keeps failing, contact your administrator."}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={retry}
              className="inline-flex h-10 items-center gap-2 rounded-xl bg-white px-5 text-sm font-medium text-neutral-900 transition hover:bg-white/90"
            >
              <RotateCw className="h-4 w-4" />
              Reconnect
            </button>
            <button
              type="button"
              onClick={onLeave}
              className="inline-flex h-10 items-center rounded-xl border border-white/30 px-5 text-sm font-medium text-white transition hover:bg-white/10"
            >
              Leave
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// Rendered inside LiveKitRoom so it can read the room's connection state.
// Connecting hides the (empty) stage; an unstable connection shows a strip
// while the SDK attempts its automatic reconnect.
function ConnectionOverlays() {
  const state = useConnectionState();
  if (state === ConnectionState.Connecting) {
    return (
      <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 bg-black text-white">
        <Loader2 className="h-6 w-6 animate-spin text-white/80" />
        <p className="text-sm text-white/70">Connecting…</p>
      </div>
    );
  }
  if (state === ConnectionState.Reconnecting || state === ConnectionState.SignalReconnecting) {
    return (
      <div className="absolute inset-x-0 top-0 z-10 flex items-center gap-2 bg-amber-500/95 px-4 py-2 text-sm font-medium text-amber-950">
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
        Connection unstable — reconnecting…
      </div>
    );
  }
  return null;
}

function Stage() {
  const tracks = useTracks(
    [
      { source: Track.Source.Camera, withPlaceholder: true },
      { source: Track.Source.ScreenShare, withPlaceholder: false },
    ],
    { onlySubscribed: false },
  );
  return (
    <GridLayout tracks={tracks} style={{ flex: 1, minHeight: 0 }}>
      <ParticipantTile />
    </GridLayout>
  );
}
