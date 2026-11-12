/**
 * The model behind Ayni's assistant. Two ways to plug one in, chosen by the environment:
 *  - ANTHROPIC_API_KEY: Claude, through Anthropic's SDK.
 *  - AI_BASE_URL + AI_MODEL (+ AI_API_KEY): any service that speaks the OpenAI chat-completions format: Google Gemini,
 *    Groq, OpenRouter, or a model running on this machine with Ollama (free, no account).
 * The rest of the code talks to `client.messages.create(...)` in Anthropic's shape either way; for the second kind this
 * file translates the request and the answer. With neither, `client` is null and every feature uses its fixed rules.
 */
import Anthropic from "@anthropic-ai/sdk";
import { config } from "../config";

type Create = (p: Anthropic.MessageCreateParamsNonStreaming) => Promise<Anthropic.Message>;
export type Llm = { messages: { create: Create } };

/** Anthropic's messages -> OpenAI's: tool calls and tool results are separate messages there. */
function toOpenAi(p: Anthropic.MessageCreateParamsNonStreaming, model: string, effort: string) {
  const messages: any[] = [];
  if (typeof p.system === "string" && p.system) messages.push({ role: "system", content: p.system });
  for (const m of p.messages) {
    if (typeof m.content === "string") {
      messages.push({ role: m.role, content: m.content });
      continue;
    }
    const text = m.content.filter((b): b is Anthropic.TextBlockParam => b.type === "text").map((b) => b.text).join("\n");
    if (m.role === "assistant") {
      const calls = m.content
        .filter((b): b is Anthropic.ToolUseBlockParam => b.type === "tool_use")
        .map((b) => ({ id: b.id, type: "function", function: { name: b.name, arguments: JSON.stringify(b.input ?? {}) }, ...((b as any).extra_content ? { extra_content: (b as any).extra_content } : {}) }));
      messages.push({ role: "assistant", content: text || null, ...(calls.length ? { tool_calls: calls } : {}) });
    } else {
      for (const b of m.content) {
        if (b.type === "tool_result") messages.push({ role: "tool", tool_call_id: b.tool_use_id, content: typeof b.content === "string" ? b.content : JSON.stringify(b.content ?? "") });
      }
      if (text) messages.push({ role: "user", content: text });
    }
  }
  const tools = (p.tools ?? []).map((t: any) => ({ type: "function", function: { name: t.name, description: t.description, parameters: t.input_schema } }));
  const choice = p.tool_choice as any;
  return {
    model,
    max_tokens: p.max_tokens,
    ...(effort ? { reasoning_effort: effort } : {}),
    messages,
    ...(tools.length ? { tools } : {}),
    ...(choice?.type === "tool" ? { tool_choice: { type: "function", function: { name: choice.name } } } : {}),
  };
}

/** OpenAI's answer -> Anthropic's content blocks, which is what the callers read. */
function fromOpenAi(json: any): Anthropic.Message {
  const msg = json?.choices?.[0]?.message;
  if (!msg) throw new Error(`llm: no answer (${JSON.stringify(json?.error ?? json).slice(0, 300)})`);
  const content: any[] = [];
  if (typeof msg.content === "string" && msg.content.trim()) content.push({ type: "text", text: msg.content });
  for (const c of msg.tool_calls ?? []) {
    let input: unknown = {};
    try {
      input = JSON.parse(c.function?.arguments || "{}");
    } catch {
      /* arguments that are not JSON count as empty: the caller validates and falls back */
    }
    // Gemini signs each tool call (extra_content) and wants the signature back with the tool's result: keep it on the block.
    content.push({ type: "tool_use", id: c.id ?? `call_${content.length}`, name: c.function?.name, input, ...(c.extra_content ? { extra_content: c.extra_content } : {}) });
  }
  return { id: json.id ?? "", type: "message", role: "assistant", model: config.llm.model, content, stop_reason: msg.tool_calls?.length ? "tool_use" : "end_turn", stop_sequence: null } as unknown as Anthropic.Message;
}

const MODELS = config.llm.model.split(",").map((m) => m.trim()).filter(Boolean);

function openAiCompatible(): Llm {
  const url = `${config.llm.baseUrl.replace(/\/+$/, "")}/chat/completions`;
  return {
    messages: {
      create: async (p) => {
        // AI_MODEL may list several models, best first. A free tier is often busy: when one is saturated, retired or
        // slow, the next one answers, so the person never waits for a model that is not coming.
        let last: unknown;
        for (const model of MODELS) {
          try {
            let effort = config.llm.reasoningEffort;
            let res = await fetch(url, {
              method: "POST",
              headers: { "content-type": "application/json", ...(config.llm.apiKey ? { authorization: `Bearer ${config.llm.apiKey}` } : {}) },
              body: JSON.stringify(toOpenAi(p, model, effort)),
              signal: AbortSignal.timeout(15_000),
            });
            // a model that does not take that setting: ask it again without it
            if (res.status === 400 && effort) {
              effort = "";
              res = await fetch(url, { method: "POST", headers: { "content-type": "application/json", ...(config.llm.apiKey ? { authorization: `Bearer ${config.llm.apiKey}` } : {}) }, body: JSON.stringify(toOpenAi(p, model, effort)), signal: AbortSignal.timeout(15_000) });
            }
            const json = await res.json().catch(() => null);
            if (res.ok) return fromOpenAi(json);
            last = new Error(`llm: ${model} ${res.status} ${JSON.stringify(json).slice(0, 200)}`);
            // a request the service rejects as wrong would be wrong for every model
            if (res.status === 400 || res.status === 401 || res.status === 403) break;
          } catch (e) {
            last = new Error(`llm: ${model} ${String(e).slice(0, 120)}`);
          }
        }
        throw last;
      },
    },
  };
}

export const client: Llm | null = config.llm.baseUrl && config.llm.model ? openAiCompatible() : config.anthropic.apiKey ? (new Anthropic({ apiKey: config.anthropic.apiKey }) as unknown as Llm) : null;
/** The model name sent with each request (the OpenAI-compatible client always uses AI_MODEL). */
export const MODEL = config.llm.baseUrl && config.llm.model ? MODELS[0] : config.anthropic.model;
