"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
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
  stream?: MediaStream;
};

type ParticipantRole = "student" | "teacher";
type ParticipantStatus = "pending" | "active" | "rejected";
type PendingParticipant = {
  id: string;
  displayName: string;
  role: ParticipantRole;
  status: ParticipantStatus;
};
type ActiveParticipant = {
  id: string;
  displayName: string;
  role: ParticipantRole;
  status: ParticipantStatus;
  handRaised: boolean;
  handRaisedAt: number | null;
};
type AiChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
};

function cleanAiDisplayText(content: string) {
  return content
    .replace(/\r/g, "")
    .replace(/`/g, "")
    .replace(/\*\*/g, "")
    .replace(/^\s{0,3}#{1,6}\s*/gm, "")
    .replace(/^\s*[-*+]\s+/gm, "- ")
    .replace(/^\s*\d+\.\s+/gm, (match) => match.trimStart())
    .replace(/(^|[\s(])\*([^*\n]+)\*(?=[\s).,!?]|$)/g, "$1$2")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function looksStructured(content: string) {
  const lines = content.split("\n");
  const pipeLines = lines.filter((line) => line.includes("|")).length;
  return content.includes("```") || pipeLines >= 2;
}

function cleanStructuredText(content: string) {
  return content.replace(/\r/g, "").replace(/```[a-zA-Z0-9_-]*\n?/g, "").trim();
}

type AssistantPart =
  | { type: "text"; content: string }
  | { type: "code"; content: string };

function splitAssistantContent(content: string): AssistantPart[] {
  const normalized = content.replace(/\r/g, "");
  const regex = /```[a-zA-Z0-9_-]*\n([\s\S]*?)```/g;
  const parts: AssistantPart[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(normalized)) !== null) {
    const before = normalized.slice(lastIndex, match.index).trim();
    if (before) {
      parts.push({ type: "text", content: cleanAiDisplayText(before) });
    }

    const code = (match[1] ?? "").trim();
    if (code) {
      parts.push({ type: "code", content: code });
    }
    lastIndex = regex.lastIndex;
  }

  const trailing = normalized.slice(lastIndex).trim();
  if (trailing) {
    parts.push({ type: "text", content: cleanAiDisplayText(trailing) });
  }

  if (parts.length === 0) {
    return [{ type: "text", content: cleanAiDisplayText(normalized) }];
  }

  return parts;
}

const SESSION_STORAGE_PREFIX = "meeting_participant_session_";
const PREFS_STORAGE_PREFIX = "meeting_media_prefs_";

function sessionKey(meetingCode: string) {
  return `${SESSION_STORAGE_PREFIX}${meetingCode}`;
}

function prefsKey(meetingCode: string) {
  return `${PREFS_STORAGE_PREFIX}${meetingCode}`;
}

function RemoteVideo({ publication, stream }: { publication?: RemoteTrackPublication; stream?: MediaStream }) {
  const videoRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    if (stream && videoRef.current) {
      videoRef.current.srcObject = stream;
      videoRef.current.play().catch(() => undefined);
      return;
    }

    const track = publication?.videoTrack;
    const node = videoRef.current;

    if (!track || !node) {
      return;
    }

    track.attach(node);
    return () => {
      track.detach(node);
    };
  }, [publication, stream]);

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

function isIgnoredLiveKitDataChannelError(message: string) {
  return message.includes("Unknown DataChannel error on lossy") || message.includes("Unknown DataChannel error on reliable");
}

export default function MeetingRoomPage() {
  const params = useParams<{ meetingCode: string }>();
  const router = useRouter();
  const rawMeetingCode = decodeURIComponent(params.meetingCode ?? "");
  const readableMeetingCode = normalizeMeetingCode(rawMeetingCode) ?? "";
  const lobbyHref = `/${encodeURIComponent(readableMeetingCode)}`;

  const [, setCameraStatus] = useState<CameraStatus>("idle");
  const [cameraEnabled, setCameraEnabled] = useState(false);
  const [micEnabled, setMicEnabled] = useState(false);
  const [accessError, setAccessError] = useState("");
  const [, setConnectionState] = useState<ConnectionState>(ConnectionState.Disconnected);
  const [remoteParticipants, setRemoteParticipants] = useState<RemoteTile[]>([]);
  const [pendingParticipants, setPendingParticipants] = useState<PendingParticipant[]>([]);
  const [raisedHands, setRaisedHands] = useState<ActiveParticipant[]>([]);
  const [activeStudents, setActiveStudents] = useState<ActiveParticipant[]>([]);
  const [selfRole, setSelfRole] = useState<ParticipantRole | null>(null);
  const [isHandRaised, setIsHandRaised] = useState(false);
  const [isRaisedHandsPopupOpen, setIsRaisedHandsPopupOpen] = useState(false);
  const [isCopiedToastVisible, setIsCopiedToastVisible] = useState(false);
  const [clockNow, setClockNow] = useState(() => new Date());
  const [aiMessages, setAiMessages] = useState<AiChatMessage[]>([]);
  const [aiInput, setAiInput] = useState("");
  const [aiSending, setAiSending] = useState(false);
  const [aiError, setAiError] = useState("");

  const participantIdRef = useRef("");
  const copyToastTimeoutRef = useRef<number | null>(null);
  const isLeavingRef = useRef(false);
  const roomRef = useRef<Room | null>(null);
  const localVideoRef = useRef<HTMLVideoElement | null>(null);
  const localPreviewStreamRef = useRef<MediaStream | null>(null);
  const fallbackPeersRef = useRef<Map<string, RTCPeerConnection>>(new Map());
  const fallbackParticipantsRef = useRef<Map<string, ActiveParticipant>>(new Map());
  const removedParticipantIdsRef = useRef<Set<string>>(new Set());
  const hasBeenRemovedRef = useRef(false);
  const aiMessagesEndRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const originalConsoleError = console.error;
    console.error = (...args: Parameters<typeof console.error>) => {
      const message = typeof args[0] === "string" ? args[0] : "";
      if (isIgnoredLiveKitDataChannelError(message)) {
        return;
      }

      originalConsoleError(...args);
    };

    setLogLevel("warn");
    setLogExtension((level, msg, context) => {
      if (level !== LogLevel.error) {
        return;
      }

      const text = String(msg ?? "");
      if (isIgnoredLiveKitDataChannelError(text)) {
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
      console.error = originalConsoleError;
      window.removeEventListener("unhandledrejection", handleUnhandledRejection);
    };
  }, []);

  useEffect(() => {
    aiMessagesEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [aiMessages, aiSending]);

  async function sendAiMessage() {
    const userText = aiInput.trim();
    if (!userText || aiSending) {
      return;
    }

    const userMessage: AiChatMessage = {
      id: `${Date.now()}-user`,
      role: "user",
      content: userText
    };

    const nextMessages = [...aiMessages, userMessage];
    setAiMessages(nextMessages);
    setAiInput("");
    setAiSending(true);
    setAiError("");

    try {
      const response = await fetch("/api/ai-chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          messages: nextMessages.map((message) => ({
            role: message.role,
            content: message.content
          }))
        })
      });

      const data = (await response.json()) as { reply?: string; error?: string; details?: string };

      if (!response.ok || !data.reply) {
        const detailText = data.details ? ` ${data.details}` : "";
        throw new Error((data.error ?? "Failed to get AI response.") + detailText);
      }

      const assistantMessage: AiChatMessage = {
        id: `${Date.now()}-assistant`,
        role: "assistant",
        content: data.reply
      };
      setAiMessages((current) => [...current, assistantMessage]);
    } catch (error) {
      setAiError(error instanceof Error ? error.message : "Failed to get AI response.");
    } finally {
      setAiSending(false);
    }
  }

  useEffect(() => {
    const timer = window.setInterval(() => {
      setClockNow(new Date());
    }, 30000);

    return () => {
      window.clearInterval(timer);
    };
  }, []);

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
    const participants = [...room.remoteParticipants.values()]
      .map(mapParticipant)
      .filter((participant) => !removedParticipantIdsRef.current.has(participant.id));
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

  async function sendFallbackSignal(
    toParticipantId: string,
    signalType: "offer" | "answer" | "ice-candidate",
    signal: RTCSessionDescriptionInit | RTCIceCandidateInit
  ) {
    await fetch(`/api/meetings/${encodeURIComponent(readableMeetingCode)}/signal`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ toParticipantId, signalType, signal })
    }).catch(() => undefined);
  }

  function addLocalTracksToFallbackPeer(peer: RTCPeerConnection) {
    const stream = localPreviewStreamRef.current;
    if (!stream) {
      return;
    }

    for (const track of stream.getTracks()) {
      const alreadyAdded = peer.getSenders().some((sender) => sender.track === track);
      if (!alreadyAdded) {
        peer.addTrack(track, stream);
      }
    }
  }

  async function ensureFallbackPeer(participant: ActiveParticipant) {
    if (!participantIdRef.current || participant.id === participantIdRef.current || participant.status !== "active") {
      return null;
    }

    fallbackParticipantsRef.current.set(participant.id, participant);
    const existing = fallbackPeersRef.current.get(participant.id);
    if (existing) {
      addLocalTracksToFallbackPeer(existing);
      return existing;
    }

    const peer = new RTCPeerConnection();
    fallbackPeersRef.current.set(participant.id, peer);
    peer.addTransceiver("video", { direction: "recvonly" });
    peer.addTransceiver("audio", { direction: "recvonly" });
    addLocalTracksToFallbackPeer(peer);

    peer.onicecandidate = (event) => {
      if (event.candidate) {
        sendFallbackSignal(participant.id, "ice-candidate", event.candidate);
      }
    };

    peer.ontrack = (event) => {
      const stream = event.streams[0];
      if (!stream) {
        return;
      }

      setRemoteParticipants((prev) => {
        const filtered = prev.filter((tile) => tile.id !== participant.id);
        return [
          ...filtered,
          {
            id: participant.id,
            name: participant.displayName,
            role: participant.role,
            stream
          }
        ];
      });
    };

    peer.onnegotiationneeded = async () => {
      if (!participantIdRef.current || participantIdRef.current > participant.id) {
        return;
      }

      const offer = await peer.createOffer();
      await peer.setLocalDescription(offer);
      await sendFallbackSignal(participant.id, "offer", offer);
    };

    return peer;
  }

  function closeFallbackPeer(participantId: string) {
    fallbackPeersRef.current.get(participantId)?.close();
    fallbackPeersRef.current.delete(participantId);
    fallbackParticipantsRef.current.delete(participantId);
    setRemoteParticipants((prev) => prev.filter((tile) => tile.id !== participantId));
  }

  async function handleFallbackSignal(event: {
    fromParticipantId: string;
    signalType: "offer" | "answer" | "ice-candidate";
    signal: RTCSessionDescriptionInit | RTCIceCandidateInit;
  }) {
    const participant = fallbackParticipantsRef.current.get(event.fromParticipantId);
    if (!participant) {
      return;
    }

    const peer = await ensureFallbackPeer(participant);
    if (!peer) {
      return;
    }

    if (event.signalType === "ice-candidate") {
      await peer.addIceCandidate(event.signal as RTCIceCandidateInit).catch(() => undefined);
      return;
    }

    if (event.signalType === "offer") {
      await peer.setRemoteDescription(event.signal as RTCSessionDescriptionInit);
      const answer = await peer.createAnswer();
      await peer.setLocalDescription(answer);
      await sendFallbackSignal(event.fromParticipantId, "answer", answer);
      return;
    }

    await peer.setRemoteDescription(event.signal as RTCSessionDescriptionInit);
  }

  async function connectRoom() {
    if (!readableMeetingCode || roomRef.current) {
      return;
    }

    setCameraStatus("requesting");

    let desiredCamera = false;
    let desiredMic = false;
    try {
      const rawPrefs = sessionStorage.getItem(prefsKey(readableMeetingCode));
      if (rawPrefs) {
        const parsed = JSON.parse(rawPrefs) as { cameraEnabled?: boolean; micEnabled?: boolean };
        desiredCamera = Boolean(parsed.cameraEnabled);
        desiredMic = Boolean(parsed.micEnabled);
      }
    } catch {
      desiredCamera = false;
      desiredMic = false;
    }

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
        if (desiredCamera && !hasActiveLocalTrack(room, Track.Kind.Video)) {
          await room.localParticipant.setCameraEnabled(true);
        }
        if (!desiredCamera && hasActiveLocalTrack(room, Track.Kind.Video)) {
          await room.localParticipant.setCameraEnabled(false);
        }
        await attachLocalVideo(room);
        cameraOn = desiredCamera;
      } catch (error) {
        const details = formatUnknownError(error);
        if (!details.message.includes("Cancelled publication by calling unpublish")) {
          console.error("LiveKit camera enable error", details);
        }
      }

      try {
        if (desiredMic && !hasActiveLocalTrack(room, Track.Kind.Audio)) {
          await room.localParticipant.setMicrophoneEnabled(true);
        }
        if (!desiredMic && hasActiveLocalTrack(room, Track.Kind.Audio)) {
          await room.localParticipant.setMicrophoneEnabled(false);
        }
        micOn = desiredMic;
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
    stopLocalPreviewCamera();
  }

  async function toggleCamera() {
    const room = roomRef.current;
    const next = !cameraEnabled;

    if (!room) {
      if (next) {
        setCameraEnabled(await startLocalPreviewCamera());
      } else {
        stopLocalPreviewCamera();
        setCameraEnabled(false);
      }
      return;
    }

    await room.localParticipant.setCameraEnabled(next);
    setCameraEnabled(next);
    await attachLocalVideo(room);
  }

  async function startLocalPreviewCamera() {
    if (localPreviewStreamRef.current) {
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = localPreviewStreamRef.current;
        await localVideoRef.current.play().catch(() => undefined);
      }
      for (const peer of fallbackPeersRef.current.values()) {
        addLocalTracksToFallbackPeer(peer);
      }
      return true;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
      localPreviewStreamRef.current = stream;
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = stream;
        await localVideoRef.current.play().catch(() => undefined);
      }
      for (const peer of fallbackPeersRef.current.values()) {
        addLocalTracksToFallbackPeer(peer);
      }
      setAccessError("");
      return true;
    } catch (error) {
      const details = formatUnknownError(error);
      setAccessError(`Camera unavailable: ${details.message}`);
      return false;
    }
  }

  function stopLocalPreviewCamera() {
    localPreviewStreamRef.current?.getTracks().forEach((track) => track.stop());
    localPreviewStreamRef.current = null;
    if (localVideoRef.current) {
      localVideoRef.current.srcObject = null;
    }
  }

  async function toggleMic() {
    const room = roomRef.current;
    const next = !micEnabled;

    if (!room) {
      setMicEnabled(next);
      return;
    }

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
      stopLocalPreviewCamera();
      if (copyToastTimeoutRef.current) {
        window.clearTimeout(copyToastTimeoutRef.current);
      }
    };
  }, [readableMeetingCode]);

  useEffect(() => {
    if (!readableMeetingCode) {
      return;
    }

    const events = new EventSource(`/api/meetings/${encodeURIComponent(readableMeetingCode)}/events`);
    events.onmessage = (message) => {
      const event = JSON.parse(message.data) as
        | { type: "snapshot"; participants: ActiveParticipant[]; sessionParticipantId: string }
        | { type: "participant-joined"; participant: ActiveParticipant }
        | { type: "participant-left"; participantId: string }
        | { type: "participant-status-updated"; participantId: string; status: ParticipantStatus }
        | {
            type: "signal";
            fromParticipantId: string;
            signalType: "offer" | "answer" | "ice-candidate";
            signal: RTCSessionDescriptionInit | RTCIceCandidateInit;
          };

      if (event.type === "snapshot") {
        participantIdRef.current = event.sessionParticipantId;
        for (const participant of event.participants.filter((item) => item.status === "active")) {
          if (participant.id !== event.sessionParticipantId) {
            ensureFallbackPeer(participant);
          }
        }
        return;
      }

      if (event.type === "participant-joined" && event.participant.status === "active") {
        ensureFallbackPeer(event.participant);
        return;
      }

      if (event.type === "participant-status-updated" && event.status !== "active") {
        closeFallbackPeer(event.participantId);
        return;
      }

      if (event.type === "participant-left") {
        closeFallbackPeer(event.participantId);
        return;
      }

      if (event.type === "signal") {
        handleFallbackSignal(event);
      }
    };

    return () => {
      events.close();
      for (const participantId of fallbackPeersRef.current.keys()) {
        closeFallbackPeer(participantId);
      }
    };
  }, [readableMeetingCode]);

  useEffect(() => {
    for (const participant of activeStudents) {
      ensureFallbackPeer(participant);
    }
  }, [activeStudents]);

  useEffect(() => {
    if (!readableMeetingCode) {
      return;
    }

    const poll = window.setInterval(async () => {
      const actorParticipantId = sessionStorage.getItem(sessionKey(readableMeetingCode)) ?? "";
      const response = await fetch(`/api/meetings/${encodeURIComponent(readableMeetingCode)}/participants`, {
        headers: actorParticipantId ? { "x-participant-id": actorParticipantId } : undefined
      }).catch(() => null);
      if (!response || !response.ok) {
        return;
      }

      const payload = (await response.json()) as {
        sessionParticipant?: {
          role?: ParticipantRole;
          handRaised?: boolean;
        } | null;
        participants?: ActiveParticipant[];
        pendingParticipants?: PendingParticipant[];
      };

      if (!payload.sessionParticipant) {
        if (!hasBeenRemovedRef.current) {
          hasBeenRemovedRef.current = true;
          setAccessError("You were removed from this room by the teacher.");
          await leaveMeeting();
          router.push("/landing");
        }
        return;
      }

      const serverRole = payload.sessionParticipant?.role;
      if (serverRole === "teacher" || serverRole === "student") {
        setSelfRole(serverRole);
      }
      setIsHandRaised(Boolean(payload.sessionParticipant?.handRaised));

      const queue = (payload.participants ?? [])
        .filter((participant) => participant.role === "student" && participant.status === "active" && participant.handRaised)
        .sort((a, b) => (a.handRaisedAt ?? Number.MAX_SAFE_INTEGER) - (b.handRaisedAt ?? Number.MAX_SAFE_INTEGER));
      setRaisedHands(queue);

      const students = (payload.participants ?? []).filter(
        (participant) => participant.role === "student" && participant.status === "active"
      );
      setActiveStudents(students);

      if (serverRole === "teacher") {
        setPendingParticipants(payload.pendingParticipants ?? []);
      } else {
        setPendingParticipants([]);
      }
    }, 2000);

    return () => {
      window.clearInterval(poll);
    };
  }, [readableMeetingCode]);

  async function resolvePending(participantId: string, action: "admit" | "reject") {
    const actorParticipantId = sessionStorage.getItem(sessionKey(readableMeetingCode)) ?? "";
    const response = await fetch(`/api/meetings/${encodeURIComponent(readableMeetingCode)}/${action}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(actorParticipantId ? { "x-participant-id": actorParticipantId } : {})
      },
      body: JSON.stringify({ participantId })
    });

    if (!response.ok) {
      const payload = (await response.json().catch(() => ({}))) as { message?: string };
      setAccessError(payload.message ?? `Could not ${action} participant.`);
      return;
    }

    setPendingParticipants((prev) => prev.filter((participant) => participant.id !== participantId));
  }

  async function toggleRaiseHand() {
    if (selfRole !== "student") {
      return;
    }

    const actorParticipantId = sessionStorage.getItem(sessionKey(readableMeetingCode)) ?? "";
    const next = !isHandRaised;
    const response = await fetch(`/api/meetings/${encodeURIComponent(readableMeetingCode)}/hand`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(actorParticipantId ? { "x-participant-id": actorParticipantId } : {})
      },
      body: JSON.stringify({ handRaised: next })
    });

    if (!response.ok) {
      const payload = (await response.json().catch(() => ({}))) as { message?: string };
      setAccessError(payload.message ?? "Could not update raise hand state.");
      return;
    }

    setIsHandRaised(next);
  }

  async function removeFromRoom(participantId: string) {
    const actorParticipantId = sessionStorage.getItem(sessionKey(readableMeetingCode)) ?? "";
    const response = await fetch(`/api/meetings/${encodeURIComponent(readableMeetingCode)}/remove`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(actorParticipantId ? { "x-participant-id": actorParticipantId } : {})
      },
      body: JSON.stringify({ participantId })
    });

    if (!response.ok) {
      const payload = (await response.json().catch(() => ({}))) as { message?: string };
      setAccessError(payload.message ?? "Could not remove participant.");
      return;
    }

    removedParticipantIdsRef.current.add(participantId);
    setActiveStudents((prev) => prev.filter((participant) => participant.id !== participantId));
    setRaisedHands((prev) => prev.filter((participant) => participant.id !== participantId));
    setRemoteParticipants((prev) => prev.filter((participant) => participant.id !== participantId));
    closeFallbackPeer(participantId);
  }

  async function copyMeetingLink() {
    const meetingLink = `${window.location.origin}/${encodeURIComponent(readableMeetingCode || rawMeetingCode)}`;
    try {
      await navigator.clipboard.writeText(meetingLink);
      setIsCopiedToastVisible(true);
      if (copyToastTimeoutRef.current) {
        window.clearTimeout(copyToastTimeoutRef.current);
      }
      copyToastTimeoutRef.current = window.setTimeout(() => {
        setIsCopiedToastVisible(false);
      }, 2000);
    } catch {
      setAccessError("Could not copy meeting link.");
    }
  }

  const teacherRemote = remoteParticipants.find((participant) => participant.role === "teacher");
  const studentRemotes = remoteParticipants.filter((participant) => participant.role !== "teacher");
  const latestRaisedHand = raisedHands[raisedHands.length - 1];
  const additionalRaisedHandsCount = Math.max(0, raisedHands.length - 1);
  const clockLabel = `${clockNow.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} ${clockNow.toLocaleDateString([], { weekday: "short" })}`;

  return (
    <main className="entry-shell room-shell">
      <div
        aria-label="Current time and day"
        style={{
          position: "fixed",
          top: "14px",
          left: "14px",
          zIndex: 70,
          padding: "6px 10px",
          borderRadius: "10px",
          border: "1px solid rgba(255,255,255,0.16)",
          background: "rgba(8,12,22,0.55)",
          color: "#f7fafc",
          fontSize: "0.82rem",
          fontWeight: 600,
          letterSpacing: "0.01em"
        }}
      >
        {clockLabel}
      </div>
      {selfRole === "teacher" ? (
        <div className="teacher-top-actions">
          {pendingParticipants.length > 0 ? (
            <div className="join-request-notifications">
              <button className="join-request-bell" type="button" aria-label={`Pending join requests: ${pendingParticipants.length}`}>
                <svg aria-hidden="true" viewBox="0 0 24 24">
                  <path d="M18 9.8c0-3.2-2.1-5.8-5-6.5V2h-2v1.3c-2.9.7-5 3.3-5 6.5V14l-1.8 3v1h15.6v-1L18 14V9.8Z" />
                  <path d="M9.8 20a2.2 2.2 0 0 0 4.4 0h-4.4Z" />
                </svg>
                <span>{pendingParticipants.length}</span>
              </button>
              <div className="join-request-tile" role="menu" aria-label="Pending join requests">
                {pendingParticipants.map((participant) => (
                  <div key={participant.id} className="join-request-row">
                    <span>{participant.displayName}</span>
                    <div className="join-request-actions">
                      <button type="button" onClick={() => resolvePending(participant.id, "admit")}>
                        Approve
                      </button>
                      <button type="button" onClick={() => resolvePending(participant.id, "reject")}>
                        Decline
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          <div className="participants-menu">
            <button className="participants-button" type="button" aria-label={`Participants: ${activeStudents.length + 1}`}>
              <svg aria-hidden="true" viewBox="0 0 24 24">
                <path d="M8.5 11.2a3.6 3.6 0 1 0 0-7.2 3.6 3.6 0 0 0 0 7.2Zm7 0a3.1 3.1 0 1 0 0-6.2 3.1 3.1 0 0 0 0 6.2ZM2.8 20c0-3.3 2.6-6 5.7-6s5.7 2.7 5.7 6v.2H2.8V20Zm11.8.2v-.5a7.5 7.5 0 0 0-1.6-4.6 5.2 5.2 0 0 1 2.5-.6c2.8 0 5.1 2.4 5.1 5.4v.3h-6Z" />
              </svg>
              <span>{activeStudents.length + 1}</span>
            </button>
            <div className="participants-tile" role="menu" aria-label="Active participants">
              <div className="participant-menu-row">
                <span>You</span>
              </div>
              {activeStudents.length === 0 ? (
                <p>No active students yet.</p>
              ) : (
                activeStudents.map((participant) => (
                  <div key={participant.id} className="participant-menu-row">
                    <span>{participant.displayName}</span>
                    <button type="button" onClick={() => removeFromRoom(participant.id)}>
                      Remove
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      ) : null}

      {raisedHands.length > 0 ? (
        <div className={`raised-hand-notifications${selfRole === "teacher" ? " with-teacher-actions" : ""}`}>
          <button
            type="button"
            className={`raised-hand-popup-trigger${isRaisedHandsPopupOpen ? " open" : ""}`}
            aria-label="Raised hands"
            aria-expanded={isRaisedHandsPopupOpen}
            aria-controls="raised-hands-list"
            onClick={() => setIsRaisedHandsPopupOpen((prev) => !prev)}
          >
            <img alt="" aria-hidden="true" src="/hand-back-right.svg" />
            <span>
              {latestRaisedHand?.displayName}
              {additionalRaisedHandsCount > 0 ? ` +${additionalRaisedHandsCount}` : ""}
            </span>
          </button>

          {isRaisedHandsPopupOpen ? (
            <div id="raised-hands-list" className="raised-hand-popup-list" role="menu" aria-label="Participants raising hand">
              {raisedHands.map((participant) => (
                <p key={participant.id}>{participant.displayName}</p>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}

      <div className="meeting-code-corner-wrap">
        {isCopiedToastVisible ? <p className="meeting-code-copy-toast">Copied !</p> : null}
        <div className="meeting-code-corner" aria-label="Meeting code">
          <span>{readableMeetingCode || rawMeetingCode}</span>
          <button type="button" onClick={copyMeetingLink}>
            <img src="/copy-2-svgrepo-com.svg" alt="Copy meeting link" />
          </button>
        </div>
      </div>

      <div className="room-cards-layout">
        <section className="room-side-chat-card room-ai-chat-card glass-panel" aria-label="AI Chat card">
          <div className="room-ai-chat">
            <p>AI Chat</p>
            <div className="room-ai-chat-thread" aria-live="polite">
              {aiMessages.length === 0 ? <span className="room-ai-chat-empty">Ask anything about the class.</span> : null}
              {aiMessages.map((message) => (
                <article
                  key={message.id}
                  className={`room-ai-chat-message ${message.role}${message.role === "assistant" && looksStructured(message.content) ? " structured" : ""}`}
                >
                  <strong>{message.role === "user" ? "You" : "AI"}</strong>
                  {message.role === "assistant" && looksStructured(message.content) ? (
                    splitAssistantContent(message.content).map((part, index) =>
                      part.type === "code" ? (
                        <div key={`${message.id}-code-${index}`} className="room-ai-chat-code-wrap">
                          <div className="room-ai-chat-code-head">💻 Pseudocode</div>
                          <div className="room-ai-chat-code-card">
                            <pre>{part.content}</pre>
                          </div>
                        </div>
                      ) : (
                        <p key={`${message.id}-text-${index}`}>{part.content}</p>
                      )
                    )
                  ) : (
                    <p>{message.role === "assistant" ? cleanAiDisplayText(message.content) : message.content}</p>
                  )}
                </article>
              ))}
              {aiSending ? (
                <article className="room-ai-chat-message assistant">
                  <strong>AI</strong>
                  <p>Thinking...</p>
                </article>
              ) : null}
              <div ref={aiMessagesEndRef} />
            </div>
            {aiError ? <span className="room-ai-chat-error">{aiError}</span> : null}
            <form
              className="room-ai-chat-form"
              onSubmit={(event) => {
                event.preventDefault();
                void sendAiMessage();
              }}
            >
              <input
                type="text"
                value={aiInput}
                onChange={(event) => setAiInput(event.target.value)}
                placeholder="Type your message..."
                aria-label="Type a message for AI chat"
              />
              <button type="submit" disabled={aiSending || aiInput.trim().length === 0}>
                Send
              </button>
            </form>
          </div>
        </section>

        <section className="capture-card room-meeting-card glass-panel" aria-label="Meeting room">
          <div className="room-grid" aria-label="Participants grid">
          {selfRole === "teacher" ? (
            <article className="participant-card self-tile teacher-tile">
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
          ) : teacherRemote ? (
            <article className="participant-card teacher-tile" key={teacherRemote.id}>
              <p>{teacherRemote.name} ({teacherRemote.role})</p>
              <div className="participant-video">
                <RemoteAudio publication={teacherRemote.audioPublication} />
                {teacherRemote.publication?.videoTrack || teacherRemote.stream ? (
                  <RemoteVideo publication={teacherRemote.publication} stream={teacherRemote.stream} />
                ) : (
                  <div className="participant-placeholder">Connected without video</div>
                )}
              </div>
            </article>
          ) : null}

          <div className="student-tile-row">
            {selfRole === "student" ? (
              <article className="participant-card self-tile student-tile">
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
            ) : null}

            {studentRemotes.length > 0 ? (
              studentRemotes.map((participant) => (
                <article className="participant-card student-tile" key={participant.id}>
                  <p>
                    {participant.name} ({participant.role})
                  </p>
                  <div className="participant-video">
                    <RemoteAudio publication={participant.audioPublication} />
                    {participant.publication?.videoTrack || participant.stream ? (
                      <RemoteVideo publication={participant.publication} stream={participant.stream} />
                    ) : (
                      <div className="participant-placeholder">Connected without video</div>
                    )}
                  </div>
                </article>
              ))
            ) : null}
          </div>
        </div>

          {accessError ? <p className="form-error">{accessError}</p> : null}


          <nav
            className={`meeting-control-nav ${selfRole === "student" ? "student-control-nav" : "teacher-control-nav"}`}
            aria-label="Meeting controls"
          >
          <button
            aria-label={cameraEnabled ? "Camera on" : "Camera off"}
            className={`room-icon-button camera-icon-button ${cameraEnabled ? "camera-on" : "camera-off"}`}
            title={cameraEnabled ? "Camera on" : "Camera off"}
            type="button"
            onClick={toggleCamera}
          >
            <svg aria-hidden="true" viewBox="0 0 24 24">
              <path d="M3 7.8C3 6.8 3.8 6 4.8 6h8.4c1 0 1.8.8 1.8 1.8v8.4c0 1-.8 1.8-1.8 1.8H4.8c-1 0-1.8-.8-1.8-1.8V7.8Z" />
              <path d="m16 10 4.1-2.2c.4-.2.9.1.9.6v7.2c0 .5-.5.8-.9.6L16 14v-4Z" />
              {!cameraEnabled ? <path d="M5 5l14 14" fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth="2.4" /> : null}
            </svg>
          </button>
          <button
            aria-label={micEnabled ? "Mic on" : "Mic off"}
            className={`room-icon-button mic-icon-button ${micEnabled ? "mic-on" : "mic-off"}`}
            title={micEnabled ? "Mic on" : "Mic off"}
            type="button"
            onClick={toggleMic}
          >
            <svg aria-hidden="true" viewBox="0 0 24 24">
              <path d="M12 14.5c1.7 0 3-1.3 3-3V6c0-1.7-1.3-3-3-3S9 4.3 9 6v5.5c0 1.7 1.3 3 3 3Z" />
              <path d="M18 11.5c0 3.1-2.4 5.5-6 5.5s-6-2.4-6-5.5" fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth="2" />
              <path d="M12 17v4" fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth="2" />
              <path d="M9 21h6" fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth="2" />
              {!micEnabled ? <path d="M5 5l14 14" fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth="2.4" /> : null}
            </svg>
          </button>
          {selfRole === "student" ? (
            <button
              aria-label={isHandRaised ? "Lower hand" : "Raise hand"}
              className={`room-icon-button hand-icon-button ${isHandRaised ? "hand-on" : "hand-off"}`}
              title={isHandRaised ? "Lower hand" : "Raise hand"}
              type="button"
              onClick={toggleRaiseHand}
            >
              <img alt="" aria-hidden="true" src="/hand-back-right.svg" />
            </button>
          ) : null}
          <button
            aria-label="Leave meeting"
            className="room-icon-button leave-icon-button"
            title="Leave meeting"
            type="button"
            onClick={async () => {
              await leaveMeeting();
              router.push("/landing");
            }}
          >
            <span className="leave-icon-inner" aria-hidden="true">
              <svg viewBox="0 0 24 24">
                <path
                  d="M2.10863 14.1079L3.76461 15.7639C4.02858 16.0413 4.38552 16.2119 4.76752 16.2431C5.84479 16.3311 7.91395 15.0073 8.44327 14.1917C8.8559 13.5559 8.69631 12.6629 8.69702 11.9465C10.8675 11.3476 13.1582 11.3453 15.3275 11.9399C15.3268 12.6563 15.1654 13.5497 15.5768 14.1847C16.1037 14.9979 18.1615 16.3114 19.2367 16.2294C19.6149 16.2006 19.97 16.0352 20.2357 15.7642L21.895 14.1049C22.5266 13.4721 22.4856 12.3791 21.7923 11.8009C16.3175 6.31749 7.7222 6.27776 2.21038 11.7982C1.51362 12.3797 1.47304 13.4775 2.10863 14.1079Z"
                  fill="none"
                  stroke="currentColor"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="1.5"
                />
              </svg>
            </span>
          </button>
          </nav>
        </section>

        <section className="room-side-chat-card glass-panel" aria-label="Meeting Chat card">
          <p>Meeting Chat</p>
        </section>
      </div>
    </main>
  );
}
