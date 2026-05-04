"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { normalizeMeetingCode } from "../../lib/meetings/validation";

type Role = "student" | "teacher";

type Profile = {
  name: string;
  role: Role;
};

const PROFILE_STORAGE_KEY = "meeting_app_profile";

function buildGeneratedCode() {
  const timestampPart = Date.now().toString(36).slice(-5).toUpperCase();
  const randomPart = crypto.randomUUID().slice(0, 5).toUpperCase();
  return `MTG-${timestampPart}-${randomPart}`;
}

function toMeetingPath(rawCode: string) {
  return `/${encodeURIComponent(rawCode.trim())}`;
}

export default function LandingPage() {
  const router = useRouter();
  const [role, setRole] = useState<Role>("student");
  const [name, setName] = useState("");
  const [meetingCode, setMeetingCode] = useState("");
  const [error, setError] = useState("");

  function persistProfile(profile: Profile) {
    localStorage.setItem(PROFILE_STORAGE_KEY, JSON.stringify(profile));
  }

  function goToMeeting(rawCode: string) {
    const normalizedCode = normalizeMeetingCode(rawCode);
    if (!normalizedCode) {
      setError("Enter a valid code.");
      return;
    }

    if (name.trim().length < 2) {
      setError("Enter your name.");
      return;
    }

    persistProfile({
      name: name.trim(),
      role
    });

    setError("");

    if (role === "teacher") {
      void joinAsTeacher(normalizedCode);
      return;
    }

    router.push(toMeetingPath(normalizedCode));
  }

  async function joinAsTeacher(normalizedCode: string) {
    const response = await fetch("/api/meetings/join", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        meetingCode: normalizedCode,
        displayName: name.trim(),
        role: "teacher"
      })
    });

    if (!response.ok) {
      const errorPayload = (await response.json().catch(() => ({}))) as { message?: string };
      setError(errorPayload.message ?? "Could not join this meeting.");
      return;
    }

    const payload = (await response.json().catch(() => ({}))) as {
      participant?: { id?: string };
      meetingCode?: string;
    };
    const safeMeetingCode = normalizeMeetingCode(payload.meetingCode ?? normalizedCode) ?? normalizedCode;
    if (payload.participant?.id) {
      sessionStorage.setItem(`meeting_participant_session_${safeMeetingCode}`, payload.participant.id);
    }

    router.push(`${toMeetingPath(safeMeetingCode)}/room`);
  }

  function handleJoin() {
    goToMeeting(meetingCode);
  }

  function handleCreateLink() {
    const newCode = buildGeneratedCode();
    setMeetingCode(newCode);
    goToMeeting(newCode);
  }

  return (
    <main className="entry-shell landing-shell">
      <div className="landing-art-layer" aria-hidden="true" />
      <section className="join-card glass-panel" aria-label="Meeting entry">
        <div className="access-panel">
          <a className="brand" href="/">
            <span className="meetigate-font landing-brand-wordmark">Meetigate</span>
          </a>

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

          <form
            className="meeting-form"
            onSubmit={(event) => {
              event.preventDefault();
              handleJoin();
            }}
          >
            <label htmlFor="user-name">Name</label>
            <input
              id="user-name"
              name="user-name"
              placeholder={role === "teacher" ? "Teacher name" : "Student name"}
              type="text"
              value={name}
              onChange={(event) => setName(event.target.value)}
            />

            <label htmlFor="meeting-code">Code</label>
            <input
              id="meeting-code"
              name="meeting-code"
              placeholder="Code or link"
              type="text"
              value={meetingCode}
              onChange={(event) => setMeetingCode(event.target.value)}
            />

            {error ? <p className="form-error">{error}</p> : null}

            <div className={`form-actions ${role === "teacher" ? "form-actions-teacher" : ""}`}>
              <button className="primary-action" type="submit" disabled={!meetingCode.trim()}>
                Join
              </button>
              {role === "teacher" ? (
                <button className="ghost-action" type="button" onClick={handleCreateLink}>
                  New link
                </button>
              ) : null}
            </div>
          </form>
        </div>
      </section>
    </main>
  );
}

