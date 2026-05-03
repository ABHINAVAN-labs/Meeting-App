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
      setError("Enter a valid meeting link or meeting code.");
      return;
    }

    if (name.trim().length < 2) {
      setError("Enter your name before joining.");
      return;
    }

    persistProfile({
      name: name.trim(),
      role
    });

    setError("");
    router.push(toMeetingPath(normalizedCode));
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
      <section className="join-card glass-panel" aria-labelledby="join-title">
        <div className="access-panel">
          <a className="brand" href="/">
            <span className="brand-mark">M</span>
            <span className="meetigate-font">Meetigate</span>
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

          <form
            className="meeting-form"
            onSubmit={(event) => {
              event.preventDefault();
              handleJoin();
            }}
          >
            <label htmlFor="user-name">{role === "teacher" ? "Teacher Name" : "Student Name"}</label>
            <input
              id="user-name"
              name="user-name"
              placeholder={role === "teacher" ? "Mr. Sharma" : "Aarav Patel"}
              type="text"
              value={name}
              onChange={(event) => setName(event.target.value)}
            />

            <label htmlFor="meeting-code">Meeting link or code</label>
            <input
              id="meeting-code"
              name="meeting-code"
              placeholder="meetigate.app/class/physics-10a"
              type="text"
              value={meetingCode}
              onChange={(event) => setMeetingCode(event.target.value)}
            />

            {error ? <p className="form-error">{error}</p> : null}

            <div className="form-actions">
              <button className="primary-action" type="submit" disabled={!meetingCode.trim()}>
                Join meeting
              </button>
              {role === "teacher" ? (
                <button className="ghost-action" type="button" onClick={handleCreateLink}>
                  Create meeting link
                </button>
              ) : null}
            </div>
          </form>
        </div>
      </section>
    </main>
  );
}
