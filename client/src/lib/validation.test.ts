import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  ALLOWED_REACTION_EMOJIS,
  isAllowedReactionEmoji,
  isElementType,
  isTool,
  sanitizeBoardName,
  sanitizeChatText,
  sanitizeColor,
  sanitizeElement,
  sanitizePoints,
  sanitizeUsername,
  MAX_CHAT_TEXT,
  MAX_BOARD_NAME,
} from "./validation.ts";

describe("isElementType", () => {
  it("accepts the canvas allow-list", () => {
    for (const t of ["PENCIL", "LINE", "RECTANGLE", "CIRCLE", "TEXT", "ERASER", "STICKY"]) {
      assert.equal(isElementType(t), true);
    }
  });

  it("rejects tools that are not persisted elements and junk", () => {
    assert.equal(isElementType("SELECT"), false);
    assert.equal(isElementType("LASER"), false);
    assert.equal(isElementType("script"), false);
    assert.equal(isElementType(""), false);
    assert.equal(isElementType(null), false);
  });
});

describe("isTool", () => {
  it("includes SELECT and LASER", () => {
    assert.equal(isTool("SELECT"), true);
    assert.equal(isTool("LASER"), true);
    assert.equal(isTool("PENCIL"), true);
    assert.equal(isTool("WAND"), false);
  });
});

describe("sanitizeChatText", () => {
  it("trims and rejects empty", () => {
    assert.equal(sanitizeChatText("  hello  "), "hello");
    assert.equal(sanitizeChatText("   "), null);
    assert.equal(sanitizeChatText(""), null);
    assert.equal(sanitizeChatText(null), null);
  });

  it("caps length", () => {
    const long = "x".repeat(MAX_CHAT_TEXT + 50);
    const out = sanitizeChatText(long);
    assert.equal(out?.length, MAX_CHAT_TEXT);
  });
});

describe("sanitizeBoardName", () => {
  it("trims, collapses whitespace, rejects empty", () => {
    assert.equal(sanitizeBoardName("  Welcome   Board  "), "Welcome Board");
    assert.equal(sanitizeBoardName("   "), null);
    assert.equal(sanitizeBoardName(42), null);
  });

  it("caps length", () => {
    const out = sanitizeBoardName("B".repeat(MAX_BOARD_NAME + 10));
    assert.equal(out?.length, MAX_BOARD_NAME);
  });
});

describe("sanitizeColor", () => {
  it("accepts #rgb and #rrggbb only", () => {
    assert.equal(sanitizeColor("#FFF"), "#fff");
    assert.equal(sanitizeColor("#6366f1"), "#6366f1");
    assert.equal(sanitizeColor("red"), "#ffffff");
    assert.equal(sanitizeColor("javascript:alert(1)"), "#ffffff");
    assert.equal(sanitizeColor("#gggggg"), "#ffffff");
  });
});

describe("sanitizePoints / sanitizeElement", () => {
  it("drops non-points and clamps coords", () => {
    const pts = sanitizePoints([{ x: 1, y: 2 }, "nope", { x: 1e12, y: -1e12 }]);
    assert.equal(pts.length, 2);
    assert.equal(pts[0].x, 1);
    assert.ok(pts[1].x <= 1_000_000);
    assert.ok(pts[1].y >= -1_000_000);
  });

  it("rejects unknown types and missing ids", () => {
    assert.equal(sanitizeElement({ type: "PENCIL", x: 0, y: 0 }), null);
    assert.equal(sanitizeElement({ id: "a", type: "HACK" }), null);
  });

  it("maps snake_case rows from Postgres", () => {
    const el = sanitizeElement({
      id: "11111111-1111-4111-8111-111111111111",
      type: "STICKY",
      x: 10,
      y: 20,
      width: 180,
      height: 140,
      points: [],
      color: "#fde68a",
      font_weight: "bold",
      text_content: "hello",
      created_at: "2026-01-01T00:00:00Z",
    });
    assert.ok(el);
    assert.equal(el.type, "STICKY");
    assert.equal(el.fontWeight, "bold");
    assert.equal(el.textContent, "hello");
    assert.equal(el.createdAt, "2026-01-01T00:00:00Z");
  });
});

describe("reactions / username", () => {
  it("allow-lists emojis", () => {
    for (const e of ALLOWED_REACTION_EMOJIS) {
      assert.equal(isAllowedReactionEmoji(e), true);
    }
    assert.equal(isAllowedReactionEmoji("<img>"), false);
    assert.equal(isAllowedReactionEmoji("💩"), false);
  });

  it("accepts generated-style usernames", () => {
    assert.equal(sanitizeUsername("CosmicNova"), "CosmicNova");
    assert.equal(sanitizeUsername("bad name"), null);
    assert.equal(sanitizeUsername("<script>"), null);
  });
});
