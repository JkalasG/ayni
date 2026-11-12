import "dotenv/config";

/**
 * APP_MODE=live (default): real PayPal sandbox + Claude + your DATABASE_URL.
 * APP_MODE=mock: nothing external. Embedded Postgres, a simulated PayPal served by
 * this same API under /__paypal, and the assistant without AI. For design and demos.
 */
export const mode: "live" | "mock" = process.env.APP_MODE === "mock" ? "mock" : "live";
const mock = mode === "mock";

function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing environment variable ${name}. See .env.example`);
  return v;
}

const port = Number(process.env.PORT ?? 4000);
const publicApiUrl = (mock ? process.env.PUBLIC_API_URL ?? `http://localhost:${port}` : required("PUBLIC_API_URL")).replace(/\/$/, "");

export const config = {
  mode,
  port,
  jwtSecret: mock ? process.env.JWT_SECRET ?? "mock-mode-secret" : required("JWT_SECRET"),
  // Public URL of this backend (PayPal redirects here). e.g. https://ayni-api.onrender.com
  publicApiUrl,
  // Web build of the Expo app (for judges). e.g. https://ayni.onrender.com
  appWebUrl: (process.env.APP_WEB_URL ?? "http://localhost:8081").replace(/\/$/, ""),
  appScheme: process.env.APP_SCHEME ?? "ayni",
  allowExpoGoRedirects: process.env.NODE_ENV !== "production" || process.env.ALLOW_EXPO_GO === "true",
  enableDemoLogin: mock || process.env.ENABLE_DEMO_LOGIN === "true",
  // The password the sandbox personal accounts share. Shown to judges on the welcome screen next to the accounts, only
  // while demo login is on (these are PayPal Sandbox accounts: they hold no real money).
  demoMemberPassword: process.env.DEMO_MEMBER_PASSWORD ?? "",
  paypal: mock
    ? {
        clientId: "mock-client",
        clientSecret: "mock-secret",
        // server-to-server calls stay on this machine; pages the user opens use the public URL
        apiBase: `http://127.0.0.1:${port}/__paypal`,
        webBase: `${publicApiUrl}/__paypal`,
        webhookId: "",
      }
    : {
        clientId: required("PAYPAL_CLIENT_ID"),
        clientSecret: required("PAYPAL_CLIENT_SECRET"),
        apiBase: process.env.PAYPAL_API_BASE ?? "https://api-m.sandbox.paypal.com",
        webBase: process.env.PAYPAL_WEB_BASE ?? "https://www.sandbox.paypal.com",
        webhookId: process.env.PAYPAL_WEBHOOK_ID ?? "",
      },
  anthropic: {
    // mock mode never calls Claude: the assistant and reminders use the rule-based fallback
    apiKey: mock ? "" : process.env.ANTHROPIC_API_KEY ?? "",
    model: process.env.ANTHROPIC_MODEL ?? "claude-sonnet-5-5",
  },
  // Any OpenAI-compatible service instead of Claude (Gemini, Groq, OpenRouter, a local Ollama): see ai/llm.ts
  llm: {
    baseUrl: mock ? "" : process.env.AI_BASE_URL ?? "",
    apiKey: process.env.AI_API_KEY ?? "",
    model: process.env.AI_MODEL ?? "",
    // "none" / "minimal" / "low": models that think before answering spend the answer's budget (and tokens) on it
    reasoningEffort: process.env.AI_REASONING_EFFORT ?? "",
  },
  engineIntervalMs: Number(process.env.ENGINE_INTERVAL_MS ?? 20_000),
};
