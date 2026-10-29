// Netlify Function: the only place the AI key is used. The browser never sees it.
// Environment variables (Netlify > Site configuration > Environment variables), WITHOUT a VITE_ prefix:
//   AI_API_KEY  – the Anthropic API key
//   AI_MODEL    – optional, defaults to claude-haiku-5-5
// When AI_API_KEY is missing, the function answers {fallback: true} and the app uses its built-in rules.
import { HELP_SYSTEM, READ_ENTRY_SYSTEM, READ_STATEMENT_SYSTEM } from "./prompts.mjs";

const API = "https://api.anthropic.com/v1/messages";
const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", "cache-control": "no-store" } });

function firstJson(text) {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("no JSON in reply");
  return JSON.parse(text.slice(start, end + 1));
}

async function ask(system, user, maxTokens) {
  const res = await fetch(API, {
    method: "POST",
    headers: { "content-type": "application/json", "x-api-key": process.env.AI_API_KEY, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({ model: process.env.AI_MODEL || "claude-haiku-5-5", max_tokens: maxTokens, system, messages: [{ role: "user", content: user }] })
  });
  if (!res.ok) throw new Error(`AI ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const data = await res.json();
  return firstJson((data.content || []).filter((c) => c.type === "text").map((c) => c.text).join(""));
}

export default async (req) => {
  if (req.method !== "POST") return json({ error: "POST only" }, 405);
  if (!process.env.AI_API_KEY) return json({ fallback: true, reason: "AI_API_KEY not set" });
  let body;
  try {
    body = await req.json();
  } catch {
    return json({ error: "bad JSON" }, 400);
  }
  const { task } = body;
  try {
    if (task === "read_entry") {
      const text = String(body.text || "").slice(0, 500);
      const out = await ask(READ_ENTRY_SYSTEM, `Direction chosen: ${body.direction || "null"}\nDescription: ${text}`, 400);
      return json(out);
    }
    if (task === "read_statement") {
      const text = String(body.text || "").slice(0, 20000);
      const out = await ask(READ_STATEMENT_SYSTEM, text, 8000);
      return json(out);
    }
    if (task === "help") {
      const faq = (body.faq || []).slice(0, 60).map((f) => `Q: ${f.q}\nA: ${f.a}`).join("\n\n");
      const out = await ask(HELP_SYSTEM, `Language: ${body.lang === "sw" ? "Kiswahili" : "English"}\n\nFAQ:\n${faq}\n\nQuestion: ${String(body.question || "").slice(0, 600)}`, 500);
      return json(out);
    }
    return json({ error: "unknown task" }, 400);
  } catch (e) {
    // Any AI failure falls back to the app's rules; the reason is logged for the developer.
    console.error(e);
    return json({ fallback: true, reason: String(e.message || e).slice(0, 200) });
  }
};
