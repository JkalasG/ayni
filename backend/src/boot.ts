/**
 * Entry point. In APP_MODE=mock it prepares a local world first (database, data),
 * then loads the API, then fills a showcase so every screen has something to show.
 */
import "dotenv/config";

async function main() {
  const mock = process.env.APP_MODE === "mock";
  if (mock) {
    const { prepareMockEnv } = await import("./mock/env");
    await prepareMockEnv();
  }
  await import("./index");
  if (mock) {
    const { runShowcase } = await import("./mock/showcase");
    await runShowcase().catch((e) => console.error("showcase failed", e));
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
