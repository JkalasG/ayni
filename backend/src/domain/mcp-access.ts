/**
 * What a read-only key (the one a member gives to their own AI assistant through MCP) may call.
 * An explicit allowlist: anything not listed is refused, so a new endpoint is never exposed by accident.
 * Only GET, and never the chat (it holds the member's private questions to Ayni).
 */
const ALLOWED: RegExp[] = [
  /^\/me\/profile$/,
  /^\/me\/payments$/,
  /^\/groups$/,
  /^\/groups\/[A-Za-z0-9_-]+$/,
  /^\/groups\/[A-Za-z0-9_-]+\/ledger$/,
  /^\/groups\/[A-Za-z0-9_-]+\/claims$/,
];

export function mcpAllowed(method: string, path: string): boolean {
  if (method.toUpperCase() !== "GET") return false;
  return ALLOWED.some((re) => re.test(path));
}
