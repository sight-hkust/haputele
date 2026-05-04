"use client";

import "@livekit/components-styles";

import {
  ControlBar,
  GridLayout,
  LiveKitRoom,
  ParticipantTile,
  RoomAudioRenderer,
  useTracks,
} from "@livekit/components-react";
import { Track } from "livekit-client";

type Props = {
  token: string;
  serverUrl: string;
  onLeave: () => void;
};

export function MeetingRoom({ token, serverUrl, onLeave }: Props) {
  return (
    <LiveKitRoom
      token={token}
      serverUrl={serverUrl}
      connect
      video
      audio
      data-lk-theme="default"
      style={{ height: "100%", display: "flex", flexDirection: "column" }}
      onDisconnected={onLeave}
    >
      <Stage />
      <RoomAudioRenderer />
      <ControlBar />
    </LiveKitRoom>
  );
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
