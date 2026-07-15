import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { clearTestDb, connectTestDb } from "../../helpers/db";
import { seedUser } from "../../helpers/seed/user.seed";
import { seedNoteBook } from "../../helpers/seed/notebook.seed";
import { seedNote } from "../../helpers/seed/note.seed";
import { UserService } from "../../../src/service/user.service";

vi.mock("axios", () => ({
  default: Object.assign(vi.fn(), {
    isAxiosError: (e: unknown) => Boolean((e as { isAxiosError?: boolean })?.isAxiosError),
  }),
}));

vi.mock("../../../src/config/wechatEnv", () => ({
  getWeChatAppId: () => "wx-app",
  getWeChatSecret: () => "wx-secret",
}));

vi.mock("../../../src/service/cover.service", () => ({
  CoverService: {
    getSystemCovers: vi.fn(async () => ["c1", "c2", "c3"]),
  },
}));

vi.mock("../../../src/service/initialUserNotebookConfig.service", () => ({
  InitialUserNotebookConfigService: {
    resolveTemplatesForNewUser: vi.fn(async () => [
      { title: "默认本", coverImg: "cover.png" },
    ]),
  },
}));

vi.mock("../../../src/service/initialUserNoteSeedConfig.service", () => ({
  InitialUserNoteSeedConfigService: {
    resolveTemplatesForNewUser: vi.fn(async () => []),
  },
}));

import axios from "axios";

describe("unit: UserService branch coverage", () => {
  beforeAll(async () => {
    await connectTestDb();
  }, 120_000);

  beforeEach(async () => {
    await clearTestDb();
    vi.mocked(axios as unknown as ReturnType<typeof vi.fn>).mockReset();
  });

  it("login 新用户/老用户；微信失败分支", async () => {
    vi.mocked(axios as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      data: { openid: "login-new-u" },
    });
    const created = await UserService.login("code-new");
    expect(created.userId).toBe("login-new-u");
    expect(created.token).toBeTruthy();

    vi.mocked(axios as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      data: { openid: "login-new-u" },
    });
    const again = await UserService.login("code-old");
    expect(again.userId).toBe("login-new-u");

    vi.mocked(axios as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      data: {},
    });
    await expect(UserService.login("bad")).rejects.toThrow(/登录失败/);

    const timeoutErr = Object.assign(new Error("timeout"), {
      isAxiosError: true,
      code: "ECONNABORTED",
    });
    vi.mocked(axios as unknown as ReturnType<typeof vi.fn>).mockRejectedValueOnce(timeoutErr);
    await expect(UserService.login("timeout")).rejects.toThrow(/超时|登录失败/);
  });

  it("getMeProfile/stats/update profile/theme/displayPrefs", async () => {
    const { userId } = await seedUser({ userId: "me-u1", points: 10 });
    const book = await seedNoteBook(userId, "本");
    await seedNote({ userId, noteBookId: book.id, title: "n", content: "c" });

    const info = await UserService.getUserInfo(userId);
    expect(info.userId).toBe(userId);

    const profile = await UserService.getMeProfile(userId);
    expect(profile.userId).toBe(userId);

    const stats = await UserService.getMeStats(userId);
    expect(stats.notebookCount).toBeGreaterThanOrEqual(1);
    expect(stats.noteCount).toBeGreaterThanOrEqual(1);

    const updated = await UserService.updateMeProfile(userId, {
      nickname: "新昵称",
      bio: "简介",
      avatarUrl: "https://cdn/a.png",
    });
    expect(updated.nickname).toBe("新昵称");

    await UserService.updateDisplayPreference(userId, {
      showNoteWordCount: false,
      showReadingThemeClockTime: true,
      useLegacyNoteItem: false,
      albumCoverHighSaturation: true,
      albumCoverNoImageStyle: "watermark",
    });

    expect(await UserService.validateUser(userId)).toBe(true);
    expect(await UserService.validateUser("missing")).toBe(false);

    UserService.recordClientSession(userId);

    await expect(UserService.getUserInfo("missing-me")).rejects.toThrow();
    await expect(UserService.getMeProfile("missing-me")).rejects.toThrow();
    await expect(UserService.updateMeProfile("missing-me", { nickname: "x" })).rejects.toThrow();

    const themed = await UserService.updateMeProfile(userId, {
      defaultReadingThemeId: "builtin-classic",
      readingThemeApplyScope: "note",
    });
    expect(themed).toBeTruthy();

    await UserService.updateDisplayPreference(userId, {
      showNoteWordCount: true,
      showReadingThemeClockTime: false,
      useLegacyNoteItem: true,
      albumCoverHighSaturation: false,
      albumCoverNoImageStyle: "plain",
    });
  });
});
