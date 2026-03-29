import bcrypt from "bcryptjs";
import Admin, { AdminRole, IAdmin } from "../model/Admin";
import { signAdminToken } from "../utils/adminJwt";
import {
  ASSIGNABLE_ADMIN_PAGES,
  isAssignablePage,
} from "../constant/adminPages";
import {
  getEffectiveAllowedPages,
  AdminState,
} from "../middlewares/adminAuth.middleware";

const LOGIN_WINDOW_MS = 60_000;
const LOGIN_MAX_ATTEMPTS = 30;
const loginBuckets = new Map<string, { count: number; windowStart: number }>();

function consumeLoginAttempt(key: string): boolean {
  const now = Date.now();
  let b = loginBuckets.get(key);
  if (!b || now - b.windowStart > LOGIN_WINDOW_MS) {
    b = { count: 0, windowStart: now };
    loginBuckets.set(key, b);
  }
  b.count += 1;
  return b.count <= LOGIN_MAX_ATTEMPTS;
}

function normalizeAssignablePages(pages: string[]): string[] {
  const set = new Set<string>();
  for (const p of pages) {
    if (isAssignablePage(p)) {
      set.add(p);
    }
  }
  return [...set];
}

export class AdminAccountService {
  static async login(
    username: string,
    password: string,
    clientKey: string,
  ): Promise<{ token: string; admin: ReturnType<typeof AdminAccountService.toPublicAdmin> }> {
    const rateKey = `${clientKey}:${username}`;
    if (!consumeLoginAttempt(rateKey)) {
      throw new Error("登录尝试过于频繁，请稍后再试");
    }

    const doc = await Admin.findOne({
      username: username.trim(),
    });
    if (!doc || doc.disabled) {
      throw new Error("用户名或密码错误");
    }

    const ok = await bcrypt.compare(password, doc.passwordHash);
    if (!ok) {
      throw new Error("用户名或密码错误");
    }

    const token = signAdminToken(doc._id.toString());
    const state: AdminState = {
      id: doc._id.toString(),
      username: doc.username,
      role: doc.role,
      allowedPages: doc.allowedPages || [],
    };
    return {
      token,
      admin: AdminAccountService.toPublicAdmin(state),
    };
  }

  static toPublicAdmin(admin: AdminState) {
    return {
      id: admin.id,
      username: admin.username,
      role: admin.role,
      allowedPages: getEffectiveAllowedPages(admin),
    };
  }

  static async listAdmins(
    page = 1,
    limit = 20,
  ): Promise<{ items: ReturnType<typeof AdminAccountService.serializeAdminDoc>[]; total: number }> {
    const p = Math.max(1, page);
    const l = Math.min(100, Math.max(1, limit));
    const skip = (p - 1) * l;
    const [items, total] = await Promise.all([
      Admin.find().sort({ createdAt: -1 }).skip(skip).limit(l).lean(),
      Admin.countDocuments(),
    ]);
    return {
      items: items.map((x) => AdminAccountService.serializeAdminDoc(x)),
      total,
    };
  }

  static serializeAdminDoc(doc: {
    _id: { toString: () => string };
    username: string;
    role: AdminRole;
    allowedPages?: string[];
    disabled?: boolean;
    createdAt?: Date;
    updatedAt?: Date;
  }) {
    const state: AdminState = {
      id: doc._id.toString(),
      username: doc.username,
      role: doc.role,
      allowedPages: doc.allowedPages || [],
    };
    return {
      id: state.id,
      username: state.username,
      role: state.role,
      allowedPages: getEffectiveAllowedPages(state),
      rawAllowedPages: doc.role === "admin" ? doc.allowedPages || [] : [],
      disabled: doc.disabled ?? false,
      createdAt: doc.createdAt,
      updatedAt: doc.updatedAt,
    };
  }

  static async createAdmin(data: {
    username: string;
    password: string;
    allowedPages: string[];
  }): Promise<IAdmin> {
    const username = data.username.trim();
    if (username.length < 2) {
      throw new Error("用户名至少 2 个字符");
    }
    if (data.password.length < 6) {
      throw new Error("密码至少 6 位");
    }
    const exists = await Admin.findOne({ username });
    if (exists) {
      throw new Error("用户名已存在");
    }
    const passwordHash = await bcrypt.hash(data.password, 10);
    const pages = normalizeAssignablePages(data.allowedPages);
    return Admin.create({
      username,
      passwordHash,
      role: "admin",
      allowedPages: pages,
      disabled: false,
    });
  }

  static async updateAdmin(
    id: string,
    data: {
      password?: string;
      allowedPages?: string[];
      disabled?: boolean;
    },
  ): Promise<IAdmin | null> {
    const doc = await Admin.findById(id);
    if (!doc) {
      return null;
    }
    if (doc.role === "super") {
      if (data.password !== undefined && data.password.length > 0) {
        doc.passwordHash = await bcrypt.hash(data.password, 10);
      }
      if (data.disabled === true) {
        throw new Error("不能禁用超级管理员");
      }
      await doc.save();
      return doc;
    }

    if (data.password !== undefined && data.password.length > 0) {
      if (data.password.length < 6) {
        throw new Error("密码至少 6 位");
      }
      doc.passwordHash = await bcrypt.hash(data.password, 10);
    }
    if (data.allowedPages !== undefined) {
      doc.allowedPages = normalizeAssignablePages(data.allowedPages);
    }
    if (data.disabled !== undefined) {
      doc.disabled = data.disabled;
    }
    await doc.save();
    return doc;
  }

  static async deleteAdmin(id: string): Promise<boolean> {
    const doc = await Admin.findById(id);
    if (!doc) {
      return false;
    }
    if (doc.role === "super") {
      throw new Error("不能删除超级管理员");
    }
    await Admin.deleteOne({ _id: id });
    return true;
  }

  static validateAssignablePagesInput(pages: unknown): string[] {
    if (!Array.isArray(pages)) {
      return [];
    }
    return normalizeAssignablePages(pages.filter((x) => typeof x === "string"));
  }
}
