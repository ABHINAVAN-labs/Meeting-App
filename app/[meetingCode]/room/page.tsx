"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  DisconnectReason,
  ConnectionState,
  LogLevel,
  LocalTrackPublication,
  setLogExtension,
  setLogLevel,
  RemoteParticipant,
  RemoteTrackPublication,
  Room,
  RoomEvent,
  Track
} from "livekit-client";
import { normalizeMeetingCode } from "../../../lib/meetings/validation";

type CameraStatus = "idle" | "requesting" | "active" | "blocked";

type RemoteTile = {
  id: string;
  name: string;
  role: string;
  publication?: RemoteTrackPublication;
  audioPublication?: RemoteTrackPublication;
};

const SESSION_STORAGE_PREFIX = "meeting_participant_session_";

function sessionKey(meetingCode: string) {
  return `${SESSION_STORAGE_PREFIX}${meetingCode}`;
}

function RemoteVideo({ publication }: { publication?: RemoteTrackPublication }) {
  const videoRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    const track = publication?.videoTrack;
    const node = videoRef.current;

    if (!track || !node) {
      return;
    }

    track.attach(node);
    return () => {
      track.detach(node);
    };
  }, [publication]);

  return <video ref={videoRef} autoPlay playsInline suppressHydrationWarning />;
}

function formatUnknownError(error: unknown) {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack
    };
  }

  if (typeof error === "object" && error !== null) {
    const record = error as Record<string, unknown>;
    return {
      message: typeof record.message === "string" ? record.message : "Unknown object error",
      name: typeof record.name === "string" ? record.name : "UnknownError",
      details: record
    };
  }

  return {
    name: "UnknownError",
    message: String(error)
  };
}

function RemoteAudio({ publication }: { publication?: RemoteTrackPublication }) {
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    const track = publication?.audioTrack;
    const node = audioRef.current;

    if (!track || !node) {
      return;
    }

    track.attach(node);
    return () => {
      track.detach(node);
    };
  }, [publication]);

  return <audio ref={audioRef} autoPlay />;
}

function isExpectedDisconnect(reason: DisconnectReason | undefined) {
  if (!reason) {
    return false;
  }

  return reason === DisconnectReason.CLIENT_INITIATED || reason === DisconnectReason.PARTICIPANT_REMOVED;
}

export default function MeetingRoomPage() {
  const params = useParams<{ meetingCode: string }>();
  const router = useRouter();
  const rawMeetingCode = decodeURIComponent(params.meetingCode ?? "");
  const readableMeetingCode = normalizeMeetingCode(rawMeetingCode) ?? "";
  const lobbyHref = `/${encodeURIComponent(readableMeetingCode)}`;

  const [cameraStatus, setCameraStatus] = useState<CameraStatus>("idle");
  const [cameraEnabled, setCameraEnabled] = useState(true);
  const [micEnabled, setMicEnabled] = useState(true);
  const [accessError, setAccessError] = useState("");
  const [connectionState, setConnectionState] = useState<ConnectionState>(ConnectionState.Disconnected);
  const [remoteParticipants, setRemoteParticipants] = useState<RemoteTile[]>([]);

  const participantIdRef = useRef("");
  const isLeavingRef = useRef(false);
  const roomRef = useRef<Room | null>(null);
  const localVideoRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    setLogLevel("warn");
    setLogExtension((level, msg, context) => {
      if (level !== LogLevel.error) {
        return;
      }

      const text = String(msg ?? "");
      if (text.includes("Unknown DataChannel error on lossy") || text.includes("Unknown DataChannel error on reliable")) {
        return;
      }

      console.error("LiveKit", { level, msg: text, context });
    });

    const handleUnhandledRejection = (event: PromiseRejectionEvent) => {
      const reasonText =
        event.reason instanceof Error
          ? event.reason.message
          : typeof event.reason === "string"
            ? event.reason
            : "";

      if (reasonText.includes("Cancelled publication by calling unpublish")) {
        event.preventDefault();
      }
    };

    window.addEventListener("unhandledrejection", handleUnhandledRejection);
    return () => {
      window.removeEventListener("unhandledrejection", handleUnhandledRejection);
    };
  }, []);

  const isConnected = connectionState === ConnectionState.Connected;
  const remoteCount = useMemo(() => remoteParticipants.length, [remoteParticipants]);

  function mapParticipant(participant: RemoteParticipant): RemoteTile {
    const videoPub = [...participant.trackPublications.values()].find(
      (pub) => pub.kind === Track.Kind.Video
    ) as RemoteTrackPublication | undefined;
    const audioPub = [...participant.trackPublications.values()].find(
      (pub) => pub.kind === Track.Kind.Audio
    ) as RemoteTrackPublication | undefined;

    let role = "student";
    if (participant.metadata) {
      try {
        const parsed = JSON.parse(participant.metadata) as { role?: string };
        role = parsed.role ?? role;
      } catch {
        role = "student";
      }
    }

    return {
      id: participant.identity,
      name: participant.name || participant.identity,
      role,
      publication: videoPub,
      audioPublication: audioPub
    };
  }

  function refreshRemoteParticipants(room: Room) {
    const participants = [...room.remoteParticipants.values()].map(mapParticipant);
    setRemoteParticipants(participants);
  }

  async function attachLocalVideo(room: Room) {
    const publication = [...room.localParticipant.trackPublications.values()].find(
      (pub) => pub.kind === Track.Kind.Video
    ) as LocalTrackPublication | undefined;

    const localTrack = publication?.videoTrack;
    if (localTrack && localVideoRef.current) {
      localTrack.attach(localVideoRef.current);
    }
  }

  function hasActiveLocalTrack(room: Room, kind: Track.Kind) {
    const publication = [...room.localParticipant.trackPublications.values()].find(
      (pub) => pub.kind === kind
    ) as LocalTrackPublication | undefined;

    return Boolean(publication?.track && !publication.isMuted);
  }

  async function connectRoom() {
    if (!readableMeetingCode || roomRef.current) {
      return;
    }

    setCameraStatus("requesting");

    if (!participantIdRef.current) {
      participantIdRef.current = sessionStorage.getItem(sessionKey(readableMeetingCode)) ?? "";
    }

    const tokenResponse = await fetch(`/api/meetings/${encodeURIComponent(readableMeetingCode)}/token`, {
      method: "POST",
      headers: participantIdRef.current
        ? { "x-participant-id": participantIdRef.current }
        : undefined
    });

    if (!tokenResponse.ok) {
      const payload = (await tokenResponse.json().catch(() => ({}))) as { message?: string };
      setAccessError(payload.message ?? "Could not authorize room access.");
      setCameraStatus("blocked");
      return;
    }

    const payload = (await tokenResponse.json()) as { token?: unknown; url?: unknown };

    const token = typeof payload.token === "string" ? payload.token : "";
    const url = typeof payload.url === "string" ? payload.url : "";

    if (!url.startsWith("wss://") && !url.startsWith("ws://")) {
      setAccessError("LiveKit URL must start with wss:// (or ws:// for local dev).");
      setCameraStatus("blocked");
      return;
    }

    const room = new Room();
    roomRef.current = room;

    room
      .on(RoomEvent.ConnectionStateChanged, (nextState) => {
        setConnectionState(nextState);
        if (nextState === ConnectionState.Reconnecting) {
          setAccessError("Network unstable. Reconnecting...");
        } else if (nextState === ConnectionState.Connected && accessError === "Network unstable. Reconnecting...") {
          setAccessError("");
        }
      })
      .on(RoomEvent.Disconnected, (reason) => {
        if (!isLeavingRef.current && !isExpectedDisconnect(reason)) {
          console.error("LiveKit disconnected", {
            reason,
            url,
            online: navigator.onLine
          });
        }
      })
      .on(RoomEvent.ParticipantConnected, () => refreshRemoteParticipants(room))
      .on(RoomEvent.ParticipantDisconnected, () => refreshRemoteParticipants(room))
      .on(RoomEvent.TrackSubscribed, () => refreshRemoteParticipants(room))
      .on(RoomEvent.TrackUnsubscribed, () => refreshRemoteParticipants(room));

    try {
      if (!token || !token.includes(".")) {
        setAccessError("Token payload is invalid (not a JWT string).");
        setCameraStatus("blocked");
        room.disconnect();
        roomRef.current = null;
        return;
      }

      await room.connect(url, token);
      await room.startAudio();

      let cameraOn = false;
      let micOn = false;

      try {
        if (!hasActiveLocalTrack(room, Track.Kind.Video)) {
          await room.localParticipant.setCameraEnabled(true);
        }
        await attachLocalVideo(room);
        cameraOn = true;
      } catch (error) {
        const details = formatUnknownError(error);
        if (!details.message.includes("Cancelled publication by calling unpublish")) {
          console.error("LiveKit camera enable error", details);
        }
      }

      try {
        if (!hasActiveLocalTrack(room, Track.Kind.Audio)) {
          await room.localParticipant.setMicrophoneEnabled(true);
        }
        micOn = true;
      } catch (error) {
        const details = formatUnknownError(error);
        if (!details.message.includes("Cancelled publication by calling unpublish")) {
          console.error("LiveKit microphone enable error", details);
        }
      }

      setCameraEnabled(cameraOn);
      setMicEnabled(micOn);
      setCameraStatus("active");
      if (!cameraOn && !micOn) {
        setAccessError("Connected, but no camera/mic device found. You can still stay in the room.");
      } else if (!cameraOn) {
        setAccessError("Connected, but camera device not found.");
      } else if (!micOn) {
        setAccessError("Connected, but microphone device not found.");
      } else {
        setAccessError("");
      }
      refreshRemoteParticipants(room);
    } catch (error) {
      const details = formatUnknownError(error);
      console.error("LiveKit connect error", {
        ...details,
        url,
        online: navigator.onLine,
        userAgent: navigator.userAgent,
        roomState: room.state,
        tokenIssuerHint: token.split(".")[1]?.slice(0, 16) ?? "n/a"
      });

      setAccessError(`Connect failed: ${details.message}`);
      setCameraStatus("blocked");
      room.disconnect();
      roomRef.current = null;
    }
  }

  async function leaveMeeting() {
    isLeavingRef.current = true;

    if (readableMeetingCode) {
      if (!participantIdRef.current) {
        participantIdRef.current = sessionStorage.getItem(sessionKey(readableMeetingCode)) ?? "";
      }

      await fetch(`/api/meetings/${encodeURIComponent(readableMeetingCode)}/leave`, {
        method: "POST",
        keepalive: true,
        headers: participantIdRef.current
          ? { "x-participant-id": participantIdRef.current }
          : undefined
      }).catch(() => undefined);

      sessionStorage.removeItem(sessionKey(readableMeetingCode));
    }

    roomRef.current?.disconnect();
    roomRef.current = null;
  }

  async function toggleCamera() {
    const room = roomRef.current;
    if (!room) {
      return;
    }

    const next = !cameraEnabled;
    await room.localParticipant.setCameraEnabled(next);
    setCameraEnabled(next);
    await attachLocalVideo(room);
  }

  async function toggleMic() {
    const room = roomRef.current;
    if (!room) {
      return;
    }

    const next = !micEnabled;
    await room.localParticipant.setMicrophoneEnabled(next);
    setMicEnabled(next);
  }

  useEffect(() => {
    connectRoom();

    const handleBeforeUnload = () => {
      leaveMeeting().catch(() => undefined);
    };

    window.addEventListener("beforeunload", handleBeforeUnload);

    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
      isLeavingRef.current = true;
      roomRef.current?.disconnect();
      roomRef.current = null;
    };
  }, [readableMeetingCode]);

  return (
    <main className="entry-shell room-shell">
      <section className="capture-card glass-panel" aria-label="Meeting room">
        <div className="capture-header">
          <div>
            <p className="eyebrow">Meeting room</p>
            <h2>{readableMeetingCode || rawMeetingCode}</h2>
          </div>
          <span className={`capture-status ${isConnected ? "active" : "blocked"}`}>
            {isConnected ? `Live (${remoteCount + 1})` : cameraStatus === "requesting" ? "Connecting" : "Limited"}
          </span>
        </div>

        <div className="room-grid" aria-label="Participants grid">
          <article className="participant-card self-tile">
            <p>You</p>
            <div className="participant-video">
              <video ref={localVideoRef} autoPlay muted playsInline suppressHydrationWarning />
              {!cameraEnabled ? (
                <div className="camera-off-layer">
                  <strong>Camera off</strong>
                  <span>Your camera is currently disabled.</span>
                </div>
              ) : null}
            </div>
          </article>

          {remoteParticipants.length > 0 ? (
            remoteParticipants.map((participant) => (
              <article className="participant-card" key={participant.id}>
                <p>
                  {participant.name} ({participant.role})
                </p>
                <div className="participant-video">
                  <RemoteAudio publication={participant.audioPublication} />
                  {participant.publication?.videoTrack ? (
                    <RemoteVideo publication={participant.publication} />
                  ) : (
                    <div className="participant-placeholder">Connected without video</div>
                  )}
                </div>
              </article>
            ))
          ) : (
            <article className="participant-card">
              <p>Waiting Room</p>
              <div className="participant-placeholder">No other participants yet</div>
            </article>
          )}
        </div>

        {accessError ? <p className="form-error">{accessError}</p> : null}

        <div className="room-controls">
          <button className={cameraEnabled ? "active" : ""} type="button" onClick={toggleCamera}>
            {cameraEnabled ? "Camera on" : "Camera off"}
          </button>
          <button className={micEnabled ? "active" : ""} type="button" onClick={toggleMic}>
            {micEnabled ? "Mic on" : "Mic off"}
          </button>
        </div>

        <div className="room-actions">
          <Link className="ghost-action" href={lobbyHref}>
            Back to Lobby
          </Link>
          <button
            className="ghost-action"
            type="button"
            onClick={async () => {
              await leaveMeeting();
              router.push("/landing");
            }}
          >
            Leave Room
          </button>
        </div>
      </section>
    </main>
  );
}
