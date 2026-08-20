import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  ADJECTIVES,
  generateIdentity,
  isValidIdentity,
  NOUNS,
  USER_COLORS,
} from "./identity.ts";

describe("generateIdentity", () => {
  it("returns uuid-shaped id, allow-listed color, and AdjNoun username", () => {
    const id = generateIdentity();
    assert.match(id.userId, /^[0-9a-f-]{36}$/i);
    assert.ok(USER_COLORS.includes(id.color));
    const adj = ADJECTIVES.find((a) => id.username.startsWith(a));
    assert.ok(adj);
    const noun = id.username.slice(adj.length);
    assert.ok((NOUNS as readonly string[]).includes(noun));
  });
});

describe("isValidIdentity", () => {
  it("accepts a well-formed payload", () => {
    assert.equal(
      isValidIdentity({
        userId: "11111111-1111-4111-8111-111111111111",
        username: "CosmicNova",
        color: "#6366f1",
      }),
      true
    );
  });

  it("rejects tampered storage", () => {
    assert.equal(isValidIdentity({ userId: "x", username: "CosmicNova", color: "#6366f1" }), false);
    assert.equal(
      isValidIdentity({
        userId: "11111111-1111-4111-8111-111111111111",
        username: "<script>",
        color: "#6366f1",
      }),
      false
    );
    assert.equal(
      isValidIdentity({
        userId: "11111111-1111-4111-8111-111111111111",
        username: "CosmicNova",
        color: "red",
      }),
      false
    );
  });
});
