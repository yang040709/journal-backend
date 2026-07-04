import { nanoid } from "nanoid";
import User from "../../../src/model/User";

export async function seedUser(input?: {
  userId?: string;
  nickname?: string;
  points?: number;
}) {
  const userId = input?.userId ?? `user-${nanoid(8)}`;
  await User.create({
    userId,
    nickname: input?.nickname ?? "测试用户",
    points: input?.points ?? 200,
    quickCovers: [],
    quickCoversUpdatedAt: new Date(),
  });
  return { userId };
}
