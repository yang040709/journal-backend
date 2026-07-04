import UserUploadQuotaDaily from "../../../src/model/UserUploadQuotaDaily";
import { getQuotaDateContext } from "../../../src/utils/dateKey";

export async function seedUploadQuotaExhausted(userId: string) {
  const { dateKey } = getQuotaDateContext();
  await UserUploadQuotaDaily.create({
    userId,
    dateKey,
    usedCount: 9,
    baseLimit: 9,
    extraQuota: 0,
    bizBreakdown: {
      note: 9,
      cover: 0,
      avatar: 0,
    },
  });
}
