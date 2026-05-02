"use client";

import { useEffect, useRef, useState } from "react";

type Role = "student" | "teacher";
type CameraStatus = "idle" | "requesting" | "active" | "blocked";

export default function Home() {
  const [role, setRole] = useState<Role>("student");
  const [meetingCode, setMeetingCode] = useState("");
  const [copied, setCopied] = useState(false);
  const [hasJoined, setHasJoined] = useState(false);
  const [cameraStatus, setCameraStatus] = useState<CameraStatus>("idle");
  const [cameraError, setCameraError] = useState("");
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [cameraEnabled, setCameraEnabled] = useState(false);
  const [micEnabled, setMicEnabled] = useState(false);
  const [lastFrameAt, setLastFrameAt] = useState("");
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const isTeacher = role === "teacher";

  function createMeetingCode() {
    const timestampPart = Date.now().toString(36).slice(-5).toUpperCase();
    const randomPart = crypto.randomUUID().slice(0, 5).toUpperCase();
    setMeetingCode(`MTG-${timestampPart}-${randomPart}`);
    setCopied(false);
  }

  async function copyMeetingCode() {
    if (!meetingCode) {
      return;
    }

    await navigator.clipboard.writeText(meetingCode);
    setCopied(true);
  }

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
      setCameraError("Camera permission is required to join with video.");
      return null;
    }
  }

  async function joinMeeting() {
    setHasJoined(true);

    if (!stream) {
      await requestPreviewStream(true, true);
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

  useEffect(() => {
    if (videoRef.current && stream) {
      videoRef.current.srcObject = stream;
      videoRef.current.play().catch(() => undefined);
    }
  }, [cameraEnabled, hasJoined, stream]);

  useEffect(() => {
    if (!stream || cameraStatus !== "active") {
      return;
    }

    const frameTimer = window.setInterval(() => {
      const video = videoRef.current;
      const canvas = canvasRef.current;

      if (!video || !canvas || video.readyState < 2) {
        return;
      }

      canvas.width = video.videoWidth || 640;
      canvas.height = video.videoHeight || 360;
      canvas.getContext("2d")?.drawImage(video, 0, 0, canvas.width, canvas.height);
      setLastFrameAt(new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }));
    }, 1500);

    return () => window.clearInterval(frameTimer);
  }, [cameraStatus, stream]);

  useEffect(() => {
    return () => {
      stream?.getTracks().forEach((track) => track.stop());
    };
  }, [stream]);

  return (
    <main
      className={`entry-shell ${hasJoined ? "with-capture" : ""} ${
        hasJoined ? "ai-mode" : ""
      }`}
    >
      <section
        className={`join-card glass-panel ${hasJoined ? "ai-card" : ""}`}
        aria-labelledby="join-title"
      >
        <div className="access-panel">
          <a className="brand" href="/">
            <span className="brand-mark">M</span>
            <span>Meetigate</span>
          </a>

          <div className="join-copy">
            <p className="eyebrow">Classroom access</p>
            <h1 id="join-title">Meeting access</h1>
          </div>

          <div className="role-switch" aria-label="Choose account type">
            <button
              className={role === "student" ? "active" : ""}
              type="button"
              onClick={() => setRole("student")}
            >
              Student
            </button>
            <button
              className={role === "teacher" ? "active" : ""}
              type="button"
              onClick={() => setRole("teacher")}
            >
              Teacher
            </button>
          </div>

          <form className="meeting-form">
            <label htmlFor="user-id">{isTeacher ? "Teacher ID" : "Student ID"}</label>
            <input
              id="user-id"
              name="user-id"
              placeholder={isTeacher ? "TEA-2048" : "STU-1042"}
              type="text"
            />

            <label htmlFor="meeting-code">Meeting link or code</label>
            <input
              id="meeting-code"
              name="meeting-code"
              placeholder="meetigate.app/class/physics-10a"
              type="text"
            />

            <div className="form-actions">
              <button className="primary-action" type="button" onClick={joinMeeting}>
                {cameraStatus === "requesting" ? "Opening camera" : "Join meeting"}
              </button>
              {isTeacher ? (
                <button className="ghost-action" type="button" onClick={createMeetingCode}>
                  Create meeting link
                </button>
              ) : null}
            </div>
          </form>

          {isTeacher && meetingCode ? (
            <div className="generated-code" aria-live="polite">
              <span>{meetingCode}</span>
              <button type="button" onClick={copyMeetingCode}>
                {copied ? "Copied" : "Copy"}
              </button>
            </div>
          ) : null}
        </div>

        <div className="ai-chat-panel" aria-label={isTeacher ? "Teacher AI chat" : "Student AI chat"}>
          <div>
            <p className="eyebrow">{isTeacher ? "Teacher AI" : "Student AI"}</p>
            <h2>{isTeacher ? "Class assistant" : "Ask privately"}</h2>
          </div>
          <div className="chat-stream">
            {isTeacher ? (
              <>
                <div className="assistant-bubble">I can summarize anonymous doubts and suggest what to explain next.</div>
                <div className="student-bubble">Show the most repeated question.</div>
                <div className="assistant-bubble">Students are asking why current direction changes in the coil.</div>
              </>
            ) : (
              <>
                <div className="assistant-bubble">I can help with doubts during class without interrupting the lecture.</div>
                <div className="student-bubble">Explain the last whiteboard step.</div>
                <div className="assistant-bubble">Sure. The force changes because the current and magnetic field angle affects the sine term.</div>
              </>
            )}
          </div>
          <div className="chat-input-row">
            <input placeholder="Ask Meetigate AI" type="text" />
            <button type="button">Send</button>
          </div>
        </div>
      </section>

      {!hasJoined ? (
        <section className="preview-card glass-panel" aria-label="Video preview before joining">
          <div className="preview-header">
            <div>
              <p className="eyebrow">Video preview</p>
              <h2>Ready check</h2>
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
                <span>{cameraError || "Turn on camera to check your appearance before joining."}</span>
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
        </section>
      ) : null}

      {hasJoined ? (
        <section className="capture-card glass-panel" aria-label="Computer vision video capture">
          <div className="capture-header">
            <div>
              <p className="eyebrow">Computer vision</p>
              <h2>{isTeacher ? "Teacher video capture" : "Student video capture"}</h2>
            </div>
            <span className={`capture-status ${cameraStatus}`}>
              {cameraStatus === "active" ? "Active" : cameraStatus === "requesting" ? "Opening" : "Blocked"}
            </span>
          </div>

          <div className="video-shell">
            {cameraStatus === "active" ? (
              <video ref={videoRef} autoPlay muted playsInline />
            ) : (
              <div className="video-placeholder">
                <strong>{cameraStatus === "requesting" ? "Requesting camera access" : "Camera unavailable"}</strong>
                <span>{cameraError || "Allow camera permission to start video capture."}</span>
              </div>
            )}
            <canvas ref={canvasRef} aria-hidden="true" />
          </div>

          <div className="vision-grid">
            <div>
              <span>Role</span>
              <strong>{isTeacher ? "Teacher" : "Student"}</strong>
            </div>
            <div>
              <span>Audio</span>
              <strong>{micEnabled ? "Enabled" : "Muted"}</strong>
            </div>
            <div>
              <span>Frame capture</span>
              <strong>{lastFrameAt || "Starting"}</strong>
            </div>
          </div>
        </section>
      ) : null}
    </main>
  );
}
