import jwt from "jsonwebtoken";

function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error(
      "JWT_SECRET environment variable is not defined.您未定义JWT_SECRET环境变量。请检查您的环境变量设置。",
    );
  }
  return secret;
}

export const signToken = (payload: object) => {
  const secret = getJwtSecret();
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
    const secret = getJwtSecret();
    return jwt.verify(token, secret, { ignoreExpiration });
  } catch (error) {
    return null;
  }
};

/**
 * 刷新 token：仅未过期的合法 JWT 可刷新；过期须重新登录。
 */
export const refreshToken = (token: string): string | null => {
  try {
    const secret = getJwtSecret();
    const decoded = jwt.verify(token, secret, {
      ignoreExpiration: false,
    }) as any;

    if (!decoded || typeof decoded !== "object") {
      return null;
    }

    const { iat, exp, ...payload } = decoded;
    if (!payload.userId) {
      return null;
    }

    return signToken(payload);
  } catch (error) {
    return null;
  }
};
