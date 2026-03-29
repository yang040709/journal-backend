import jwt from "jsonwebtoken";
import * as dotenv from "dotenv";

dotenv.config();

export interface AdminJwtPayload {
  adminId: string;
}

function getSecret(): string {
  const secret = process.env.ADMIN_JWT_SECRET;
  if (!secret) {
    throw new Error(
      "ADMIN_JWT_SECRET environment variable is not defined. 请检查环境变量。",
    );
  }
  return secret;
}

export function signAdminToken(adminId: string): string {
  const secret = getSecret();
  const expiresIn = process.env.ADMIN_JWT_EXPIRES_IN || "7d";
  const payload: AdminJwtPayload = { adminId };
  return jwt.sign(payload, secret, { expiresIn } as jwt.SignOptions);
}

export function verifyAdminToken(token: string): AdminJwtPayload {
  const secret = getSecret();
  const decoded = jwt.verify(token, secret) as AdminJwtPayload & jwt.JwtPayload;
  if (!decoded.adminId) {
    throw new jwt.JsonWebTokenError("Invalid admin token payload");
  }
  return { adminId: decoded.adminId };
}
