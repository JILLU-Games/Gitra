import { describe, expect, it } from "vitest";

import {
  buildEscapedErrorHtmlDocument,
  getErrorMessage,
  getErrorStack,
  isGitReadMissError,
  resolveErrorStatus,
} from "@/client/server/error";
import { HttpError } from "@/shared/web/http";

describe("Phase-05 error inspection & fallback escaping helpers", () => {
  it("extracts messages cleanly from unknown thrown values", () => {
    expect(getErrorMessage(new Error("boom"))).toBe("boom");
    expect(getErrorMessage("string failure")).toBe("string failure");
    expect(getErrorMessage({ message: "object failure" })).toBe("object failure");
    expect(getErrorMessage(null)).toBe("Unknown error");
    expect(getErrorMessage(42)).toBe("42");
  });

  it("extracts stack traces safely without any-casts", () => {
    const err = new Error("traceable");
    expect(getErrorStack(err)).toContain("traceable");
    expect(getErrorStack({ stack: "custom-stack" })).toBe("custom-stack");
    expect(getErrorStack({ message: "no-stack" })).toBeUndefined();
    expect(getErrorStack("plain")).toBeUndefined();
  });

  it("resolves HTTP status codes from HttpError, status fields, and Not Found errors", () => {
    expect(resolveErrorStatus(new HttpError(400, "bad input", { expose: true }))).toBe(400);
    expect(resolveErrorStatus({ status: 503, message: "busy" })).toBe(503);
    expect(resolveErrorStatus(new Error("Ref not found"))).toBe(404);
    expect(resolveErrorStatus(new Error("Unexpected DO crash"))).toBe(500);
  });

  it("escapes HTML in standalone fallback error documents", () => {
    const html = buildEscapedErrorHtmlDocument(
      'Error <script>alert("xss")</script>',
      'Message with <img src=x onerror="evil()"> & quotes'
    );
    expect(html).toContain("<!doctype html>");
    expect(html).not.toContain("<script>");
    expect(html).not.toContain("<img src=x");
    expect(html).toContain("&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;");
    expect(html).toContain("&lt;img src=x onerror=&quot;evil()&quot;&gt; &amp; quotes");
  });

  it("classifies expected git read-path misses separately from internal errors", () => {
    expect(isGitReadMissError(new Error("Ref not found"))).toBe(true);
    expect(isGitReadMissError(new Error("Object not found"))).toBe(true);
    expect(isGitReadMissError(new Error("Path not found"))).toBe(true);
    expect(isGitReadMissError(new Error("Path not a directory"))).toBe(true);
    expect(isGitReadMissError(new Error("Not a blob"))).toBe(true);
    expect(isGitReadMissError(new Error("R2 bucket timed out"))).toBe(false);
  });
});
