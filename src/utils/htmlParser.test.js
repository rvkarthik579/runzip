import { describe, it, expect } from "vitest";
import { transformHostedHtml } from "./htmlParser.js";

describe("transformHostedHtml", () => {
  it("injects base tag into head", () => {
    const input = "<html><head><title>Test</title></head><body></body></html>";
    const result = transformHostedHtml(input, "/p/abc123/");
    expect(result).toContain('<base href="/p/abc123/">');
  });

  it("creates head element if missing", () => {
    const input = "<html><body><p>hello</p></body></html>";
    const result = transformHostedHtml(input);
    expect(result).toContain("<head>");
    expect(result).toContain("<base");
  });

  it("does not add duplicate base tag", () => {
    const input = '<html><head><base href="/existing/"></head><body></body></html>';
    const result = transformHostedHtml(input, "/p/abc/");
    const baseCount = (result.match(/<base/g) || []).length;
    expect(baseCount).toBe(1);
  });

  it("rewrites root-absolute src attributes", () => {
    const input = '<html><head></head><body><script src="/assets/app.js"></script></body></html>';
    const result = transformHostedHtml(input);
    expect(result).toContain('src="./assets/app.js"');
  });

  it("does not rewrite protocol-relative src", () => {
    const input = '<html><head></head><body><img src="//cdn.example.com/img.png"></body></html>';
    const result = transformHostedHtml(input);
    expect(result).toContain('src="//cdn.example.com/img.png"');
  });

  it("does not rewrite relative src", () => {
    const input = '<html><head></head><body><img src="images/photo.jpg"></body></html>';
    const result = transformHostedHtml(input);
    expect(result).toContain('src="images/photo.jpg"');
  });

  it("rewrites stylesheet link href", () => {
    const input = '<html><head><link rel="stylesheet" href="/css/style.css"></head><body></body></html>';
    const result = transformHostedHtml(input);
    expect(result).toContain('href="./css/style.css"');
  });

  it("rewrites icon link href", () => {
    const input = '<html><head><link rel="icon" href="/favicon.ico"></head><body></body></html>';
    const result = transformHostedHtml(input);
    expect(result).toContain('href="./favicon.ico"');
  });

  it("does not rewrite non-asset link href", () => {
    const input = '<html><head><link rel="canonical" href="/page"></head><body></body></html>';
    const result = transformHostedHtml(input);
    expect(result).toContain('href="/page"');
  });
});
