import bcrypt from "bcryptjs";
import Admin from "../../src/model/Admin";
import { signAdminToken } from "../../src/utils/adminJwt";
import {
  ADMIN_PAGE_GALLERY,
  ADMIN_PAGE_NOTES,
} from "../../src/constant/adminPages";
import { AdminCaptchaService } from "../../src/service/adminCaptcha.service";
import type { Agent } from "supertest";

export async function createLoginCaptcha() {
  return AdminCaptchaService.createChallengeForTest("test1");
}

export async function loginAdminAgent(
  agent: Agent,
  input?: {
    username?: string;
    password?: string;
    captchaId?: string;
    captchaCode?: string;
  },
) {
  const username = input?.username ?? process.env.ADMIN_BOOTSTRAP_USERNAME ?? "testadmin";
  const password = input?.password ?? process.env.ADMIN_BOOTSTRAP_PASSWORD ?? "testadminpass";
  let captchaId = input?.captchaId;
  let captchaCode = input?.captchaCode;
  if (!captchaId || !captchaCode) {
    const captcha = await createLoginCaptcha();
    captchaId = captcha.captchaId;
    captchaCode = captcha.captchaCode;
  }
  return agent.post("/admin/auth/login").send({
    username,
    password,
    captchaId,
    captchaCode,
  });
}

export async function seedAdmin(input?: {
  username?: string;
  password?: string;
  role?: "super" | "admin";
  allowedPages?: string[];
  disabled?: boolean;
}) {
  const username = input?.username ?? process.env.ADMIN_BOOTSTRAP_USERNAME ?? "testadmin";
  const password = input?.password ?? process.env.ADMIN_BOOTSTRAP_PASSWORD ?? "testadminpass";
  const passwordHash = await bcrypt.hash(password, 10);
  const doc = await Admin.create({
    username,
    passwordHash,
    role: input?.role ?? "super",
    allowedPages: input?.allowedPages ?? [],
    disabled: input?.disabled ?? false,
  });
  return {
    id: doc._id.toString(),
    username,
    password,
    token: signAdminToken(doc._id.toString()),
  };
}

export async function seedNotesAdmin() {
  return seedAdmin({
    username: "notes-admin",
    password: "notes-admin-pass",
    role: "admin",
    allowedPages: [ADMIN_PAGE_NOTES],
  });
}

export async function seedGalleryAdmin() {
  return seedAdmin({
    username: "gallery-admin",
    password: "gallery-admin-pass",
    role: "admin",
    allowedPages: [ADMIN_PAGE_GALLERY],
  });
}

export async function seedLimitedAdmin() {
  return seedAdmin({
    username: "limited-admin",
    password: "limited-admin-pass",
    role: "admin",
    allowedPages: [],
  });
}

export function adminAuthHeader(token: string) {
  return { Authorization: `Bearer ${token}` };
}
