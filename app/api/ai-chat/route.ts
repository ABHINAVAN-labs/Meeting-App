import { NextResponse } from "next/server";

type ChatMessage = {
  role: "user" | "assistant";
  content: string;
};

type RequestBody = {
  messages?: ChatMessage[];
};

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
const MODEL = "nvidia/nemotron-3-super-120b-a12b:free";
const STYLE_SYSTEM_PROMPT =
  "You are a classroom AI tutor. Write clear, student-friendly answers. Use short sections, simple bullets, and concise steps. Avoid long walls of text. Use plain text; no markdown tables unless explicitly requested.";

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

export async function POST(request: Request) {
  const apiKey = (process.env.OPENROUTER_API_KEY ?? "").trim();
  if (!apiKey) {
    return NextResponse.json({ error: "Missing OPENROUTER_API_KEY" }, { status: 500 });
  }

  let body: RequestBody;
  try {
    body = (await request.json()) as RequestBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const incomingMessages = Array.isArray(body.messages) ? body.messages : [];
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
    const upstreamResponse = await fetch(OPENROUTER_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          { role: "system", content: STYLE_SYSTEM_PROMPT },
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
