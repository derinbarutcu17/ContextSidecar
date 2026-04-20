import { describe, expect, it } from "vitest";
import { ContextItemV1Schema, ContextPackRequestV1Schema } from "../src/index.js";

describe("context domain schemas", () => {
  it("parses a valid context item", () => {
    const item = ContextItemV1Schema.parse({
      id: "ctx_1",
      namespace: "project:repo-a",
      item_type: "preference",
      content: "Prefer terse status updates.",
      source_type: "user_message",
      source_reference: null,
      priority: 90,
      status: "active",
      created_at: "2026-04-21T08:00:00.000Z",
      updated_at: "2026-04-21T08:00:00.000Z",
      expires_at: null,
      tags: ["voice", "style"],
      metadata: { channel: "cli" }
    });

    expect(item.namespace).toBe("project:repo-a");
  });

  it("rejects invalid enum values", () => {
    expect(() =>
      ContextItemV1Schema.parse({
        id: "ctx_2",
        namespace: "default",
        item_type: "bad",
        content: "Bad enum",
        source_type: "user_message",
        source_reference: null,
        priority: 1,
        status: "active",
        created_at: "2026-04-21T08:00:00.000Z",
        updated_at: "2026-04-21T08:00:00.000Z",
        expires_at: null,
        tags: [],
        metadata: {}
      })
    ).toThrow();
  });

  it("rejects missing required fields", () => {
    expect(() => ContextItemV1Schema.parse({ id: "ctx_3", namespace: "default" })).toThrow();
  });

  it("rejects an invalid context pack request", () => {
    expect(() =>
      ContextPackRequestV1Schema.parse({
        namespace: "default",
        task_query: null,
        max_items: 0,
        include_types: ["preference"],
        exclude_archived: true,
        now: null
      })
    ).toThrow();
  });
});
