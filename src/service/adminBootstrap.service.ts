import bcrypt from "bcryptjs";
import Admin from "../model/Admin";

/**
 * 若库中尚无超级管理员，且配置了 ADMIN_BOOTSTRAP_USERNAME / ADMIN_BOOTSTRAP_PASSWORD，则创建一条 super 记录。
 */
export async function ensureAdminBootstrap(): Promise<void> {
  const existingSuper = await Admin.findOne({ role: "super" }).lean();
  if (existingSuper) {
    return;
  }

  const username =
    process.env.ADMIN_BOOTSTRAP_USERNAME?.trim() || "admin";
  let password = process.env.ADMIN_BOOTSTRAP_PASSWORD;
  if (
    (!password || password.length < 1) &&
    process.env.NODE_ENV !== "production"
  ) {
    password = "123456";
  }
  if (!password || password.length < 1) {
    console.warn(
      "[Admin] 生产环境须配置 ADMIN_BOOTSTRAP_PASSWORD，跳过超级管理员种子初始化",
    );
    return;
  }

  const passwordHash = await bcrypt.hash(password, 10);
  await Admin.create({
    username,
    passwordHash,
    role: "super",
    allowedPages: [],
    disabled: false,
  });
  console.log(`[Admin] 已创建初始超级管理员: ${username}`);
}
