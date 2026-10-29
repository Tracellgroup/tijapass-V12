// AI client. Calls the Netlify Function (key kept on the server). If the function is not configured
// or unreachable, the rules-based reader is used and the result is labelled "rules" (web MVP fallback).
import { READY_KINDS } from "../core/kinds.js";
import { readDescription } from "../core/reader.js";

async function callFunction(task, payload, timeoutMs = 12000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch("/.netlify/functions/ai", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ task, ...payload }),
      signal: ctrl.signal
    });
    if (!res.ok) return null;
    const data = await res.json();
    if (!data || data.fallback) return null;
    return data;
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

let status = "unknown"; // "ai" | "rules" | "unknown"
export const aiStatus = () => status;

export async function readEntry(text, direction, lang) {
  const ai = await callFunction("read_entry", { text, direction, lang, kinds: READY_KINDS });
  if (ai && ai.kind && READY_KINDS.includes(ai.kind)) {
    status = "ai";
    const rules = readDescription(text, direction);
    return {
      kind: ai.kind,
      alternatives: (ai.alternatives || []).filter((k) => READY_KINDS.includes(k) && k !== ai.kind).slice(0, 3),
      amount: ai.amount || rules.amount,
      channelType: ai.channel || rules.channelType,
      confidence: ai.confidence ?? 0.8,
      conflict: Boolean(ai.conflict) || rules.conflict,
      question: lang === "sw" ? ai.question_sw : ai.question_en,
      engine: "ai"
    };
  }
  status = "rules";
  return readDescription(text, direction);
}

export async function readStatementText(text, lang) {
  const ai = await callFunction("read_statement", { text: String(text).slice(0, 20000), lang }, 25000);
  if (ai && Array.isArray(ai.lines)) return { lines: ai.lines, accountName: ai.account_name || "", provider: ai.provider || "", engine: "ai" };
  return null;
}

export async function askHelp(question, lang, faq) {
  const ai = await callFunction("help", { question, lang, faq });
  if (ai && ai.answer) return { answer: ai.answer, confident: ai.confident !== false, engine: "ai" };
  return null;
}
