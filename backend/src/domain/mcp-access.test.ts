import { test } from "node:test";
import assert from "node:assert/strict";
import { mcpAllowed } from "./mcp-access";

test("a read-only key can only read the allowlisted endpoints", () => {
  for (const path of ["/me/profile", "/me/payments", "/groups", "/groups/abc123", "/groups/abc123/ledger", "/groups/abc123/claims"])
    assert.equal(mcpAllowed("GET", path), true, path);
});

test("a read-only key can never write", () => {
  for (const method of ["POST", "PUT", "PATCH", "DELETE"])
    for (const path of ["/groups", "/groups/abc123", "/groups/abc123/chat", "/contributions/x/checkout", "/me/mcp-token", "/claims/x/refund"])
      assert.equal(mcpAllowed(method, path), false, `${method} ${path}`);
});

test("a read-only key cannot reach private or unlisted endpoints, however they are written", () => {
  for (const path of [
    "/groups/abc123/chat", // a member's private questions to Ayni
    "/groups/abc123/ai-log",
    "/groups/abc123/disputes",
    "/me", "/me/mcp-token", "/notifications", "/explore", "/requests/x", "/paypal/sdk-config",
    "/groups/abc123/ledger/extra", "/groups//ledger", "/groups/a/b", "/groups/../me", "/groups/abc123%2Fchat", "/groups/abc 123",
    "/GROUPS", "", "/", "/groups/abc123/guarantee",
  ])
    assert.equal(mcpAllowed("GET", path), false, path);
});
