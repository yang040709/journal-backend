import { signToken } from "../../src/utils/jwt";
import { seedUser } from "./seed/user.seed";

export async function createAuthUser(input?: {
  userId?: string;
  nickname?: string;
  points?: number;
}) {
  const user = await seedUser(input);
  return {
    userId: user.userId,
    token: signToken({ userId: user.userId }),
  };
}

export function authHeader(token: string) {
  return { Authorization: `Bearer ${token}` };
}
