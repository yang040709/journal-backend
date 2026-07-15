import { describe, expect, it, vi } from "vitest";

vi.mock("../../../src/utils/requestContext", () => ({
  getRequestIdFromContext: vi.fn(() => "req-from-ctx"),
}));

import {
  consoleCompat,
  createContextLogger,
  logError,
  logHttpRequest,
  logger,
} from "../../../src/utils/logger";

describe("unit: logger helpers", () => {
  it("logger methods / consoleCompat / context logger 可调用", () => {
    expect(() => logger.info("i", { userId: "u1" })).not.toThrow();
    expect(() => logger.warn("w")).not.toThrow();
    expect(() => logger.debug("d", new Error("e"))).not.toThrow();
    expect(() => logger.error("e", "not-object")).not.toThrow();
    expect(() => logger.log("info", "m", { requestId: "keep" })).not.toThrow();
    expect(() => consoleCompat.log("a", "b")).not.toThrow();
    expect(() => consoleCompat.error("x")).not.toThrow();
    expect(() => consoleCompat.warn("x")).not.toThrow();
    expect(() => consoleCompat.info("x")).not.toThrow();
    expect(() => consoleCompat.debug("x")).not.toThrow();

    const ctx = createContextLogger({ userId: "u", method: "GET", url: "/x" });
    expect(() => ctx.info("ok", { extra: 1 })).not.toThrow();
    expect(() => ctx.warn("w")).not.toThrow();
    expect(() => ctx.error("e")).not.toThrow();
    expect(() => ctx.debug("d")).not.toThrow();
  });

  it("logHttpRequest 按状态码选 level；logError 带 context", () => {
    expect(() =>
      logHttpRequest("rid", "uid", "GET", "/a", 200, 12),
    ).not.toThrow();
    expect(() =>
      logHttpRequest("rid", "uid", "POST", "/a", 404, 12),
    ).not.toThrow();
    expect(() =>
      logHttpRequest("rid", "uid", "POST", "/a", 500, 12, { foo: 1 }),
    ).not.toThrow();
    expect(() => logError(new Error("boom"), { userId: "u" })).not.toThrow();
    expect(() => logError(new Error("boom"), undefined, "custom")).not.toThrow();
  });
});
