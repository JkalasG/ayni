// Starts the real MCP server over stdio, talks to it with the official MCP client, and points it at a fake Ayni API.
// Checks: the tools are listed as read-only, a tool returns the API's data, a wrong key gives a clear error,
// and the server refuses to start without a key.   Run with:  npm run test:mcp
import http from "http";
import assert from "assert/strict";
import path from "path";
import { fileURLToPath, pathToFileURL } from "url";
import { spawnSync } from "child_process";
import { createRequire } from "module";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(path.join(root, "package.json"));
const sdk = (p) => import(pathToFileURL(require.resolve(`@modelcontextprotocol/sdk/${p}`)).href);
const { Client } = await sdk("client/index.js");
const { StdioClientTransport } = await sdk("client/stdio.js");
const tsx = path.join(root, "node_modules", "tsx", "dist", "cli.mjs");
const entry = path.join(root, "src", "mcp", "server.ts");

const seen = [];
const api = http.createServer((req, res) => {
  seen.push(`${req.method} ${req.url} ${req.headers.authorization}`);
  res.setHeader("Content-Type", "application/json");
  if (req.headers.authorization !== "Bearer good-key") return (res.statusCode = 401), res.end("{}");
  if (req.url === "/groups") return res.end(JSON.stringify([{ id: "g1", name: "Pasanaku del barrio", status: "ACTIVE", contributionCents: 2000, frequency: "WEEKLY", _count: { memberships: 5 } }]));
  res.statusCode = 404;
  res.end("{}");
});
await new Promise((r) => api.listen(0, r));
const base = `http://127.0.0.1:${api.address().port}`;

async function connect(token) {
  const transport = new StdioClientTransport({ command: process.execPath, args: [tsx, entry], env: { ...process.env, AYNI_API_URL: base, ...(token ? { AYNI_MCP_TOKEN: token } : {}) }, stderr: "pipe" });
  const client = new Client({ name: "test", version: "1.0.0" });
  await client.connect(transport);
  return client;
}

try {
  // 1. no key: it does not start
  const none = spawnSync(process.execPath, [tsx, entry], { env: { ...process.env, AYNI_API_URL: base, AYNI_MCP_TOKEN: "" }, encoding: "utf8", timeout: 30000 });
  assert.notEqual(none.status, 0);
  assert.match(none.stderr, /Missing AYNI_MCP_TOKEN/);
  console.log("✔ refuses to start without a key");

  // 2. with a key: tools are listed, all read-only
  const client = await connect("good-key");
  const { tools } = await client.listTools();
  assert.deepEqual(tools.map((t) => t.name).sort(), ["group_payments", "group_status", "list_my_groups", "my_claims", "my_payments", "my_trust_profile"]);
  for (const t of tools) {
    assert.equal(t.annotations?.readOnlyHint, true, `${t.name} must be marked read-only`);
    assert.equal(t.annotations?.destructiveHint, false);
  }
  console.log("✔ MCP tools listed, all read-only:", tools.length);

  // 3. a tool reads from the API with the member's key
  const out = await client.callTool({ name: "list_my_groups", arguments: {} });
  const data = JSON.parse(out.content[0].text);
  assert.equal(data[0].contribution, "$20.00");
  assert.equal(data[0].members, 5);
  assert.ok(seen.some((s) => s === "GET /groups Bearer good-key"));
  assert.ok(seen.every((s) => s.startsWith("GET ")), "the server only ever reads");
  console.log("✔ a tool answered with the member's data");

  // 4. bad input never reaches the API
  const before = seen.length;
  const bad = await client.callTool({ name: "group_status", arguments: { group_id: "../me" } });
  assert.equal(bad.isError, true);
  assert.equal(seen.length, before);
  console.log("✔ an invalid id is refused before any request");
  await client.close();

  // 5. a revoked / wrong key gives a clear message, not a crash
  const stale = await connect("old-key");
  const r = await stale.callTool({ name: "list_my_groups", arguments: {} });
  assert.equal(r.isError, true);
  assert.match(r.content[0].text, /invalid or was revoked/);
  assert.ok(!r.content[0].text.includes("old-key"), "the key is never echoed");
  await stale.close();
  console.log("✔ a revoked key gives a clear error");
  console.log("\nMCP CHECKS PASSED");
} finally {
  api.close();
}
process.exit(0);
