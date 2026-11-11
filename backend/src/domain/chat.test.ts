import { test } from "node:test";
import assert from "node:assert/strict";
import { canHide, canSee, cleanMessage, mentionsAssistant, RateLimiter, stripMention, MAX_MESSAGE_LENGTH } from "./chat";

test("messages are trimmed, capped and stripped of control characters", () => {
  assert.equal(cleanMessage("  hola  "), "hola");
  assert.equal(cleanMessage("a\r\nb"), "a\nb");
  assert.equal(cleanMessage("a\n\n\n\n\nb"), "a\n\nb");
  assert.equal(cleanMessage("ho\u0000la\u0007"), "hola");
  // zero-width and right-to-left override characters can disguise a message
  assert.equal(cleanMessage("pa​ga a‮ otro"), "paga a otro");
  assert.equal(cleanMessage("x".repeat(5000))!.length, MAX_MESSAGE_LENGTH);
  assert.equal(cleanMessage("¡Sí! ñandú 🎉"), "¡Sí! ñandú 🎉");
});

test("empty or non-text messages are rejected", () => {
  for (const bad of ["", "   ", "\n\n", "​​", null, undefined, 42, {}, ["a"]]) assert.equal(cleanMessage(bad), null);
});

test("@ayni sends the message to the assistant", () => {
  assert.equal(mentionsAssistant("@ayni ¿cuánto debo?"), true);
  assert.equal(mentionsAssistant("Oye @Ayni, ¿quién falta?"), true);
  assert.equal(mentionsAssistant("¿cuándo me toca, @AYNI?"), true);
  assert.equal(mentionsAssistant("escríbeme a rosa@ayni.com"), false);
  assert.equal(mentionsAssistant("rosa@ayni"), false);
  assert.equal(mentionsAssistant("@aynibot hola"), false);
  assert.equal(mentionsAssistant("hola a todos"), false);
});

test("the mention is removed from the question", () => {
  assert.equal(stripMention("@ayni ¿cuánto debo?"), "¿cuánto debo?");
  assert.equal(stripMention("Oye @Ayni, ¿quién falta?"), "Oye ¿quién falta?");
  assert.equal(stripMention("@ayni"), "@ayni"); // nothing else to ask: keep it as written
});

test("rate limit: a burst is stopped and the window slides", () => {
  const rl = new RateLimiter(3, 1000);
  assert.deepEqual([rl.allow("u", 0), rl.allow("u", 100), rl.allow("u", 200), rl.allow("u", 300)], [true, true, true, false]);
  assert.equal(rl.allow("other", 300), true, "limits are per person");
  assert.equal(rl.allow("u", 999), false);
  assert.equal(rl.allow("u", 1001), true, "the first message left the window");
  assert.equal(rl.allow("u", 1002), false);
});

test("private assistant messages are only for the member who asked", () => {
  assert.equal(canSee({ visibleToUserId: null }, "ana"), true);
  assert.equal(canSee({ visibleToUserId: "ana" }, "ana"), true);
  assert.equal(canSee({ visibleToUserId: "ana" }, "beto"), false);
});

test("only the author or the organizer can hide a member's message", () => {
  const msg = { userId: "ana", role: "user", visibleToUserId: null, hiddenAt: null };
  assert.equal(canHide(msg, { id: "ana", isOrganizer: false }), true);
  assert.equal(canHide(msg, { id: "rosa", isOrganizer: true }), true);
  assert.equal(canHide(msg, { id: "beto", isOrganizer: false }), false);
  // PayPal events and the assistant's answers stay: the organizer cannot rewrite the record
  assert.equal(canHide({ ...msg, userId: null, role: "system" }, { id: "rosa", isOrganizer: true }), false);
  assert.equal(canHide({ ...msg, userId: null, role: "assistant" }, { id: "rosa", isOrganizer: true }), false);
  assert.equal(canHide({ ...msg, hiddenAt: new Date() }, { id: "ana", isOrganizer: false }), false);
});
