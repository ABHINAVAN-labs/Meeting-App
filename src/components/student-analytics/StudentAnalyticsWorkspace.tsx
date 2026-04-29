"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";

import type { UserProfileRecord } from "@/lib/profile";
import {
  createDailyActivity,
  createStudentEvent,
  getStudentCard,
  type DailyActivityRole,
  type DailyActivityType,
  type StudentCardPayload,
  type StudentEventType,
} from "@/lib/studentAnalyticsApi";

type StudentAnalyticsWorkspaceProps = {
  profile: UserProfileRecord;
};

const defaultQuestionPayload = {
  topic: "",
  text: "",
  complexityScore: "0.6",
  isConceptual: true,
  followUpDepth: "1",
};

export default function StudentAnalyticsWorkspace({
  profile,
}: StudentAnalyticsWorkspaceProps) {
  const [card, setCard] = useState<StudentCardPayload | null>(null);
  const [cardLoading, setCardLoading] = useState(true);
  const [cardError, setCardError] = useState<string | null>(null);

  const [eventType, setEventType] = useState<StudentEventType>("question_asked");
  const [qualityScore, setQualityScore] = useState("0.8");
  const [eventPayload, setEventPayload] = useState(defaultQuestionPayload);
  const [eventStatus, setEventStatus] = useState<string | null>(null);
  const [eventError, setEventError] = useState<string | null>(null);
  const [eventSaving, setEventSaving] = useState(false);

  const [activityType, setActivityType] = useState<DailyActivityType>("academic");
  const [activityRole, setActivityRole] = useState<DailyActivityRole>("participant");
  const [activityName, setActivityName] = useState("");
  const [activityDescription, setActivityDescription] = useState("");
  const [durationMinutes, setDurationMinutes] = useState("45");
  const [moodScore, setMoodScore] = useState("4");
  const [activityStatus, setActivityStatus] = useState<string | null>(null);
  const [activityError, setActivityError] = useState<string | null>(null);
  const [activitySaving, setActivitySaving] = useState(false);

  const refreshCard = useCallback(async () => {
    setCardLoading(true);
    setCardError(null);

    try {
      const nextCard = await getStudentCard(profile.id);
      setCard(nextCard);
    } catch (error) {
      setCardError(error instanceof Error ? error.message : "Failed to load student card");
    } finally {
      setCardLoading(false);
    }
  }, [profile.id]);

  useEffect(() => {
    void refreshCard();
  }, [refreshCard]);

  const handleEventSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setEventSaving(true);
    setEventStatus(null);
    setEventError(null);

    try {
      const payload =
        eventType === "question_asked"
          ? {
              topic: eventPayload.topic.trim() || null,
              text: eventPayload.text.trim(),
              complexity_score: Number(eventPayload.complexityScore),
              is_conceptual: eventPayload.isConceptual,
              follow_up_depth: Number(eventPayload.followUpDepth),
            }
          : {
              detail: eventPayload.text.trim(),
              topic: eventPayload.topic.trim() || null,
            };

      await createStudentEvent({
        studentId: profile.id,
        eventType,
        eventData: payload,
        qualityScore: qualityScore ? Number(qualityScore) : null,
      });

      setEventStatus("Student event logged successfully.");
      setEventPayload(defaultQuestionPayload);
      await refreshCard();
    } catch (error) {
      setEventError(error instanceof Error ? error.message : "Failed to save event");
    } finally {
      setEventSaving(false);
    }
  };

  const handleActivitySubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setActivitySaving(true);
    setActivityStatus(null);
    setActivityError(null);

    try {
      await createDailyActivity({
        studentId: profile.id,
        activityType,
        activityName: activityName.trim(),
        role: activityRole,
        description: activityDescription.trim() || null,
        durationMinutes: durationMinutes ? Number(durationMinutes) : null,
        moodScore: moodScore ? Number(moodScore) : null,
        derivedTraits: {},
      });

      setActivityStatus("Daily activity logged successfully.");
      setActivityName("");
      setActivityDescription("");
      await refreshCard();
    } catch (error) {
      setActivityError(error instanceof Error ? error.message : "Failed to save activity");
    } finally {
      setActivitySaving(false);
    }
  };

  return (
    <div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
      <div className="space-y-6">
        <section className="rounded-2xl border border-zinc-800 bg-zinc-900 p-6">
          <div className="mb-5">
            <p className="text-sm uppercase tracking-[0.3em] text-zinc-500">
              Event Logging
            </p>
            <h2 className="mt-2 text-2xl font-semibold">Capture student learning signals</h2>
          </div>

          <form onSubmit={handleEventSubmit} className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <label className="mb-2 block text-sm text-zinc-400">Event type</label>
                <select
                  value={eventType}
                  onChange={(e) => setEventType(e.target.value as StudentEventType)}
                  className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-cyan-500"
                >
                  <option value="question_asked">Question asked</option>
                  <option value="interaction">Interaction</option>
                  <option value="doubt_submitted">Doubt submitted</option>
                  <option value="experiment_entry">Experiment entry</option>
                  <option value="career_query">Career query</option>
                  <option value="activity_logged">Activity logged</option>
                </select>
              </div>

              <div>
                <label className="mb-2 block text-sm text-zinc-400">Quality score</label>
                <input
                  type="number"
                  min="0"
                  max="1"
                  step="0.1"
                  value={qualityScore}
                  onChange={(e) => setQualityScore(e.target.value)}
                  className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-cyan-500"
                />
              </div>

              <div>
                <label className="mb-2 block text-sm text-zinc-400">Topic</label>
                <input
                  type="text"
                  value={eventPayload.topic}
                  onChange={(e) =>
                    setEventPayload((current) => ({ ...current, topic: e.target.value }))
                  }
                  placeholder="Laws of Motion"
                  className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-4 py-3 text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-cyan-500"
                />
              </div>

              <div>
                <label className="mb-2 block text-sm text-zinc-400">Complexity score</label>
                <input
                  type="number"
                  min="0"
                  max="1"
                  step="0.1"
                  value={eventPayload.complexityScore}
                  onChange={(e) =>
                    setEventPayload((current) => ({
                      ...current,
                      complexityScore: e.target.value,
                    }))
                  }
                  className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-cyan-500"
                />
              </div>
            </div>

            <div>
              <label className="mb-2 block text-sm text-zinc-400">Event detail</label>
              <textarea
                value={eventPayload.text}
                onChange={(e) =>
                  setEventPayload((current) => ({ ...current, text: e.target.value }))
                }
                placeholder="Student asked why acceleration stays constant when force is unchanged."
                rows={4}
                className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-4 py-3 text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-cyan-500"
              />
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <label className="flex items-center gap-3 rounded-lg border border-zinc-800 bg-zinc-950 px-4 py-3 text-sm text-zinc-300">
                <input
                  type="checkbox"
                  checked={eventPayload.isConceptual}
                  onChange={(e) =>
                    setEventPayload((current) => ({
                      ...current,
                      isConceptual: e.target.checked,
                    }))
                  }
                />
                Mark as conceptual
              </label>

              <div>
                <label className="mb-2 block text-sm text-zinc-400">Follow-up depth</label>
                <input
                  type="number"
                  min="0"
                  step="1"
                  value={eventPayload.followUpDepth}
                  onChange={(e) =>
                    setEventPayload((current) => ({
                      ...current,
                      followUpDepth: e.target.value,
                    }))
                  }
                  className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-cyan-500"
                />
              </div>
            </div>

            {eventError ? <p className="text-sm text-red-300">{eventError}</p> : null}
            {eventStatus ? <p className="text-sm text-emerald-300">{eventStatus}</p> : null}

            <button
              type="submit"
              disabled={eventSaving}
              className="rounded-lg bg-cyan-600 px-5 py-3 font-medium text-white transition hover:bg-cyan-500 disabled:cursor-not-allowed disabled:bg-cyan-800"
            >
              {eventSaving ? "Logging event..." : "Log student event"}
            </button>
          </form>
        </section>

        <section className="rounded-2xl border border-zinc-800 bg-zinc-900 p-6">
          <div className="mb-5">
            <p className="text-sm uppercase tracking-[0.3em] text-zinc-500">
              Daily Activities
            </p>
            <h2 className="mt-2 text-2xl font-semibold">Capture interests and leadership signals</h2>
          </div>

          <form onSubmit={handleActivitySubmit} className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <label className="mb-2 block text-sm text-zinc-400">Activity type</label>
                <select
                  value={activityType}
                  onChange={(e) => setActivityType(e.target.value as DailyActivityType)}
                  className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                >
                  <option value="academic">Academic</option>
                  <option value="sport">Sport</option>
                  <option value="art">Art</option>
                  <option value="tech">Tech</option>
                  <option value="social">Social</option>
                  <option value="civic">Civic</option>
                </select>
              </div>

              <div>
                <label className="mb-2 block text-sm text-zinc-400">Role</label>
                <select
                  value={activityRole}
                  onChange={(e) => setActivityRole(e.target.value as DailyActivityRole)}
                  className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                >
                  <option value="participant">Participant</option>
                  <option value="leader">Leader</option>
                  <option value="co-leader">Co-leader</option>
                  <option value="organizer">Organizer</option>
                  <option value="coach">Coach</option>
                  <option value="audience">Audience</option>
                </select>
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <label className="mb-2 block text-sm text-zinc-400">Activity name</label>
                <input
                  type="text"
                  value={activityName}
                  onChange={(e) => setActivityName(e.target.value)}
                  placeholder="Science Club"
                  required
                  className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-4 py-3 text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <div>
                <label className="mb-2 block text-sm text-zinc-400">Duration in minutes</label>
                <input
                  type="number"
                  min="0"
                  step="5"
                  value={durationMinutes}
                  onChange={(e) => setDurationMinutes(e.target.value)}
                  className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <label className="mb-2 block text-sm text-zinc-400">Mood score</label>
                <input
                  type="number"
                  min="1"
                  max="5"
                  step="0.5"
                  value={moodScore}
                  onChange={(e) => setMoodScore(e.target.value)}
                  className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>
            </div>

            <div>
              <label className="mb-2 block text-sm text-zinc-400">Description</label>
              <textarea
                value={activityDescription}
                onChange={(e) => setActivityDescription(e.target.value)}
                placeholder="Led a team demo and shared two new experiment ideas."
                rows={4}
                className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-4 py-3 text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>

            {activityError ? <p className="text-sm text-red-300">{activityError}</p> : null}
            {activityStatus ? <p className="text-sm text-emerald-300">{activityStatus}</p> : null}

            <button
              type="submit"
              disabled={activitySaving}
              className="rounded-lg bg-emerald-600 px-5 py-3 font-medium text-white transition hover:bg-emerald-500 disabled:cursor-not-allowed disabled:bg-emerald-800"
            >
              {activitySaving ? "Logging activity..." : "Log daily activity"}
            </button>
          </form>
        </section>
      </div>

      <aside className="space-y-6">
        <section className="rounded-2xl border border-zinc-800 bg-zinc-900 p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm uppercase tracking-[0.3em] text-zinc-500">
                Card Preview
              </p>
              <h2 className="mt-2 text-2xl font-semibold">Current backend read model</h2>
            </div>
            <button
              type="button"
              onClick={() => void refreshCard()}
              className="rounded-lg border border-zinc-700 px-3 py-2 text-sm text-zinc-300 transition hover:border-zinc-600 hover:bg-zinc-800 hover:text-white"
            >
              Refresh
            </button>
          </div>

          {cardLoading ? <p className="mt-4 text-sm text-zinc-400">Loading card...</p> : null}
          {cardError ? <p className="mt-4 text-sm text-red-300">{cardError}</p> : null}

          {!cardLoading && !cardError ? (
            <div className="mt-5 space-y-4">
              <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-4">
                <p className="text-sm text-zinc-500">Profile</p>
                <h3 className="mt-2 text-xl font-semibold">
                  {card?.profile.displayName ?? card?.profile.email}
                </h3>
                <p className="mt-1 text-sm text-zinc-400">
                  {[
                    card?.profile.grade,
                    card?.profile.section,
                    card?.profile.academicFocus,
                  ]
                    .filter(Boolean)
                    .join(" · ") || "Profile metadata not complete yet"}
                </p>
                {card?.profile.headline ? (
                  <p className="mt-3 text-sm text-zinc-300">{card.profile.headline}</p>
                ) : null}
              </div>

              <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-4">
                <p className="text-sm text-zinc-500">Recent activity badges</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {card?.recentActivityBadges.length ? (
                    card.recentActivityBadges.map((badge) => (
                      <span
                        key={badge}
                        className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-sm text-emerald-200"
                      >
                        {badge}
                      </span>
                    ))
                  ) : (
                    <span className="text-sm text-zinc-400">No activity badges yet.</span>
                  )}
                </div>
              </div>

              <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-4">
                <p className="text-sm text-zinc-500">Snapshot payload</p>
                <pre className="mt-3 overflow-x-auto whitespace-pre-wrap text-xs text-zinc-300">
                  {JSON.stringify(card?.snapshot, null, 2) || "null"}
                </pre>
              </div>
            </div>
          ) : null}
        </section>
      </aside>
    </div>
  );
}
