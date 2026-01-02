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
