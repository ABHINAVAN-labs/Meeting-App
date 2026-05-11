import { NextResponse } from "next/server";
import { canParticipantUseAiChat } from "../../../lib/meetings/service";

type ChatMessage = {
  role: "user" | "assistant";
  content: string;
};

type RequestBody = {
  messages?: ChatMessage[];
  summary?: string;
  verbosity?: "short" | "normal" | "detailed";
  meetingCode?: string;
};

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
const MODEL = "nvidia/nemotron-3-super-120b-a12b:free";
const REQUEST_TIMEOUT_MS = 15000;
const MAX_RETRIES = 1;
const SUMMARY_CHAR_LIMIT = 1000;
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX_REQUESTS = 8;
const STYLE_SYSTEM_PROMPT =
  "You are a classroom AI tutor. Write clear, student-friendly answers. Use short sections, simple bullets, and concise steps. Avoid long walls of text. When you present tabular data, always use strict GitHub-Flavored Markdown table syntax: include header row, delimiter row with at least three hyphens per column, and data rows; every row must start and end with pipe characters; do not use ASCII box-drawing, plus-dash tables, or space-aligned plain-text columns.";

const rateLimitStore = new Map<string, number[]>();

function getVerbosityPrompt(verbosity: RequestBody["verbosity"]) {
  if (verbosity === "short") {
    return "Keep the answer concise: 3-6 lines unless the user asks for more detail.";
  }
  if (verbosity === "detailed") {
    return "Give a fuller explanation with clear steps and one compact example when helpful.";
  }
  return "Keep a balanced explanation: clear and moderately detailed.";
}

function getMaxTokens(verbosity: RequestBody["verbosity"]) {
  if (verbosity === "short") {
    return 280;
  }
  if (verbosity === "detailed") {
    return 900;
  }
  return 520;
}

function getOutputBoundPrompt(verbosity: RequestBody["verbosity"]) {
  if (verbosity === "short") {
    return "Hard limit: keep output under 120 words unless user explicitly asks for more.";
  }
  if (verbosity === "detailed") {
    return "Keep output focused and structured; avoid unnecessary repetition.";
  }
  return "Keep output concise and avoid unnecessary detail.";
}

function getRateLimitKey(request: Request) {
  const participantId = request.headers.get("x-participant-id")?.trim();
  if (participantId) {
    return `participant:${participantId}`;
  }

  const forwardedFor = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  if (forwardedFor) {
    return `ip:${forwardedFor}`;
  }

  return "ip:unknown";
}

function checkRateLimit(key: string) {
  const now = Date.now();
  const windowStart = now - RATE_LIMIT_WINDOW_MS;
  const recent = (rateLimitStore.get(key) ?? []).filter((timestamp) => timestamp >= windowStart);

  if (recent.length >= RATE_LIMIT_MAX_REQUESTS) {
    rateLimitStore.set(key, recent);
    const retryAfterSeconds = Math.ceil((recent[0] + RATE_LIMIT_WINDOW_MS - now) / 1000);
    return { allowed: false as const, retryAfterSeconds };
  }

  recent.push(now);
  rateLimitStore.set(key, recent);
  return { allowed: true as const, retryAfterSeconds: 0 };
}

function extractReplyContent(raw: unknown): string {
  if (typeof raw === "string") {
    return raw.trim();
  }

  if (Array.isArray(raw)) {
    const combined = raw
      .map((item) => {
        if (typeof item === "string") {
          return item;
        }
        if (item && typeof item === "object") {
          const record = item as Record<string, unknown>;
          if (typeof record.text === "string") {
            return record.text;
          }
          if (typeof record.content === "string") {
            return record.content;
          }
        }
        return "";
      })
      .filter((part) => part.length > 0)
      .join("\n")
      .trim();

    return combined;
  }

  return "";
}

function extractReplyFromChoice(choice: unknown): string {
  if (!choice || typeof choice !== "object") {
    return "";
  }

  const record = choice as Record<string, unknown>;
  const message = (record.message ?? {}) as Record<string, unknown>;

  const fromMessageContent = extractReplyContent(message.content);
  if (fromMessageContent) {
    return fromMessageContent;
  }

  const fromMessageReasoning = extractReplyContent(message.reasoning);
  if (fromMessageReasoning) {
    return fromMessageReasoning;
  }

  const fromChoiceText = extractReplyContent(record.text);
  if (fromChoiceText) {
    return fromChoiceText;
  }

  return "";
}

function shouldRetry(status: number) {
  return status === 408 || status === 429 || status >= 500;
}

async function fetchWithTimeoutAndRetry(url: string, init: RequestInit) {
  let lastError: Error | null = null;
  let lastResponse: Response | null = null;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
      const response = await fetch(url, {
        ...init,
        signal: controller.signal
      });
      clearTimeout(timeout);

      if (response.ok || attempt === MAX_RETRIES || !shouldRetry(response.status)) {
        return response;
      }

      lastResponse = response;
    } catch (error) {
      clearTimeout(timeout);
      lastError = error instanceof Error ? error : new Error(String(error));
      if (attempt === MAX_RETRIES) {
        throw lastError;
      }
    }
  }

  if (lastResponse) {
    return lastResponse;
  }

  throw lastError ?? new Error("OpenRouter request failed");
}

export async function POST(request: Request) {
  const rateLimitKey = getRateLimitKey(request);
  const rateLimit = checkRateLimit(rateLimitKey);
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: `Too many AI requests. Please wait ${rateLimit.retryAfterSeconds}s and try again.` },
      {
        status: 429,
        headers: {
          "Retry-After": String(rateLimit.retryAfterSeconds)
        }
      }
    );
  }

  let body: RequestBody;
  try {
    body = (await request.json()) as RequestBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const participantId = request.headers.get("x-participant-id")?.trim() ?? "";
  const meetingCode = typeof body.meetingCode === "string" ? body.meetingCode : "";
  if (participantId && meetingCode && !canParticipantUseAiChat(meetingCode, participantId)) {
    return NextResponse.json({ error: "AI Chat has been Disabled." }, { status: 403 });
  }

  const apiKey = (process.env.OPENROUTER_API_KEY ?? "").trim();
  if (!apiKey) {
    return NextResponse.json({ error: "Missing OPENROUTER_API_KEY" }, { status: 500 });
  }

  const incomingMessages = Array.isArray(body.messages) ? body.messages : [];
  const summary = typeof body.summary === "string" ? body.summary.trim().slice(0, SUMMARY_CHAR_LIMIT) : "";
  const verbosity: RequestBody["verbosity"] =
    body.verbosity === "short" || body.verbosity === "normal" || body.verbosity === "detailed" ? body.verbosity : "normal";
  const validMessages = incomingMessages
    .filter((message) => (message.role === "user" || message.role === "assistant") && typeof message.content === "string")
    .map((message) => ({
      role: message.role,
      content: message.content.trim()
    }))
    .filter((message) => message.content.length > 0);

  if (validMessages.length === 0) {
    return NextResponse.json({ error: "At least one message is required" }, { status: 400 });
  }

  try {
    const upstreamResponse = await fetchWithTimeoutAndRetry(OPENROUTER_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: getMaxTokens(verbosity),
        messages: [
          { role: "system", content: STYLE_SYSTEM_PROMPT },
          { role: "system", content: getVerbosityPrompt(verbosity) },
          { role: "system", content: getOutputBoundPrompt(verbosity) },
          ...(summary ? [{ role: "system", content: `Conversation summary:\n${summary}` }] : []),
          ...validMessages
        ]
      })
    });

    if (!upstreamResponse.ok) {
      const errorText = await upstreamResponse.text();
      return NextResponse.json(
        { error: "OpenRouter request failed", details: errorText.slice(0, 400) },
        { status: upstreamResponse.status }
      );
    }

    const upstreamJson = (await upstreamResponse.json()) as {
      choices?: unknown[];
      output_text?: unknown;
      response?: unknown;
    };
    const firstChoice = upstreamJson.choices?.[0];
    const reply =
      extractReplyFromChoice(firstChoice) ||
      extractReplyContent(upstreamJson.output_text) ||
      extractReplyContent(upstreamJson.response);

    if (!reply) {
      return NextResponse.json({
        reply: "I could not generate a complete response just now. Please resend your question."
      });
    }

    return NextResponse.json({ reply });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: "Failed to reach OpenRouter", details: message }, { status: 502 });
  }
}
