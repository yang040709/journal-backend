import crypto from "crypto";
import { nanoid } from "nanoid";
import svgCaptcha from "svg-captcha";
import mongoose from "mongoose";
import AdminCaptchaChallenge from "../model/AdminCaptchaChallenge";
import {
  getAdminLoginCaptchaCreateIpLimit,
  getAdminLoginCaptchaStore,
  getAdminLoginCaptchaTtlSeconds,
} from "../config/adminLoginEnv";
import { AdminCaptchaError } from "../errors/adminLogin.errors";
import { AdminLoginRateLimitService } from "./adminLoginRateLimit.service";

type MemoryEntry = {
  answerHash: string;
  expiresAt: number;
};

const memoryStore = new Map<string, MemoryEntry>();

function hashCaptchaAnswer(answer: string): string {
  const normalized = answer.trim().toLowerCase();
  return crypto.createHash("sha256").update(normalized).digest("hex");
}

function useMongoStore(): boolean {
  const mode = getAdminLoginCaptchaStore();
  if (mode === "memory") return false;
  if (mode === "mongo") return true;
  return mongoose.connection.readyState === 1;
}

function purgeExpiredMemoryEntries(now = Date.now()): void {
  for (const [id, entry] of memoryStore.entries()) {
    if (entry.expiresAt <= now) {
      memoryStore.delete(id);
    }
  }
}

export class AdminCaptchaService {
  static async createChallenge(clientIp: string): Promise<{
    captchaId: string;
    imageBase64: string;
    expiresIn: number;
  }> {
    AdminLoginRateLimitService.consumeCaptchaCreateIpLimit(clientIp);

    const captcha = svgCaptcha.create({
      size: 4,
      noise: 2,
      color: true,
      background: "#f8fafc",
      ignoreChars: "0oO1ilI",
    });

    const captchaId = nanoid(24);
    const answerHash = hashCaptchaAnswer(captcha.text);
    const ttlSeconds = getAdminLoginCaptchaTtlSeconds();
    const expiresAt = new Date(Date.now() + ttlSeconds * 1000);

    if (useMongoStore()) {
      await AdminCaptchaChallenge.create({
        captchaId,
        answerHash,
        expiresAt,
      });
    } else {
      purgeExpiredMemoryEntries();
      memoryStore.set(captchaId, {
        answerHash,
        expiresAt: expiresAt.getTime(),
      });
    }

    const svgBase64 = Buffer.from(captcha.data, "utf8").toString("base64");
    return {
      captchaId,
      imageBase64: `data:image/svg+xml;base64,${svgBase64}`,
      expiresIn: ttlSeconds,
    };
  }

  static async verifyAndConsume(captchaId: string, code: string): Promise<void> {
    const id = captchaId.trim();
    const inputHash = hashCaptchaAnswer(code);
    if (!id) {
      throw new AdminCaptchaError();
    }

    if (useMongoStore()) {
      const doc = await AdminCaptchaChallenge.findOneAndDelete({ captchaId: id }).lean();
      if (!doc || doc.expiresAt.getTime() <= Date.now()) {
        throw new AdminCaptchaError();
      }
      if (doc.answerHash !== inputHash) {
        throw new AdminCaptchaError();
      }
      return;
    }

    purgeExpiredMemoryEntries();
    const entry = memoryStore.get(id);
    memoryStore.delete(id);
    if (!entry || entry.expiresAt <= Date.now() || entry.answerHash !== inputHash) {
      throw new AdminCaptchaError();
    }
  }

  /** 仅测试环境：注入已知答案的验证码 */
  static async createChallengeForTest(
    plainAnswer: string,
  ): Promise<{ captchaId: string; captchaCode: string }> {
    if (process.env.NODE_ENV !== "test") {
      throw new Error("createChallengeForTest is only available in test");
    }
    const captchaId = nanoid(24);
    const answerHash = hashCaptchaAnswer(plainAnswer);
    const ttlSeconds = getAdminLoginCaptchaTtlSeconds();
    const expiresAt = new Date(Date.now() + ttlSeconds * 1000);

    if (useMongoStore()) {
      await AdminCaptchaChallenge.create({
        captchaId,
        answerHash,
        expiresAt,
      });
    } else {
      memoryStore.set(captchaId, {
        answerHash,
        expiresAt: expiresAt.getTime(),
      });
    }

    return { captchaId, captchaCode: plainAnswer };
  }

  /** 测试清理 */
  static resetForTest(): void {
    memoryStore.clear();
  }
}
