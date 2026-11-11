/**
 * Ayni MCP server (read-only), over stdio.
 *
 * Lets a member ask THEIR OWN AI assistant (Claude, ChatGPT…) things like "how much do I owe?" or
 * "show my payments". It only calls Ayni's API with the member's read-only key, so it cannot move
 * money or change anything, and it never sees more than the member sees in the app.
 *
 *   AYNI_API_URL=https://ayni-api.onrender.com AYNI_MCP_TOKEN=<key from the app> npm run mcp
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { TOOLS, type Api } from "./tools";

const base = (process.env.AYNI_API_URL ?? "http://localhost:4000").replace(/\/$/, "");
const token = process.env.AYNI_MCP_TOKEN ?? "";

const api: Api = async (path) => {
  const res = await fetch(`${base}${path}`, { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(15_000) });
  if (res.status === 401) throw new Error("The key is invalid or was revoked. Generate a new one in the Ayni app.");
  if (res.status === 403) throw new Error("You do not have access to that.");
  if (!res.ok) throw new Error(`Ayni answered ${res.status}.`);
  return res.json();
};

async function main() {
  if (!token) {
    console.error("Missing AYNI_MCP_TOKEN. Generate a read-only key in the Ayni app (Passport > Connect my AI assistant).");
    process.exit(1);
  }
  const server = new McpServer({ name: "ayni", version: "1.0.0" });
  for (const tool of TOOLS) {
    // The input shape is built from data, so the SDK's deep generic types are bypassed on purpose.
    const register = server.registerTool.bind(server) as (name: string, config: unknown, cb: (args: Record<string, string>) => Promise<unknown>) => void;
    register(
      tool.name,
      {
        title: tool.title,
        description: tool.description,
        inputSchema: Object.fromEntries(Object.entries(tool.args).map(([k, d]) => [k, z.string().max(64).describe(d)])),
        annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
      },
      async (args) => {
        try {
          return { content: [{ type: "text" as const, text: JSON.stringify(await tool.run(api, args), null, 2) }] };
        } catch (e) {
          return { isError: true, content: [{ type: "text" as const, text: e instanceof Error ? e.message : "Could not read that." }] };
        }
      }
    );
  }
  await server.connect(new StdioServerTransport());
  console.error(`Ayni MCP server ready (read-only, ${TOOLS.length} tools) → ${base}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
