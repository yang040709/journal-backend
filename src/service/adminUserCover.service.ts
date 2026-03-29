import User from "../model/User";
import { CoverService } from "./cover.service";

export class AdminUserCoverService {
  static async getUserByMongoIdOrThrow(mongoId: string) {
    const user = await User.findById(mongoId).lean();
    if (!user) {
      throw new Error("用户不存在");
    }
    return user;
  }

  static async getCoversPayload(mongoUserId: string) {
    const user = await this.getUserByMongoIdOrThrow(mongoUserId);
    const customCovers = Array.isArray((user as any).customCovers)
      ? (user as any).customCovers
      : [];
    const normalized = customCovers.map((item: any) =>
      CoverService.normalizeCustomCoverItem(item),
    );
    return {
      userId: user.userId,
      mongoId: user._id.toString(),
      quickCovers: Array.isArray(user.quickCovers) ? user.quickCovers : [],
      quickCoversUpdatedAt: user.quickCoversUpdatedAt ?? null,
      customCovers: normalized,
    };
  }

  static async replaceQuickCovers(mongoUserId: string, covers: string[]) {
    const user = await User.findById(mongoUserId);
    if (!user) {
      throw new Error("用户不存在");
    }
    const list = CoverService.validateAdminQuickCoversInput(covers);
    user.quickCovers = list;
    user.quickCoversUpdatedAt = new Date();
    await user.save();
    return {
      quickCovers: user.quickCovers,
      quickCoversUpdatedAt: user.quickCoversUpdatedAt,
    };
  }

  static async addCustomCover(
    mongoUserId: string,
    body: { coverUrl: string; thumbUrl?: string; thumbKey?: string },
  ) {
    const user = await this.getUserByMongoIdOrThrow(mongoUserId);
    return CoverService.addUserCustomCover(user.userId, body);
  }

  static async updateCustomCover(
    mongoUserId: string,
    coverId: string,
    body: { coverUrl: string; thumbUrl?: string; thumbKey?: string },
  ) {
    const user = await this.getUserByMongoIdOrThrow(mongoUserId);
    return CoverService.updateUserCustomCover(user.userId, coverId, body);
  }

  static async deleteCustomCover(mongoUserId: string, coverId: string) {
    const user = await this.getUserByMongoIdOrThrow(mongoUserId);
    return CoverService.deleteUserCustomCover(user.userId, coverId);
  }
}
