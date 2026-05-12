/**
 * Quality tuning profiles for classroom-scale meetings.
 *
 * Each profile defines publish defaults for teacher and student roles.
 * Profiles can be switched dynamically based on room size or teacher preference.
 */

import type { RoomOptions } from "livekit-client";

export type QualityProfileName = "lecture" | "seminar" | "large-class";

export type RolePublishConfig = {
  videoCodec: "vp8" | "h264" | "vp9" | "av1";
  maxBitrate: number;       // bits per second
  maxFramerate: number;
  resolution: { width: number; height: number };
  red: boolean;             // redundant audio data (low latency audio recovery)
  dtx: boolean;             // discontinuous transmission (save bandwidth on silence)
  videoFec?: boolean;       // forward error correction (avoid retransmission delay)
  simulcast?: boolean;
};

export type QualityProfile = {
  name: QualityProfileName;
  label: string;
  teacher: RolePublishConfig;
  student: RolePublishConfig;
  /** Jitter buffer target in ms for students receiving teacher's stream */
  studentReceiveJitterMs: number;
  /** Jitter buffer target in ms for teacher receiving students' streams */
  teacherReceiveJitterMs: number;
};

export const QUALITY_PROFILES: Record<QualityProfileName, QualityProfile> = {
  "lecture": {
    name: "lecture",
    label: "Lecture",
    /** Teacher is the main presenter — high quality, low latency */
    teacher: {
      videoCodec: "h264",
      maxBitrate: 1_200_000,   // 1.2 Mbps — sharp enough for screen + face
      maxFramerate: 30,
      resolution: { width: 1280, height: 720 },
      red: true,
      dtx: true,
      videoFec: true,           // FEC avoids retransmission delay for students
    },
    /** Students just need to be visible to the teacher — efficient */
    student: {
      videoCodec: "vp8",
      maxBitrate: 200_000,      // 200 Kbps — fine for teacher to see face
      maxFramerate: 10,
      resolution: { width: 640, height: 480 },
      red: true,
      dtx: true,
    },
    studentReceiveJitterMs: 40,   // Near-instant for students receiving teacher
    teacherReceiveJitterMs: 100,  // Standard for teacher receiving many students
  },

  "seminar": {
    name: "seminar",
    label: "Seminar",
    /** Everyone may present — balanced quality */
    teacher: {
      videoCodec: "h264",
      maxBitrate: 1_000_000,
      maxFramerate: 24,
      resolution: { width: 1280, height: 720 },
      red: true,
      dtx: true,
    },
    student: {
      videoCodec: "vp8",
      maxBitrate: 400_000,
      maxFramerate: 15,
      resolution: { width: 640, height: 480 },
      red: true,
      dtx: true,
    },
    studentReceiveJitterMs: 60,
    teacherReceiveJitterMs: 80,
  },

  "large-class": {
    name: "large-class",
    label: "Large Class",
    /** Teacher is the only source of video that matters */
    teacher: {
      videoCodec: "h264",
      maxBitrate: 800_000,      // Lower to not saturate limited bandwidth
      maxFramerate: 24,
      resolution: { width: 854, height: 480 },
      red: true,
      dtx: true,
      videoFec: true,
    },
    /** Students publish very low quality to minimize server load */
    student: {
      videoCodec: "vp8",
      maxBitrate: 100_000,      // 100 Kbps — thumbnail quality
      maxFramerate: 5,
      resolution: { width: 320, height: 240 },
      red: true,
      dtx: true,
    },
    studentReceiveJitterMs: 40,
    teacherReceiveJitterMs: 120,
  },
};

/**
 * Build LiveKit RoomOptions from a quality profile and role.
 */
export function buildRoomOptions(
  profile: QualityProfile,
  role: "teacher" | "student"
): Partial<RoomOptions> {
  const config = role === "teacher" ? profile.teacher : profile.student;

  return {
    publishDefaults: {
      videoCodec: config.videoCodec,
      videoEncoding: {
        maxBitrate: config.maxBitrate,
        maxFramerate: config.maxFramerate,
      },
      red: config.red,
      dtx: config.dtx,
      simulcast: config.simulcast ?? false,
    },
    videoCaptureDefaults: {
      resolution: config.resolution,
    },
  };
}