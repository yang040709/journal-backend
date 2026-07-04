import jwt from "jsonwebtoken";
import { beforeEach, describe, expect, it } from "vitest";
import {
  signAdminToken,
  verifyAdminToken,
} from "../../../src/utils/adminJwt";

const TEST_ADMIN_SECRET = "test-admin-jwt-secret-different-key!!";

describe("adminJwt utils", () => {
  beforeEach(() => {
    process.env.ADMIN_JWT_SECRET = TEST_ADMIN_SECRET;
    delete process.env.ADMIN_JWT_EXPIRES_IN;
  });

  it("signAdminToken 与 verifyAdminToken 可往返解码", () => {
    const token = signAdminToken("admin-id-1");
    expect(verifyAdminToken(token)).toEqual({ adminId: "admin-id-1" });
  });

  it("错误 secret 时 verifyAdminToken 抛出 JsonWebTokenError", () => {
    const token = signAdminToken("admin-id-1");
    process.env.ADMIN_JWT_SECRET = "another-admin-secret-long-enough!!";
    expect(() => verifyAdminToken(token)).toThrow(jwt.JsonWebTokenError);
  });

  it("过期 token 时 verifyAdminToken 抛出 TokenExpiredError", () => {
    const token = jwt.sign({ adminId: "admin-id-1" }, TEST_ADMIN_SECRET, {
      expiresIn: "-1s",
    });
    expect(() => verifyAdminToken(token)).toThrow(jwt.TokenExpiredError);
  });

  it("payload 缺少 adminId 时抛出 JsonWebTokenError", () => {
    const token = jwt.sign({ sub: "no-admin-id" }, TEST_ADMIN_SECRET, {
      expiresIn: "1h",
    });
    expect(() => verifyAdminToken(token)).toThrow(jwt.JsonWebTokenError);
  });

  it("缺少 ADMIN_JWT_SECRET 时 signAdminToken 抛出错误", () => {
    delete process.env.ADMIN_JWT_SECRET;
    expect(() => signAdminToken("admin-id-1")).toThrow("ADMIN_JWT_SECRET");
  });
});
