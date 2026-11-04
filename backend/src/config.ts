import "dotenv/config";

function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing environment variable ${name}. See .env.example`);
  return v;
}

export const config = {
  port: Number(process.env.PORT ?? 4000),
  jwtSecret: required("JWT_SECRET"),
  // Public URL of this backend (PayPal redirects here). e.g. https://ayni-api.onrender.com
  publicApiUrl: required("PUBLIC_API_URL").replace(/\/$/, ""),
  // Web build of the Expo app (for judges). e.g. https://ayni.onrender.com
  appWebUrl: (process.env.APP_WEB_URL ?? "http://localhost:8081").replace(/\/$/, ""),
  appScheme: process.env.APP_SCHEME ?? "ayni",
  allowExpoGoRedirects: process.env.NODE_ENV !== "production" || process.env.ALLOW_EXPO_GO === "true",
  enableDemoLogin: process.env.ENABLE_DEMO_LOGIN === "true",
  paypal: {
    clientId: required("PAYPAL_CLIENT_ID"),
    clientSecret: required("PAYPAL_CLIENT_SECRET"),
    apiBase: process.env.PAYPAL_API_BASE ?? "https://api-m.sandbox.paypal.com",
    webBase: process.env.PAYPAL_WEB_BASE ?? "https://www.sandbox.paypal.com",
    webhookId: process.env.PAYPAL_WEBHOOK_ID ?? "",
  },
  anthropic: {
    apiKey: process.env.ANTHROPIC_API_KEY ?? "",
    model: process.env.ANTHROPIC_MODEL ?? "claude-sonnet-5-5",
  },
  engineIntervalMs: Number(process.env.ENGINE_INTERVAL_MS ?? 20_000),
};
