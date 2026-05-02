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
};

const PROFILE_STORAGE_KEY = "meeting_app_profile";
const SESSION_STORAGE_PREFIX = "meeting_participant_session_";

function sessionKey(meetingCode: string) {
  return `${SESSION_STORAGE_PREFIX}${meetingCode}`;
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

  const videoRef = useRef<HTMLVideoElement | null>(null);

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
      setCameraError("Camera permission is required for ready check preview.");
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

    router.push(meetingRoomHref);
  }

  useEffect(() => {
    if (videoRef.current && stream) {
      videoRef.current.srcObject = stream;
      videoRef.current.play().catch(() => undefined);
    }
  }, [stream]);

  useEffect(() => {
    return () => {
      stream?.getTracks().forEach((track) => track.stop());
    };
  }, [stream]);

  return (
    <main className="entry-shell ready-shell">
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
              <span>{cameraError || "Turn on camera to complete your ready check."}</span>
            </div>
          )}
        </div>

        <div className="preview-controls" aria-label="Preview controls">
          <button className={cameraEnabled ? "active" : ""} type="button" onClick={toggleCamera}>
            {cameraEnabled ? "Camera on" : "Camera off"}
          </button>
          <button className={micEnabled ? "active" : ""} type="button" onClick={toggleMic}>
            {micEnabled ? "Mic on" : "Mic off"}
          </button>
        </div>

        {joinError ? <p className="form-error">{joinError}</p> : null}

        <button className="primary-action lobby-join" type="button" onClick={askToJoin} disabled={isJoining || !meetingCode}>
          {isJoining ? "Joining..." : "Ask to Join"}
        </button>
      </section>
    </main>
  );
}
