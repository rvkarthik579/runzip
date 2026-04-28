import { describe, it, expect } from "vitest";
import { sanitizeProjectPayload } from "./projectMapper.js";

describe("sanitizeProjectPayload", () => {
  it("provides defaults for empty input", () => {
    const result = sanitizeProjectPayload({});
    expect(result.name).toBe("Untitled Project");
    expect(result.summary).toBe("");
    expect(result.content).toBe("");
    expect(result.metadata.category).toBe("general");
    expect(result.metadata.tags).toEqual([]);
  });

  it("truncates long names", () => {
    const name = "x".repeat(200);
    const result = sanitizeProjectPayload({ name });
    expect(result.name.length).toBeLessThanOrEqual(100);
  });

  it("truncates long summaries", () => {
    const summary = "x".repeat(500);
    const result = sanitizeProjectPayload({ summary });
    expect(result.summary.length).toBeLessThanOrEqual(280);
  });

  it("truncates long content", () => {
    const content = "x".repeat(60000);
    const result = sanitizeProjectPayload({ content });
    expect(result.content.length).toBeLessThanOrEqual(50000);
  });

  it("sanitizes tags array", () => {
    const tags = ["valid", "", "  trimmed  ", "x".repeat(100)];
    const result = sanitizeProjectPayload({ metadata: { tags } });
    expect(result.metadata.tags).toContain("valid");
    expect(result.metadata.tags).toContain("trimmed");
    expect(result.metadata.tags).not.toContain("");
    expect(result.metadata.tags.every((t) => t.length <= 30)).toBe(true);
  });

  it("limits tags to 20 items", () => {
    const tags = Array.from({ length: 30 }, (_, i) => `tag-${i}`);
    const result = sanitizeProjectPayload({ metadata: { tags } });
    expect(result.metadata.tags).toHaveLength(20);
  });

  it("handles non-array tags gracefully", () => {
    const result = sanitizeProjectPayload({ metadata: { tags: "not-an-array" } });
    expect(result.metadata.tags).toEqual([]);
  });

  it("trims whitespace from name", () => {
    const result = sanitizeProjectPayload({ name: "  My Project  " });
    expect(result.name).toBe("My Project");
  });

  it("uses 'Untitled Project' for empty name", () => {
    const result = sanitizeProjectPayload({ name: "   " });
    expect(result.name).toBe("Untitled Project");
  });
});
