import jwt from "jsonwebtoken";
import * as dotenv from "dotenv";
dotenv.config();
if (!process.env.JWT_SECRET) {
  throw new Error(
    "JWT_SECRET environment variable is not defined.您未定义JWT_SECRET环境变量。请检查您的环境变量设置。"
  );
}

export const signToken = (payload: object) => {
  const secret = process.env.JWT_SECRET;
  return jwt.sign(payload, secret, {
    expiresIn: "7d",
  });
};

/**
 * 验证token并返回解码后的payload
 * @param token JWT token
 * @param ignoreExpiration 是否忽略过期时间
 * @returns 解码后的payload或null
 */
export const verifyToken = (
  token: string,
  ignoreExpiration: boolean = false
): any => {
  try {
    const secret = process.env.JWT_SECRET;
    return jwt.verify(token, secret, { ignoreExpiration });
  } catch (error) {
    return null;
  }
};

/**
 * 刷新token（如果token即将过期但尚未过期）
 * @param token 旧的JWT token
 * @returns 新的token或null（如果无法刷新）
 */
export const refreshToken = (token: string): string | null => {
  try {
    const secret = process.env.JWT_SECRET;
    const decoded = jwt.verify(token, secret, {
      ignoreExpiration: true,
    }) as any;

    // 检查token是否已经过期超过一定时间（比如30分钟）
    // 如果过期时间太长，不应该刷新，需要重新登录
    const now = Math.floor(Date.now() / 1000);
    const expirationTime = decoded.exp;
    const maxRefreshWindow = 30 * 60; // 30分钟

    if (expirationTime && now - expirationTime > maxRefreshWindow) {
      return null; // 过期时间太长，需要重新登录
    }

    // 移除过期时间和其他jwt属性，只保留原始payload
    const { iat, exp, ...payload } = decoded;

    // 生成新的token
    return signToken(payload);
  } catch (error) {
    return null;
  }
};
