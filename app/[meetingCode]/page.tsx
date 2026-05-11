"use client";

import { useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { normalizeMeetingCode } from "../../lib/meetings/validation";

type CameraStatus = "idle" | "requesting" | "active" | "blocked";
type Role = "student" | "teacher";

type Profile = {
  name: string;
  role: Role;
};

type JoinResponse = {
  meetingCode: string;
  participant: {
    id: string;
  };
  status: "pending" | "active" | "rejected";
};

type ParticipantsResponse = {
  sessionParticipant?: {
    id: string;
    status: "pending" | "active" | "rejected";
  } | null;
};

const PROFILE_STORAGE_KEY = "meeting_app_profile";
const SESSION_STORAGE_PREFIX = "meeting_participant_session_";
const PREFS_STORAGE_PREFIX = "meeting_media_prefs_";

function sessionKey(meetingCode: string) {
  return `${SESSION_STORAGE_PREFIX}${meetingCode}`;
}

function prefsKey(meetingCode: string) {
  return `${PREFS_STORAGE_PREFIX}${meetingCode}`;
}

export default function MeetingCodePage() {
  const params = useParams<{ meetingCode: string }>();
  const router = useRouter();
  const rawMeetingCode = decodeURIComponent(params.meetingCode ?? "");
  const meetingCode = normalizeMeetingCode(rawMeetingCode) ?? "";
  const meetingRoomHref = `/${encodeURIComponent(meetingCode)}/room`;

  const [cameraStatus, setCameraStatus] = useState<CameraStatus>("idle");
  const [cameraError, setCameraError] = useState("");
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [cameraEnabled, setCameraEnabled] = useState(false);
  const [micEnabled, setMicEnabled] = useState(false);
  const [joinError, setJoinError] = useState("");
  const [isJoining, setIsJoining] = useState(false);
  const [isWaitingApproval, setIsWaitingApproval] = useState(false);
  const [profileRole, setProfileRole] = useState<Role | null>(null);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const hasAutoJoinedTeacher = useRef(false);

  useEffect(() => {
    const profileRaw = localStorage.getItem(PROFILE_STORAGE_KEY);
    if (!profileRaw) {
      return;
    }

    try {
      const profile = JSON.parse(profileRaw) as Partial<Profile>;
      if (profile.role === "student" || profile.role === "teacher") {
        setProfileRole(profile.role);
      }
    } catch {
      return;
    }
  }, []);

  async function requestPreviewStream(nextCamera = true, nextMic = true) {
    setCameraStatus("requesting");
    setCameraError("");

    try {
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: {
          facingMode: "user",
          height: { ideal: 720 },
          width: { ideal: 1280 }
        }
      });

      mediaStream.getVideoTracks().forEach((track) => {
        track.enabled = nextCamera;
      });
      mediaStream.getAudioTracks().forEach((track) => {
        track.enabled = nextMic;
      });

      setStream(mediaStream);
      setCameraEnabled(nextCamera);
      setMicEnabled(nextMic);
      setCameraStatus("active");
      return mediaStream;
    } catch {
      setCameraStatus("blocked");
      setCameraError("Camera/mic access is optional. You can still join without it.");
      return null;
    }
  }

  async function toggleCamera() {
    if (!stream) {
      await requestPreviewStream(true, micEnabled);
      return;
    }

    const nextState = !cameraEnabled;
    stream.getVideoTracks().forEach((track) => {
      track.enabled = nextState;
    });
    setCameraEnabled(nextState);
  }

  async function toggleMic() {
    if (!stream) {
      await requestPreviewStream(cameraEnabled, true);
      return;
    }

    const nextState = !micEnabled;
    stream.getAudioTracks().forEach((track) => {
      track.enabled = nextState;
    });
    setMicEnabled(nextState);
  }

  async function askToJoin() {
    if (!meetingCode) {
      setJoinError("Invalid meeting code.");
      return;
    }

    const profileRaw = localStorage.getItem(PROFILE_STORAGE_KEY);
    if (!profileRaw) {
      setJoinError("Go back and enter your name before joining.");
      return;
    }

    const profile = JSON.parse(profileRaw) as Partial<Profile>;
    if (!profile.name || !profile.role) {
      setJoinError("Profile is incomplete. Please re-enter from landing.");
      return;
    }

    setIsJoining(true);
    setJoinError("");

    const response = await fetch("/api/meetings/join", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        meetingCode,
        displayName: profile.name,
        role: profile.role
      })
    });

    if (!response.ok) {
      const errorPayload = (await response.json().catch(() => ({}))) as { message?: string };
      setJoinError(errorPayload.message ?? "Could not join this meeting.");
      setIsJoining(false);
      return;
    }

    const payload = (await response.json()) as JoinResponse;
    if (payload.participant?.id) {
      sessionStorage.setItem(sessionKey(meetingCode), payload.participant.id);
    }
    sessionStorage.setItem(
      prefsKey(meetingCode),
      JSON.stringify({
        cameraEnabled,
        micEnabled
      })
    );

    if (payload.status === "active") {
      router.push(meetingRoomHref);
      return;
    }
    if (payload.status === "rejected") {
      setJoinError("Join request was rejected by the teacher.");
      setIsJoining(false);
      return;
    }

    setIsWaitingApproval(true);
    setIsJoining(false);
  }

  useEffect(() => {
    if (!meetingCode || hasAutoJoinedTeacher.current) {
      return;
    }

    const profileRaw = localStorage.getItem(PROFILE_STORAGE_KEY);
    if (!profileRaw) {
      return;
    }

    const profile = JSON.parse(profileRaw) as Partial<Profile>;
    if (profile.role !== "teacher") {
      return;
    }

    hasAutoJoinedTeacher.current = true;
    void askToJoin();
  }, [meetingCode]);

  useEffect(() => {
    if (videoRef.current && stream) {
      videoRef.current.srcObject = stream;
      videoRef.current.play().catch(() => undefined);
    }
  }, [stream]);

  useEffect(() => {
    if (!meetingCode) {
      return;
    }

    const bootstrapJoinState = async () => {
      const participantId = sessionStorage.getItem(sessionKey(meetingCode)) ?? "";
      if (!participantId) {
        return;
      }

      const response = await fetch(`/api/meetings/${encodeURIComponent(meetingCode)}/participants`, {
        method: "GET",
        headers: { "x-participant-id": participantId }
      }).catch(() => null);
      if (!response || !response.ok) {
        return;
      }

      const payload = (await response.json()) as ParticipantsResponse;
      const status = payload.sessionParticipant?.status;
      if (status === "active") {
        router.push(meetingRoomHref);
        return;
      }
      if (status === "pending") {
        setIsWaitingApproval(true);
        setJoinError("");
        return;
      }
      if (status === "rejected") {
        setIsWaitingApproval(false);
        setJoinError("Join request was rejected by the teacher.");
      }
    };

    void bootstrapJoinState();
  }, [meetingCode, meetingRoomHref, router]);

  useEffect(() => {
    if (!isWaitingApproval || !meetingCode) {
      return;
    }

    const interval = window.setInterval(async () => {
      const participantId = sessionStorage.getItem(sessionKey(meetingCode)) ?? "";
      const response = await fetch(`/api/meetings/${encodeURIComponent(meetingCode)}/participants`, {
        method: "GET",
        headers: participantId ? { "x-participant-id": participantId } : undefined
      }).catch(() => null);
      if (!response || !response.ok) {
        return;
      }

      const payload = (await response.json()) as ParticipantsResponse;
      const status = payload.sessionParticipant?.status;
      if (status === "active") {
        router.push(meetingRoomHref);
        return;
      }
      if (status === "rejected") {
        setIsWaitingApproval(false);
        setJoinError("Join request was rejected by the teacher.");
      }
    }, 2000);

    return () => {
      window.clearInterval(interval);
    };
  }, [isWaitingApproval, meetingCode, meetingRoomHref, router]);

  useEffect(() => {
    return () => {
      stream?.getTracks().forEach((track) => track.stop());
    };
  }, [stream]);

  return (
    <main className={`entry-shell ready-shell${profileRole === "student" ? " student-waiting-shell" : ""}`}>
      <section className="preview-card glass-panel" aria-label="Video preview before joining">
        <div className="preview-header">
          <div>
            <p className="eyebrow">Meeting code</p>
            <h2>{meetingCode || rawMeetingCode}</h2>
          </div>
          <span className={`capture-status ${cameraStatus}`}>
            {cameraStatus === "active" ? "Preview" : cameraStatus === "requesting" ? "Opening" : "Idle"}
          </span>
        </div>

        <div className="video-shell preview-video">
          {stream ? (
            <>
              <video ref={videoRef} autoPlay muted playsInline />
              {!cameraEnabled ? (
                <div className="camera-off-layer">
                  <strong>Camera off</strong>
                  <span>Your video is paused before joining.</span>
                </div>
              ) : null}
            </>
          ) : (
            <div className="video-placeholder">
              <strong>Camera preview</strong>
              <span>{cameraError || "Optional: turn on camera/mic before joining."}</span>
            </div>
          )}
        </div>

        <div className="preview-controls" aria-label="Preview controls">
          <button
            aria-label={cameraEnabled ? "Camera on" : "Camera off"}
            className={`preview-icon-button camera-icon-button ${cameraEnabled ? "camera-on" : "camera-off"}`}
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
            className={`preview-icon-button mic-icon-button ${micEnabled ? "mic-on" : "mic-off"}`}
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
        </div>

        {joinError ? <p className="form-error">{joinError}</p> : null}
        {isWaitingApproval ? <p>Waiting for teacher approval...</p> : null}

        <button
          className="primary-action lobby-join"
          type="button"
          onClick={askToJoin}
          disabled={isJoining || !meetingCode || isWaitingApproval}
        >
          {isJoining ? "Joining..." : isWaitingApproval ? "Request Sent" : "Ask to Join"}
        </button>
      </section>
    </main>
  );
}
