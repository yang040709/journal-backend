import { describe, expect, it } from "vitest";
import {
  getRequestIdFromContext,
  runWithRequestContext,
} from "../../../src/utils/requestContext";

describe("requestContext", () => {
  it("runWithRequestContext 内可读取 requestId", async () => {
    await runWithRequestContext(
      { requestId: "front_ctx_abc" },
      async () => {
        expect(getRequestIdFromContext()).toBe("front_ctx_abc");
      },
    );
  });

  it("上下文外返回 unknown", () => {
    expect(getRequestIdFromContext()).toBe("unknown");
  });
});
