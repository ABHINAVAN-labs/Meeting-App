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
type AiVerbosity = "short" | "normal" | "detailed";
type AiRequestIndicator = "idle" | "running" | "success";
type MeetingChatMessage = {
  id: string;
  participantId: string;
  displayName: string;
  role: ParticipantRole;
  content: string;
  sentAt: number;
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
    .replace(/"\s*\*([^*\n]+)\*\s*"/g, '"$1"')
    .replace(/\*([^*\n]+)\*/g, "$1")
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

type AssistantLine = {
  kind: "heading" | "bullet" | "numbered" | "paragraph";
  text: string;
};

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

function getCodeBlockLabel(fullMessage: string, blockContent: string) {
  const text = `${fullMessage}\n${blockContent}`.toLowerCase();
  if (text.includes("pseudocode")) {
    return "Pseudocode";
  }
  return "Code";
}

function parseAssistantLines(content: string): AssistantLine[] {
  const lines = content.split("\n").map((line) => line.trim()).filter((line) => line.length > 0);
  return lines.map((line) => {
    if (/^[\p{Emoji_Presentation}\p{Extended_Pictographic}]/u.test(line) || line.endsWith(":")) {
      return { kind: "heading", text: line.replace(/^#+\s*/, "") };
    }
    if (/^[-*]\s+/.test(line)) {
      return { kind: "bullet", text: line.replace(/^[-*]\s+/, "") };
    }
    if (/^\d+\.\s+/.test(line)) {
      return { kind: "numbered", text: line };
    }
    return { kind: "paragraph", text: line };
  });
}

const SESSION_STORAGE_PREFIX = "meeting_participant_session_";
const PREFS_STORAGE_PREFIX = "meeting_media_prefs_";
const AI_CHAT_STORAGE_PREFIX = "meeting_ai_chat_";
const AI_CHAT_VERBOSITY_STORAGE_PREFIX = "meeting_ai_verbosity_";
const AI_RECENT_MESSAGE_LIMIT = 12;
const AI_SUMMARY_CHAR_LIMIT = 900;
const AI_REPLY_RENDER_CHAR_LIMIT = 5000;

function sessionKey(meetingCode: string) {
  return `${SESSION_STORAGE_PREFIX}${meetingCode}`;
}

function prefsKey(meetingCode: string) {
  return `${PREFS_STORAGE_PREFIX}${meetingCode}`;
}

function aiChatKey(meetingCode: string) {
  return `${AI_CHAT_STORAGE_PREFIX}${meetingCode}`;
}

function aiChatVerbosityKey(meetingCode: string) {
  return `${AI_CHAT_VERBOSITY_STORAGE_PREFIX}${meetingCode}`;
}

function createChatMessageId(role: AiChatMessage["role"]) {
  return `${Date.now()}-${role}-${Math.random().toString(36).slice(2, 8)}`;
}

function capAiReplyContent(content: string) {
  const text = content.trim();
  if (text.length <= AI_REPLY_RENDER_CHAR_LIMIT) {
    return text;
  }
  return `${text.slice(0, AI_REPLY_RENDER_CHAR_LIMIT).trim()}\n\n[Response truncated for readability]`;
}

function buildAiContext(messages: AiChatMessage[]) {
  const recentMessages = messages.slice(-AI_RECENT_MESSAGE_LIMIT);
  const olderMessages = messages.slice(0, Math.max(0, messages.length - AI_RECENT_MESSAGE_LIMIT));

  if (olderMessages.length === 0) {
    return {
      recentMessages,
      summary: ""
    };
  }

  const summary = olderMessages
    .map((message) => `${message.role === "user" ? "User" : "AI"}: ${cleanAiDisplayText(message.content)}`)
    .join("\n")
    .slice(0, AI_SUMMARY_CHAR_LIMIT)
    .trim();

  return {
    recentMessages,
    summary
  };
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
  }, [publication?.videoTrack, stream]);

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
  }, [publication?.audioTrack]);

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
  const [aiCooldownUntil, setAiCooldownUntil] = useState(0);
  const [aiCooldownSeconds, setAiCooldownSeconds] = useState(0);
  const [aiRequestIndicator, setAiRequestIndicator] = useState<AiRequestIndicator>("idle");
  const [aiMicListening, setAiMicListening] = useState(false);
  const [aiVerbosity, setAiVerbosity] = useState<AiVerbosity>("normal");
  const [aiChatHydrated, setAiChatHydrated] = useState(false);
  const [aiCopiedMessageId, setAiCopiedMessageId] = useState("");
  const [aiCopiedCodeKey, setAiCopiedCodeKey] = useState("");
  const [meetingChatMessages, setMeetingChatMessages] = useState<MeetingChatMessage[]>([]);
  const [meetingChatInput, setMeetingChatInput] = useState("");
  const [meetingChatSending, setMeetingChatSending] = useState(false);
  const [meetingChatError, setMeetingChatError] = useState("");

  const participantIdRef = useRef("");
  const selfRoleRef = useRef<ParticipantRole | null>(null);
  const connectAttemptRef = useRef(0);
  const copyToastTimeoutRef = useRef<number | null>(null);
  const aiCopyTimeoutRef = useRef<number | null>(null);
  const aiCooldownTimerRef = useRef<number | null>(null);
  const aiAbortControllerRef = useRef<AbortController | null>(null);
  const aiSpeechRecognitionRef = useRef<{
    start: () => void;
    stop: () => void;
    abort: () => void;
    continuous: boolean;
    interimResults: boolean;
    lang: string;
    onresult: ((event: { resultIndex: number; results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
    onerror: (() => void) | null;
    onend: (() => void) | null;
  } | null>(null);
  const isLeavingRef = useRef(false);
  const isConnectingRef = useRef(false);
  const roomRef = useRef<Room | null>(null);
  const localVideoRef = useRef<HTMLVideoElement | null>(null);
  const localPreviewStreamRef = useRef<MediaStream | null>(null);
  const cameraEnabledRef = useRef(false);
  const micEnabledRef = useRef(false);
  const removedParticipantIdsRef = useRef<Set<string>>(new Set());
  const hasBeenRemovedRef = useRef(false);
  const aiMessagesEndRef = useRef<HTMLDivElement | null>(null);
  const meetingChatEndRef = useRef<HTMLDivElement | null>(null);

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

  useEffect(() => {
    if (!readableMeetingCode) {
      setAiChatHydrated(true);
      return;
    }

    const savedMessages = window.sessionStorage.getItem(aiChatKey(readableMeetingCode));
    const savedVerbosity = window.sessionStorage.getItem(aiChatVerbosityKey(readableMeetingCode));
    if (savedMessages) {
      try {
        const parsed = JSON.parse(savedMessages) as AiChatMessage[];
        const validMessages = parsed.filter(
          (message) =>
            (message.role === "user" || message.role === "assistant") &&
            typeof message.content === "string" &&
            typeof message.id === "string"
        );
        setAiMessages(validMessages);
      } catch {
        window.sessionStorage.removeItem(aiChatKey(readableMeetingCode));
      }
    }
    if (savedVerbosity === "short" || savedVerbosity === "normal" || savedVerbosity === "detailed") {
      setAiVerbosity(savedVerbosity);
    }

    setAiChatHydrated(true);
  }, [readableMeetingCode]);

  useEffect(() => {
    if (!aiChatHydrated || !readableMeetingCode) {
      return;
    }

    window.sessionStorage.setItem(aiChatKey(readableMeetingCode), JSON.stringify(aiMessages));
    window.sessionStorage.setItem(aiChatVerbosityKey(readableMeetingCode), aiVerbosity);
  }, [aiChatHydrated, aiMessages, aiVerbosity, readableMeetingCode]);

  useEffect(() => {
    meetingChatEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [meetingChatMessages]);

  async function sendMeetingChatMessage() {
    const content = meetingChatInput.trim();
    if (!content || meetingChatSending) {
      return;
    }

    setMeetingChatSending(true);
    setMeetingChatError("");

    try {
      const response = await fetch(`/api/meetings/${encodeURIComponent(readableMeetingCode)}/chat`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(participantIdRef.current ? { "x-participant-id": participantIdRef.current } : {})
        },
        body: JSON.stringify({ content })
      });

      const payload = (await response.json().catch(() => ({}))) as {
        message?: MeetingChatMessage | string;
      };

      if (!response.ok || typeof payload.message === "string" || !payload.message) {
        throw new Error(typeof payload.message === "string" ? payload.message : "Could not send message.");
      }

      setMeetingChatMessages((current) => [...current, payload.message as MeetingChatMessage]);
      setMeetingChatInput("");
    } catch (error) {
      setMeetingChatError(error instanceof Error ? error.message : "Could not send message.");
    } finally {
      setMeetingChatSending(false);
    }
  }

  async function sendAiMessage(messageText = aiInput) {
    const userText = messageText.trim();
    if (!userText || aiSending || aiCooldownUntil > Date.now()) {
      return;
    }

    const userMessage: AiChatMessage = {
      id: createChatMessageId("user"),
      role: "user",
      content: userText
    };

    const nextMessages = [...aiMessages, userMessage];
    setAiMessages(nextMessages);
    if (messageText === aiInput) {
      setAiInput("");
    }
    setAiSending(true);
    setAiRequestIndicator("running");
    setAiError("");

    try {
      const controller = new AbortController();
      aiAbortControllerRef.current = controller;
      const { recentMessages, summary } = buildAiContext(nextMessages);
      const response = await fetch("/api/ai-chat", {
        method: "POST",
        signal: controller.signal,
        headers: {
          "Content-Type": "application/json",
          ...(participantIdRef.current ? { "x-participant-id": participantIdRef.current } : {})
        },
        body: JSON.stringify({
          summary,
          verbosity: aiVerbosity,
          messages: recentMessages.map((message) => ({
            role: message.role,
            content: message.content
          }))
        })
      });

      const data = (await response.json()) as { reply?: string; error?: string; details?: string };
      if (response.status === 429) {
        const retryAfterRaw = Number(response.headers.get("Retry-After") ?? "0");
        const retryAfterSeconds = Number.isFinite(retryAfterRaw) && retryAfterRaw > 0 ? Math.ceil(retryAfterRaw) : 10;
        setAiCooldownUntil(Date.now() + retryAfterSeconds * 1000);
      }

      if (!response.ok || !data.reply) {
        const detailText = data.details ? ` ${data.details}` : "";
        throw new Error((data.error ?? "Failed to get AI response.") + detailText);
      }

      const assistantMessage: AiChatMessage = {
        id: createChatMessageId("assistant"),
        role: "assistant",
        content: capAiReplyContent(data.reply)
      };
      setAiMessages((current) => [...current, assistantMessage]);
      setAiRequestIndicator("success");
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        setAiError("Request cancelled.");
      } else {
        setAiError(error instanceof Error ? error.message : "Failed to get AI response.");
      }
      setAiRequestIndicator("idle");
    } finally {
      aiAbortControllerRef.current = null;
      setAiSending(false);
    }
  }

  function cancelAiRequest() {
    if (!aiSending) {
      return;
    }
    aiAbortControllerRef.current?.abort();
    setAiRequestIndicator("idle");
  }

  function toggleAiMicInput() {
    const SpeechRecognitionCtor =
      (window as unknown as { SpeechRecognition?: new () => typeof aiSpeechRecognitionRef.current; webkitSpeechRecognition?: new () => typeof aiSpeechRecognitionRef.current })
        .SpeechRecognition ??
      (window as unknown as { webkitSpeechRecognition?: new () => typeof aiSpeechRecognitionRef.current }).webkitSpeechRecognition;

    if (!SpeechRecognitionCtor) {
      setAiError("Mic input is not supported in this browser.");
      return;
    }

    if (aiMicListening) {
      aiSpeechRecognitionRef.current?.stop();
      return;
    }

    const recognition = new SpeechRecognitionCtor();
    if (!recognition) {
      setAiError("Mic input is not available.");
      return;
    }

    aiSpeechRecognitionRef.current = recognition;
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.lang = "en-US";
    recognition.onresult = (event) => {
      const result = event.results[event.resultIndex];
      const transcript = result?.[0]?.transcript?.trim();
      if (!transcript) {
        return;
      }
      setAiInput((current) => `${current}${current ? " " : ""}${transcript}`);
    };
    recognition.onerror = () => {
      setAiMicListening(false);
    };
    recognition.onend = () => {
      setAiMicListening(false);
    };

    setAiMicListening(true);
    recognition.start();
  }

  useEffect(() => {
    if (aiCooldownUntil <= Date.now()) {
      setAiCooldownSeconds(0);
      return;
    }

    const updateCooldown = () => {
      const remaining = Math.max(0, Math.ceil((aiCooldownUntil - Date.now()) / 1000));
      setAiCooldownSeconds(remaining);
      if (remaining === 0 && aiCooldownTimerRef.current) {
        window.clearInterval(aiCooldownTimerRef.current);
        aiCooldownTimerRef.current = null;
      }
    };

    updateCooldown();
    aiCooldownTimerRef.current = window.setInterval(updateCooldown, 250);

    return () => {
      if (aiCooldownTimerRef.current) {
        window.clearInterval(aiCooldownTimerRef.current);
        aiCooldownTimerRef.current = null;
      }
    };
  }, [aiCooldownUntil]);

  function clearAiChat() {
    setAiMessages([]);
    setAiError("");
    setAiRequestIndicator("idle");
    aiAbortControllerRef.current?.abort();
    if (readableMeetingCode) {
      window.sessionStorage.removeItem(aiChatKey(readableMeetingCode));
    }
  }

  async function copyAiMessage(message: AiChatMessage) {
    try {
      await navigator.clipboard.writeText(cleanAiDisplayText(message.content));
      setAiCopiedMessageId(message.id);
      if (aiCopyTimeoutRef.current) {
        window.clearTimeout(aiCopyTimeoutRef.current);
      }
      aiCopyTimeoutRef.current = window.setTimeout(() => {
        setAiCopiedMessageId("");
      }, 1400);
    } catch {
      setAiError("Could not copy the AI response.");
    }
  }

  async function copyAiCode(code: string, codeKey: string) {
    try {
      await navigator.clipboard.writeText(code);
      setAiCopiedCodeKey(codeKey);
      if (aiCopyTimeoutRef.current) {
        window.clearTimeout(aiCopyTimeoutRef.current);
      }
      aiCopyTimeoutRef.current = window.setTimeout(() => {
        setAiCopiedCodeKey("");
      }, 1400);
    } catch {
      setAiError("Could not copy code block.");
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
    const pubs = [...participant.trackPublications.values()] as RemoteTrackPublication[];
    
    const videoPubs = pubs.filter((pub) => pub.kind === Track.Kind.Video);
    const videoPub = videoPubs.find((pub) => pub.isSubscribed && pub.videoTrack) ?? videoPubs[0];

    const audioPubs = pubs.filter((pub) => pub.kind === Track.Kind.Audio);
    const audioPub = audioPubs.find((pub) => pub.isSubscribed && pub.audioTrack) ?? audioPubs[0];

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
    const pubs = [...room.localParticipant.trackPublications.values()] as LocalTrackPublication[];
    const videoPubs = pubs.filter((pub) => pub.kind === Track.Kind.Video);
    const publication = videoPubs.find((pub) => pub.track) ?? videoPubs[0];

    const localTrack = publication?.videoTrack;
    if (localTrack && localVideoRef.current) {
      localTrack.attach(localVideoRef.current);
    }
  }

  function hasActiveLocalTrack(room: Room, kind: Track.Kind) {
    const pubs = [...room.localParticipant.trackPublications.values()] as LocalTrackPublication[];
    const typePubs = pubs.filter((pub) => pub.kind === kind);
    const publication = typePubs.find((pub) => pub.track && !pub.isMuted) ?? typePubs[0];

    return Boolean(publication?.track && !publication.isMuted);
  }

  function canPublishLocalTracks(room: Room) {
    return room.state === ConnectionState.Connected;
  }

  function updateMediaPrefs(nextCameraEnabled = cameraEnabledRef.current, nextMicEnabled = micEnabledRef.current) {
    cameraEnabledRef.current = nextCameraEnabled;
    micEnabledRef.current = nextMicEnabled;
    if (readableMeetingCode) {
      sessionStorage.setItem(
        prefsKey(readableMeetingCode),
        JSON.stringify({
          cameraEnabled: nextCameraEnabled,
          micEnabled: nextMicEnabled
        })
      );
    }
  }

  async function connectRoom() {
    if (!readableMeetingCode || roomRef.current || isConnectingRef.current) {
      return;
    }

    isConnectingRef.current = true;
    isLeavingRef.current = false;
    const connectAttempt = ++connectAttemptRef.current;
    setCameraStatus("requesting");

    let desiredCamera = false;
    let desiredMic = false;
    try {
      const rawPrefs = sessionStorage.getItem(prefsKey(readableMeetingCode));
      if (rawPrefs) {
        const parsed = JSON.parse(rawPrefs) as { cameraEnabled?: boolean; micEnabled?: boolean };
        desiredCamera = Boolean(parsed.cameraEnabled);
        desiredMic = Boolean(parsed.micEnabled);
        cameraEnabledRef.current = desiredCamera;
        micEnabledRef.current = desiredMic;
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
      isConnectingRef.current = false;
      return;
    }

    const payload = (await tokenResponse.json()) as { token?: unknown; url?: unknown; participantId?: unknown; role?: unknown };

    const token = typeof payload.token === "string" ? payload.token : "";
    const url = typeof payload.url === "string" ? payload.url : "";
    if (typeof payload.participantId === "string") {
      participantIdRef.current = payload.participantId;
      sessionStorage.setItem(sessionKey(readableMeetingCode), payload.participantId);
    }
    if (payload.role === "teacher" || payload.role === "student") {
      selfRoleRef.current = payload.role;
      setSelfRole(payload.role);
    }

    if (!url.startsWith("wss://") && !url.startsWith("ws://")) {
      setAccessError("LiveKit URL must start with wss:// (or ws:// for local dev).");
      setCameraStatus("blocked");
      isConnectingRef.current = false;
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
          console.warn("LiveKit disconnected", {
            reason,
            url,
            online: navigator.onLine
          });
        }
      })
      .on(RoomEvent.ParticipantConnected, () => refreshRemoteParticipants(room))
      .on(RoomEvent.ParticipantDisconnected, () => refreshRemoteParticipants(room))
      .on(RoomEvent.TrackPublished, () => refreshRemoteParticipants(room))
      .on(RoomEvent.TrackUnpublished, () => refreshRemoteParticipants(room))
      .on(RoomEvent.TrackSubscribed, () => refreshRemoteParticipants(room))
      .on(RoomEvent.TrackUnsubscribed, () => refreshRemoteParticipants(room))
      .on(RoomEvent.TrackMuted, () => refreshRemoteParticipants(room))
      .on(RoomEvent.TrackUnmuted, () => refreshRemoteParticipants(room));

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

      let cameraOn = cameraEnabledRef.current;
      let micOn = micEnabledRef.current;

      try {
        if (cameraOn && canPublishLocalTracks(room) && !hasActiveLocalTrack(room, Track.Kind.Video)) {
          await room.localParticipant.setCameraEnabled(true);
        }
        if (!cameraOn && canPublishLocalTracks(room) && hasActiveLocalTrack(room, Track.Kind.Video)) {
          await room.localParticipant.setCameraEnabled(false);
        }
        await attachLocalVideo(room);
      } catch (error) {
        const details = formatUnknownError(error);
        if (!details.message.includes("Cancelled publication by calling unpublish")) {
          console.error("LiveKit camera enable error", details);
        }
        if (cameraOn) {
          cameraOn = await startLocalPreviewCamera();
        }
      }

      try {
        if (micOn && canPublishLocalTracks(room) && !hasActiveLocalTrack(room, Track.Kind.Audio)) {
          await room.localParticipant.setMicrophoneEnabled(true);
        }
        if (!micOn && canPublishLocalTracks(room) && hasActiveLocalTrack(room, Track.Kind.Audio)) {
          await room.localParticipant.setMicrophoneEnabled(false);
        }
      } catch (error) {
        const details = formatUnknownError(error);
        if (!details.message.includes("Cancelled publication by calling unpublish")) {
          console.error("LiveKit microphone enable error", details);
        }
        if (micOn) {
          micOn = await startLocalPreviewMic();
        }
      }

      updateMediaPrefs(cameraOn, micOn);
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
      const wasAborted = details.message.includes("Abort handler called");
      if (wasAborted || isLeavingRef.current || connectAttempt !== connectAttemptRef.current) {
        if (roomRef.current === room) {
          roomRef.current = null;
        }
        return;
      }

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
    } finally {
      isConnectingRef.current = false;
    }
  }

  async function leaveMeeting() {
    isLeavingRef.current = true;
    connectAttemptRef.current += 1;

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
    stopLocalPreviewMic();
  }

  async function toggleCamera() {
    const room = roomRef.current;
    const next = !cameraEnabled;

    updateMediaPrefs(next, micEnabled);
    if (!room || !canPublishLocalTracks(room)) {
      if (next) {
        setCameraEnabled(await startLocalPreviewCamera());
      } else {
        stopLocalPreviewCamera();
        setCameraEnabled(false);
      }
      return;
    }

    let cameraOn = next;
    try {
      await room.localParticipant.setCameraEnabled(next);
      await attachLocalVideo(room);
    } catch (error) {
      if (next) {
        cameraOn = await startLocalPreviewCamera();
      } else {
        stopLocalPreviewCamera();
      }
      const details = formatUnknownError(error);
      if (!details.message.includes("Abort handler called")) {
        setAccessError(`Camera unavailable: ${details.message}`);
      }
    }

    updateMediaPrefs(cameraOn, micEnabled);
    setCameraEnabled(cameraOn);
  }

  async function startLocalPreviewCamera() {
    const existingVideo = localPreviewStreamRef.current?.getVideoTracks()[0];
    if (existingVideo) {
      existingVideo.enabled = true;
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = localPreviewStreamRef.current;
        await localVideoRef.current.play().catch(() => undefined);
      }
      return true;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
      const videoTrack = stream.getVideoTracks()[0];
      const currentStream = localPreviewStreamRef.current ?? new MediaStream();
      if (videoTrack) {
        currentStream.addTrack(videoTrack);
      }
      localPreviewStreamRef.current = currentStream;
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = currentStream;
        await localVideoRef.current.play().catch(() => undefined);
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
    localPreviewStreamRef.current?.getVideoTracks().forEach((track) => {
      track.stop();
      localPreviewStreamRef.current?.removeTrack(track);
    });
    if (localPreviewStreamRef.current?.getTracks().length === 0) {
      localPreviewStreamRef.current = null;
    }
    if (localVideoRef.current) {
      localVideoRef.current.srcObject = null;
    }
  }

  async function startLocalPreviewMic() {
    const existingAudio = localPreviewStreamRef.current?.getAudioTracks()[0];
    if (existingAudio) {
      existingAudio.enabled = true;
      return true;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: false, audio: true });
      const audioTrack = stream.getAudioTracks()[0];
      if (audioTrack) {
        const currentStream = localPreviewStreamRef.current ?? new MediaStream();
        currentStream.addTrack(audioTrack);
        localPreviewStreamRef.current = currentStream;
      }
      setAccessError("");
      return Boolean(audioTrack);
    } catch (error) {
      const details = formatUnknownError(error);
      setAccessError(`Microphone unavailable: ${details.message}`);
      return false;
    }
  }

  function stopLocalPreviewMic() {
    localPreviewStreamRef.current?.getAudioTracks().forEach((track) => {
      track.stop();
      localPreviewStreamRef.current?.removeTrack(track);
    });
    if (localPreviewStreamRef.current?.getTracks().length === 0) {
      localPreviewStreamRef.current = null;
    }
  }

  async function toggleMic() {
    const room = roomRef.current;
    const next = !micEnabled;

    updateMediaPrefs(cameraEnabled, next);
    if (!room || !canPublishLocalTracks(room)) {
      const micOn = next ? await startLocalPreviewMic() : false;
      if (!next) {
        stopLocalPreviewMic();
      }
      updateMediaPrefs(cameraEnabled, micOn);
      setMicEnabled(micOn);
      return;
    }

    let micOn = next;
    try {
      await room.localParticipant.setMicrophoneEnabled(next);
      if (!next) {
        stopLocalPreviewMic();
      }
    } catch (error) {
      if (next) {
        micOn = await startLocalPreviewMic();
      } else {
        stopLocalPreviewMic();
      }
      const details = formatUnknownError(error);
      if (!details.message.includes("Abort handler called")) {
        setAccessError(`Microphone unavailable: ${details.message}`);
      }
    }

    updateMediaPrefs(cameraEnabled, micOn);
    setMicEnabled(micOn);
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
      connectAttemptRef.current += 1;
      roomRef.current?.disconnect();
      roomRef.current = null;
      stopLocalPreviewCamera();
      stopLocalPreviewMic();
      if (copyToastTimeoutRef.current) {
        window.clearTimeout(copyToastTimeoutRef.current);
      }
      if (aiCopyTimeoutRef.current) {
        window.clearTimeout(aiCopyTimeoutRef.current);
      }
      if (aiCooldownTimerRef.current) {
        window.clearInterval(aiCooldownTimerRef.current);
        aiCooldownTimerRef.current = null;
      }
      aiSpeechRecognitionRef.current?.abort();
      aiAbortControllerRef.current?.abort();
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
        return;
      }

      if (event.type === "participant-joined" && event.participant.status === "active") {
        return;
      }

      if (event.type === "participant-status-updated" && event.status !== "active") {
        return;
      }

      if (event.type === "participant-left") {
        return;
      }

      if (event.type === "signal") {
        // Fallback WebRTC is disabled
      }
    };

    return () => {
      events.close();
    };
  }, [readableMeetingCode]);

  useEffect(() => {
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
        meetingChatMessages?: MeetingChatMessage[];
      };

      if (!payload.sessionParticipant) {
        if (!hasBeenRemovedRef.current) {
          hasBeenRemovedRef.current = true;
          if (selfRoleRef.current === "teacher") {
            setAccessError("Join this meeting from lobby first.");
          } else {
            setAccessError("You were removed from this room by the teacher.");
            await leaveMeeting();
            router.push("/landing");
          }
        }
        return;
      }

      const serverRole = payload.sessionParticipant?.role;
      if (serverRole === "teacher" || serverRole === "student") {
        selfRoleRef.current = serverRole;
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
      setMeetingChatMessages(payload.meetingChatMessages ?? []);

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
        suppressHydrationWarning
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
            <div className="room-ai-chat-header">
              <p>AI Chat</p>
              {aiMessages.length > 0 ? (
                <button type="button" onClick={clearAiChat}>
                  Clear
                </button>
              ) : null}
            </div>
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
                          <div className="room-ai-chat-code-head-row">
                            <div className="room-ai-chat-code-head">{getCodeBlockLabel(message.content, part.content)}</div>
                            <button
                              type="button"
                              className="room-ai-chat-code-copy"
                              onClick={() => void copyAiCode(part.content, `${message.id}-code-${index}`)}
                            >
                              {aiCopiedCodeKey === `${message.id}-code-${index}` ? "Copied" : "Copy code"}
                            </button>
                          </div>
                          <div className="room-ai-chat-code-card">
                            <pre>{part.content}</pre>
                          </div>
                        </div>
                      ) : (
                        <div key={`${message.id}-text-${index}`} className="room-ai-chat-text">
                          {parseAssistantLines(part.content).map((line, lineIndex) => (
                            <p key={`${message.id}-line-${index}-${lineIndex}`} className={`room-ai-chat-line ${line.kind}`}>
                              {line.kind === "bullet" ? `- ${line.text}` : line.text}
                            </p>
                          ))}
                        </div>
                      )
                    )
                  ) : message.role === "assistant" ? (
                    <div className="room-ai-chat-text">
                      {parseAssistantLines(cleanAiDisplayText(message.content)).map((line, lineIndex) => (
                        <p key={`${message.id}-plain-line-${lineIndex}`} className={`room-ai-chat-line ${line.kind}`}>
                          {line.kind === "bullet" ? `- ${line.text}` : line.text}
                        </p>
                      ))}
                    </div>
                  ) : (
                    <p>{message.content}</p>
                  )}
                  {message.role === "assistant" ? (
                    <div className="room-ai-chat-actions">
                      <button type="button" onClick={() => void copyAiMessage(message)}>
                        {aiCopiedMessageId === message.id ? "Copied" : "Copy"}
                      </button>
                      <button type="button" disabled={aiCooldownSeconds > 0 || aiSending} onClick={() => void sendAiMessage("Explain your previous answer more simply.")}>
                        Simpler
                      </button>
                      <button type="button" disabled={aiCooldownSeconds > 0 || aiSending} onClick={() => void sendAiMessage("Give me a short example for your previous answer.")}>
                        Example
                      </button>
                    </div>
                  ) : null}
                </article>
              ))}
              {aiSending ? (
                <article className="room-ai-chat-message assistant">
                  <strong>AI</strong>
                  <div className="room-ai-typing" aria-label="AI is thinking">
                    <span />
                    <span />
                    <span />
                  </div>
                </article>
              ) : null}
              <div ref={aiMessagesEndRef} />
            </div>
            {aiError ? <span className="room-ai-chat-error">{aiError}</span> : null}
            {aiCooldownSeconds > 0 ? <span className="room-ai-chat-cooldown">Try again in {aiCooldownSeconds}s</span> : null}
            <div className="room-ai-chat-verbosity" role="group" aria-label="AI response length">
              <button type="button" className={aiVerbosity === "short" ? "active" : ""} onClick={() => setAiVerbosity("short")}>
                Short
              </button>
              <button type="button" className={aiVerbosity === "normal" ? "active" : ""} onClick={() => setAiVerbosity("normal")}>
                Normal
              </button>
              <button type="button" className={aiVerbosity === "detailed" ? "active" : ""} onClick={() => setAiVerbosity("detailed")}>
                Detailed
              </button>
            </div>
            <form
              className={`room-ai-chat-form${aiSending ? " sending" : ""}`}
              onSubmit={(event) => {
                event.preventDefault();
                void sendAiMessage();
              }}
            >
              <div className="room-ai-chat-input-wrap">
                <input
                  type="text"
                  value={aiInput}
                  onChange={(event) => setAiInput(event.target.value)}
                  placeholder="Type your message..."
                  aria-label="Type a message for AI chat"
                />
                <div className="room-ai-chat-input-icons">
                  <button
                    type="button"
                    className={`room-ai-chat-inline-icon mic ${aiMicListening ? "active" : ""}`}
                    aria-label={aiMicListening ? "Stop microphone input" : "Use microphone input"}
                    onClick={toggleAiMicInput}
                    disabled={aiSending}
                  >
                    <svg viewBox="0 0 24 24" aria-hidden="true">
                      <path d="M12 14.5c1.7 0 3-1.3 3-3V6c0-1.7-1.3-3-3-3S9 4.3 9 6v5.5c0 1.7 1.3 3 3 3Z" />
                      <path d="M18 11.5c0 3.1-2.4 5.5-6 5.5s-6-2.4-6-5.5" fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth="2" />
                      <path d="M12 17v4" fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth="2" />
                      <path d="M9 21h6" fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth="2" />
                    </svg>
                  </button>
                  {aiSending ? (
                    <button
                      type="button"
                      className="room-ai-chat-inline-icon stop"
                      aria-label="Cancel AI request"
                      onClick={cancelAiRequest}
                    >
                      <svg viewBox="0 0 24 24" aria-hidden="true">
                        <rect x="8" y="8" width="8" height="8" rx="1.6" />
                      </svg>
                    </button>
                  ) : null}
                </div>
              </div>
              {!aiSending ? (
                <button type="submit" disabled={aiInput.trim().length === 0 || aiCooldownSeconds > 0}>
                  Send
                </button>
              ) : null}
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

        <section className="room-side-chat-card room-meeting-chat-card glass-panel" aria-label="Meeting Chat card">
          <div className="room-meeting-chat">
            <p>Meeting Chat</p>
            <div className="room-meeting-chat-thread" aria-live="polite">
              {meetingChatMessages.map((message) => (
                <article
                  key={message.id}
                  className={`room-meeting-chat-message ${message.participantId === participantIdRef.current ? "own" : "other"}`}
                >
                  <strong>{message.displayName}</strong>
                  <span>{message.content}</span>
                </article>
              ))}
              <div ref={meetingChatEndRef} />
            </div>
            {meetingChatError ? <span className="room-meeting-chat-error">{meetingChatError}</span> : null}
            <form
              className="room-meeting-chat-form"
              onSubmit={(event) => {
                event.preventDefault();
                void sendMeetingChatMessage();
              }}
            >
              <input
                type="text"
                value={meetingChatInput}
                onChange={(event) => setMeetingChatInput(event.target.value)}
                placeholder="Type message..."
                aria-label="Type a meeting chat message"
              />
              <button type="submit" disabled={meetingChatSending || meetingChatInput.trim().length === 0}>
                Send
              </button>
            </form>
          </div>
        </section>
      </div>
    </main>
  );
}
