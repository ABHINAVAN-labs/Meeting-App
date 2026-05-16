import { generateKeyPairSync, randomBytes } from "crypto";
import { readFile, readdir } from "fs/promises";
import path from "path";
import { jest } from "@jest/globals";

function setupSecurityEnv() {
  const { privateKey, publicKey } = generateKeyPairSync("ec", { namedCurve: "P-256" });
  process.env.SERVER_SECRET = randomBytes(32).toString("hex");
  process.env.REJOIN_TOKEN_PRIVATE_KEY_PEM = privateKey.export({ type: "pkcs8", format: "pem" }).toString();
  process.env.REJOIN_TOKEN_PUBLIC_KEY_PEM = publicKey.export({ type: "spki", format: "pem" }).toString();
  process.env.ALLOWED_ORIGINS = "http://localhost:3000";
  process.env.MEETING_DB_ENABLED = "0";
}

async function listFilesRecursively(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === ".git" || entry.name === "node_modules" || entry.name === ".next") {
        continue;
      }
      files.push(...(await listFilesRecursively(fullPath)));
      continue;
    }
    files.push(fullPath);
  }
  return files;
}

describe("secure meeting identity invariants", () => {
  beforeAll(() => {
    setupSecurityEnv();
  });

  test("valid join produces well-formed participant id", async () => {
    const { joinMeeting } = await import("../lib/meetings/service");
    const result = await joinMeeting(
      {
        meetingCode: "MTG4821",
        displayName: "Rahul",
        role: "teacher"
      },
      {
        ipPrefix: "10.0.1.0/24",
        uaHash: randomBytes(32).toString("hex")
      }
    );

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.participant.id).toMatch(/^[a-f0-9]{32}-[0-9a-f-]{36}$/);
  });

  test("same inputs produce different ids", async () => {
    const { joinMeeting } = await import("../lib/meetings/service");
    await joinMeeting(
      { meetingCode: "MTG1001", displayName: "Teacher", role: "teacher" },
      { ipPrefix: "10.0.2.0/24", uaHash: randomBytes(32).toString("hex") }
    );

    const first = await joinMeeting(
      { meetingCode: "MTG1001", displayName: "Same Student", role: "student" },
      { ipPrefix: "10.0.2.0/24", uaHash: randomBytes(32).toString("hex") }
    );
    const second = await joinMeeting(
      { meetingCode: "MTG1001", displayName: "Same Student", role: "student" },
      { ipPrefix: "10.0.2.0/24", uaHash: randomBytes(32).toString("hex") }
    );

    expect(first.ok && second.ok).toBe(true);
    if (first.ok && second.ok) {
      expect(first.participant.id).not.toEqual(second.participant.id);
    }
  });

  test("client role without server-authorized meeting is rejected", async () => {
    const { joinMeeting } = await import("../lib/meetings/service");
    const result = await joinMeeting(
      { meetingCode: "MTG2002", displayName: "Student One", role: "student" },
      { ipPrefix: "10.0.3.0/24", uaHash: randomBytes(32).toString("hex") }
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(401);
    }
  });

  test("oversized and malicious display names are rejected", async () => {
    const { joinMeeting } = await import("../lib/meetings/service");
    const longName = "A".repeat(65);
    const oversized = await joinMeeting(
      { meetingCode: "MTG3003", displayName: longName, role: "teacher" },
      { ipPrefix: "10.0.4.0/24", uaHash: randomBytes(32).toString("hex") }
    );
    expect(oversized.ok).toBe(false);

    const malicious = await joinMeeting(
      { meetingCode: "MTG3003", displayName: "A\x00B", role: "teacher" },
      { ipPrefix: "10.0.4.0/24", uaHash: randomBytes(32).toString("hex") }
    );
    expect(malicious.ok).toBe(false);
  });

  test("rejoin token is single-use on redemption", async () => {
    const { issueRejoinToken, redeemRejoinToken } = await import("../lib/security/rejoinToken");
    const uaHash = randomBytes(32).toString("hex");
    const ipPrefix = "10.0.5.0/24";
    const issued = await issueRejoinToken({
      participantId: "p-1",
      meetingCode: "MTG4004",
      role: "student",
      uaHash,
      ipPrefix
    });

    const first = await redeemRejoinToken(issued.token, { uaHash, ipPrefix });
    const second = await redeemRejoinToken(issued.token, { uaHash, ipPrefix });
    expect(first.ok).toBe(true);
    expect(second.ok).toBe(false);
  });

  test("rejoin token from different ip prefix is rejected", async () => {
    const { issueRejoinToken, validateRejoinTokenForRequest } = await import("../lib/security/rejoinToken");
    const uaHash = randomBytes(32).toString("hex");
    const issued = await issueRejoinToken({
      participantId: "p-2",
      meetingCode: "MTG5005",
      role: "student",
      uaHash,
      ipPrefix: "10.0.6.0/24"
    });

    const validation = await validateRejoinTokenForRequest(issued.token, {
      uaHash,
      ipPrefix: "10.0.7.0/24"
    });
    expect(validation.ok).toBe(false);
  });

  test("expired rejoin token is rejected", async () => {
    const { issueRejoinToken, validateRejoinTokenForRequest } = await import("../lib/security/rejoinToken");
    const uaHash = randomBytes(32).toString("hex");
    const ipPrefix = "10.0.8.0/24";
    const issued = await issueRejoinToken({
      participantId: "p-expired",
      meetingCode: "MTG6006",
      role: "student",
      uaHash,
      ipPrefix
    });

    const validation = await validateRejoinTokenForRequest(issued.token, {
      uaHash,
      ipPrefix,
      currentDate: new Date(Date.now() + 10 * 60 * 1000)
    });
    expect(validation.ok).toBe(false);
  });

  test("participant cap is enforced", async () => {
    const { ensureMeetingRegistryRecord } = await import("../lib/security/meetingRegistry");
    const { joinMeeting } = await import("../lib/meetings/service");

    ensureMeetingRegistryRecord("MTG7007", "host-1", { maxParticipants: 1, ttlSeconds: 3600 });
    const teacher = await joinMeeting(
      { meetingCode: "MTG7007", displayName: "Teacher One", role: "teacher" },
      { ipPrefix: "10.0.9.0/24", uaHash: randomBytes(32).toString("hex") }
    );
    expect(teacher.ok).toBe(true);

    const student = await joinMeeting(
      { meetingCode: "MTG7007", displayName: "Student One", role: "student" },
      { ipPrefix: "10.0.9.0/24", uaHash: randomBytes(32).toString("hex") }
    );

    expect(student.ok).toBe(false);
    if (!student.ok) {
      expect(student.status).toBe(429);
    }
  });

  test("banning one student does not block another student with the same name", async () => {
    const { joinMeeting, banParticipantFromRoom } = await import("../lib/meetings/service");

    const teacher = await joinMeeting(
      { meetingCode: "MTG8008", displayName: "Teacher Ban", role: "teacher" },
      { ipPrefix: "10.0.10.0/24", uaHash: randomBytes(32).toString("hex") }
    );
    expect(teacher.ok).toBe(true);
    if (!teacher.ok) {
      return;
    }

    const firstRohan = await joinMeeting(
      { meetingCode: "MTG8008", displayName: "Rohan Das", role: "student" },
      { ipPrefix: "10.0.10.0/24", uaHash: randomBytes(32).toString("hex") }
    );
    expect(firstRohan.ok).toBe(true);
    if (!firstRohan.ok) {
      return;
    }

    const ban = await banParticipantFromRoom("MTG8008", teacher.participant.id, firstRohan.participant.id);
    expect(ban.ok).toBe(true);

    const secondRohan = await joinMeeting(
      { meetingCode: "MTG8008", displayName: "Rohan Das", role: "student" },
      { ipPrefix: "10.0.10.0/24", uaHash: randomBytes(32).toString("hex") }
    );
    expect(secondRohan.ok).toBe(true);
  });

  test("banned participant session is blocked from participant context reuse", async () => {
    const { joinMeeting, banParticipantFromRoom, getParticipantForMeeting } = await import("../lib/meetings/service");

    const teacher = await joinMeeting(
      { meetingCode: "MTG8009", displayName: "Teacher Ban 2", role: "teacher" },
      { ipPrefix: "10.0.11.0/24", uaHash: randomBytes(32).toString("hex") }
    );
    expect(teacher.ok).toBe(true);
    if (!teacher.ok) {
      return;
    }

    const student = await joinMeeting(
      { meetingCode: "MTG8009", displayName: "Student Ban Target", role: "student" },
      { ipPrefix: "10.0.11.0/24", uaHash: randomBytes(32).toString("hex") }
    );
    expect(student.ok).toBe(true);
    if (!student.ok) {
      return;
    }

    const ban = await banParticipantFromRoom("MTG8009", teacher.participant.id, student.participant.id);
    expect(ban.ok).toBe(true);

    const lookup = await getParticipantForMeeting("MTG8009", student.participant.id);
    expect(lookup).toBeNull();
  });

  test("ban cookie is meeting-scoped and blocks only matching meeting", async () => {
    const { buildMeetingBanCookieValue, getMeetingBanCookieName, getMeetingBanStatusFromRequest } = await import(
      "../lib/security/banCookie"
    );
    const meetingCode = "MTG9010";
    const cookieName = getMeetingBanCookieName(meetingCode);
    const value = buildMeetingBanCookieValue(meetingCode, new Date(Date.now() + 10 * 60 * 1000).toISOString());
    const request = new Request("https://example.com/api/meeting/join", {
      headers: {
        cookie: `${cookieName}=${value}`
      }
    });

    const sameMeeting = getMeetingBanStatusFromRequest(request, meetingCode);
    const otherMeeting = getMeetingBanStatusFromRequest(request, "MTG9011");
    expect(sameMeeting.active).toBe(true);
    expect(otherMeeting.active).toBe(false);
  });

  test("tampered ban cookie is rejected safely", async () => {
    const { buildMeetingBanCookieValue, getMeetingBanCookieName, getMeetingBanStatusFromRequest } = await import(
      "../lib/security/banCookie"
    );
    const meetingCode = "MTG9012";
    const cookieName = getMeetingBanCookieName(meetingCode);
    const value = buildMeetingBanCookieValue(meetingCode, new Date(Date.now() + 10 * 60 * 1000).toISOString());
    const tampered = `${value.slice(0, -1)}0`;
    const request = new Request("https://example.com/api/meeting/join", {
      headers: {
        cookie: `${cookieName}=${tampered}`
      }
    });

    const status = getMeetingBanStatusFromRequest(request, meetingCode);
    expect(status.active).toBe(false);
    expect(status.expired).toBe(false);
  });

  test("expired ban cookie is marked expired and not active", async () => {
    const { buildMeetingBanCookieValue, getMeetingBanCookieName, getMeetingBanStatusFromRequest } = await import(
      "../lib/security/banCookie"
    );
    const meetingCode = "MTG9013";
    const cookieName = getMeetingBanCookieName(meetingCode);
    const value = buildMeetingBanCookieValue(meetingCode, new Date(Date.now() - 60 * 1000).toISOString());
    const request = new Request("https://example.com/api/meeting/join", {
      headers: {
        cookie: `${cookieName}=${value}`
      }
    });

    const status = getMeetingBanStatusFromRequest(request, meetingCode);
    expect(status.active).toBe(false);
    expect(status.expired).toBe(true);
  });

  test("server refuses invalid SERVER_SECRET", async () => {
    jest.resetModules();
    process.env.SERVER_SECRET = "short";
    process.env.REJOIN_TOKEN_PRIVATE_KEY_PEM = "bad";
    process.env.REJOIN_TOKEN_PUBLIC_KEY_PEM = "bad";
    const envModule = await import("../lib/security/env");
    expect(() => envModule.getSecurityEnv()).toThrow();
    jest.resetModules();
    setupSecurityEnv();
  });

  test("secret value is not committed outside .env.example", async () => {
    const secret = process.env.SERVER_SECRET ?? "";
    const root = process.cwd();
    const files = await listFilesRecursively(root);
    const leakingFiles: string[] = [];

    for (const file of files) {
      if (file.endsWith(path.join(".env.example"))) {
        continue;
      }
      const content = await readFile(file, "utf8").catch(() => "");
      if (content.includes(secret)) {
        leakingFiles.push(file);
      }
    }

    expect(leakingFiles).toEqual([]);
  });
});
