import axios from "axios";
import jwt from "jsonwebtoken";
import {
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { createTestAgent } from "../../helpers/appFactory";
import { authHeader, createAuthUser } from "../../helpers/authFactory";
import { adminAuthHeader, seedAdmin } from "../../helpers/adminFactory";
import {
  clearTestDb,
  connectTestDb,
} from "../../helpers/db";
import { signToken } from "../../../src/utils/jwt";
import { ErrorCodes } from "../../../src/utils/response";
import { buildDefaultReadingThemeCatalog } from "../../../src/utils/readingThemeCatalog";

vi.mock("axios", () => ({
  default: vi.fn(),
  isAxiosError: vi.fn().mockReturnValue(false),
}));

describe("integration: /auth", () => {
  const agent = createTestAgent();

  beforeAll(async () => {
    await connectTestDb();
  }, 120_000);

  beforeEach(async () => {
    await clearTestDb();
    vi.mocked(axios).mockReset();
  });

  it("POST /auth/login mock 微信成功返回 token", async () => {
    vi.mocked(axios).mockResolvedValue({
      data: { openid: "wx-openid-login-001", session_key: "sk" },
    } as never);

    const res = await agent
      .post("/auth/login")
      .send({ code: "test-wx-code" })
      .expect(200);

    expect(res.body.code).toBe(0);
    expect(res.body.data.token).toBeTruthy();
    expect(res.body.data.userId).toBe("wx-openid-login-001");
    expect(axios).toHaveBeenCalled();
  });

  it("POST /auth/login 缺少 code 返回 400", async () => {
    const res = await agent.post("/auth/login").send({}).expect(400);

    expect(res.body.code).toBe(ErrorCodes.PARAM_ERROR);
  });

  it("POST /auth/refresh 有效 token 刷新成功", async () => {
    const { userId, token } = await createAuthUser({ userId: "refresh-user" });

    const res = await agent
      .post("/auth/refresh")
      .send({ token })
      .expect(200);

    expect(res.body.code).toBe(0);
    expect(res.body.data.token).toBeTruthy();

    const decoded = jwt.verify(
      res.body.data.token,
      process.env.JWT_SECRET!,
    ) as { userId: string };
    expect(decoded.userId).toBe(userId);
  });

  it("POST /auth/refresh 用户不存在返回 401", async () => {
    const token = signToken({ userId: "ghost-user" });

    const res = await agent
      .post("/auth/refresh")
      .send({ token })
      .expect(401);

    expect(res.body.code).toBe(ErrorCodes.AUTH_ERROR);
  });

  it("GET /auth/me-profile 无 token 返回 401", async () => {
    const res = await agent.get("/auth/me-profile").expect(401);

    expect(res.body.code).toBe(1002);
  });

  it("GET /auth/me-profile 有效 token 返回资料", async () => {
    const { token } = await createAuthUser({
      userId: "profile-user",
      nickname: "昵称 A",
    });

    const res = await agent
      .get("/auth/me-profile")
      .set(authHeader(token))
      .expect(200);

    expect(res.body.code).toBe(0);
    expect(res.body.data.userId).toBe("profile-user");
    expect(res.body.data.nickname).toBe("昵称 A");
    expect(res.body.data.defaultReadingStyleKey).toBeNull();
    expect(res.body.data.defaultReadingThemeId).toBeNull();
    expect(res.body.data.readingThemeApplyScope).toBe("note");
  });

  it("PUT /auth/me/reading-theme 可写入全局阅读主题", async () => {
    const { token } = await createAuthUser({ userId: "reading-theme-user" });

    const putRes = await agent
      .put("/auth/me/reading-theme")
      .set(authHeader(token))
      .send({
        defaultReadingStyleKey: "vintageJournal",
        defaultReadingThemeId: "vintage-rose",
        readingThemeApplyScope: "global",
      })
      .expect(200);

    expect(putRes.body.data.defaultReadingStyleKey).toBe("vintageJournal");
    expect(putRes.body.data.defaultReadingThemeId).toBe("vintage-rose");
    expect(putRes.body.data.readingThemeApplyScope).toBe("global");

    const getRes = await agent
      .get("/auth/me-profile")
      .set(authHeader(token))
      .expect(200);

    expect(getRes.body.data.defaultReadingStyleKey).toBe("vintageJournal");
    expect(getRes.body.data.defaultReadingThemeId).toBe("vintage-rose");
    expect(getRes.body.data.readingThemeApplyScope).toBe("global");
  });

  it("PUT /auth/me/reading-theme 可切换为仅该手帐", async () => {
    const { token } = await createAuthUser({ userId: "reading-theme-note-scope" });

    await agent
      .put("/auth/me/reading-theme")
      .set(authHeader(token))
      .send({ readingThemeApplyScope: "global" })
      .expect(200);

    const res = await agent
      .put("/auth/me/reading-theme")
      .set(authHeader(token))
      .send({ readingThemeApplyScope: "note" })
      .expect(200);

    expect(res.body.data.readingThemeApplyScope).toBe("note");
  });

  it("PUT /auth/me/reading-theme defaultReadingStyleKey null 清空 themeId", async () => {
    const { token } = await createAuthUser({ userId: "reading-theme-clear" });

    await agent
      .put("/auth/me/reading-theme")
      .set(authHeader(token))
      .send({
        defaultReadingStyleKey: "journal",
        defaultReadingThemeId: "vintage_paper",
      })
      .expect(200);

    const res = await agent
      .put("/auth/me/reading-theme")
      .set(authHeader(token))
      .send({ defaultReadingStyleKey: null })
      .expect(200);

    expect(res.body.data.defaultReadingStyleKey).toBeNull();
    expect(res.body.data.defaultReadingThemeId).toBeNull();
  });

  it("PUT /auth/me/reading-theme 非法 defaultReadingStyleKey 返回 400", async () => {
    const { token } = await createAuthUser({ userId: "reading-theme-invalid" });

    const res = await agent
      .put("/auth/me/reading-theme")
      .set(authHeader(token))
      .send({ defaultReadingStyleKey: "invalid-style" })
      .expect(400);

    expect(res.body.code).toBe(ErrorCodes.PARAM_ERROR);
  });

  it("PUT /auth/me/reading-theme 可写入 filmTravel 全局默认", async () => {
    const { token } = await createAuthUser({ userId: "reading-theme-film-travel" });

    const res = await agent
      .put("/auth/me/reading-theme")
      .set(authHeader(token))
      .send({
        defaultReadingStyleKey: "filmTravel",
        defaultReadingThemeId: "film-default",
      })
      .expect(200);

    expect(res.body.data.defaultReadingStyleKey).toBe("filmTravel");
    expect(res.body.data.defaultReadingThemeId).toBe("film-default");
  });

  it("GET /auth/me-profile 返回 readingThemeCatalog 默认为 null", async () => {
    const { token } = await createAuthUser({ userId: "catalog-default-user" });

    const res = await agent
      .get("/auth/me-profile")
      .set(authHeader(token))
      .expect(200);

    expect(res.body.data.readingThemeCatalog).toBeNull();
  });

  it("GET /auth/me-profile 返回 systemReadingThemeCatalog", async () => {
    const { token } = await createAuthUser({ userId: "system-catalog-user" });

    const res = await agent
      .get("/auth/me-profile")
      .set(authHeader(token))
      .expect(200);

    expect(res.body.data.systemReadingThemeCatalog).toBeTruthy();
    expect(res.body.data.systemReadingThemeCatalog.styleKeys[0]).toBeNull();
    expect(res.body.data.systemReadingThemeCatalog.styleKeys.length).toBeGreaterThan(1);
    expect(res.body.data.systemReadingThemeCatalog.styleKeys).toContain("filmTravel");
    expect(
      res.body.data.systemReadingThemeCatalog.themeIdsByStyle.filmTravel,
    ).toContain("film-default");
  });

  async function hideVintageRoseFromSystemCatalog() {
    const { token } = await seedAdmin();
    const defaults = buildDefaultReadingThemeCatalog();
    await agent
      .put("/admin/reading-theme-catalog")
      .set(adminAuthHeader(token))
      .send({
        styleKeys: [null, "vintageJournal"],
        themeIdsByStyle: {
          vintageJournal: defaults.themeIdsByStyle.vintageJournal.filter(
            (id) => id !== "vintage-rose",
          ),
        },
      })
      .expect(200);
  }

  it("PUT /auth/me/reading-theme-catalog 可写入并回读", async () => {
    const { token } = await createAuthUser({ userId: "catalog-user" });
    const defaults = buildDefaultReadingThemeCatalog();
    const payload = {
      styleKeys: [null, "journal", "minimalNordic"],
      themeIdsByStyle: {
        journal: defaults.themeIdsByStyle.journal.slice(0, 2),
        minimalNordic: defaults.themeIdsByStyle.minimalNordic,
      },
    };

    const putRes = await agent
      .put("/auth/me/reading-theme-catalog")
      .set(authHeader(token))
      .send(payload)
      .expect(200);

    expect(putRes.body.data.styleKeys).toEqual(payload.styleKeys);
    expect(putRes.body.data.themeIdsByStyle.journal).toEqual(
      payload.themeIdsByStyle.journal,
    );

    const getRes = await agent
      .get("/auth/me-profile")
      .set(authHeader(token))
      .expect(200);

    expect(getRes.body.data.readingThemeCatalog.styleKeys).toEqual(payload.styleKeys);
  });

  it("PUT /auth/me/reading-theme-catalog 缺少标准阅读返回 400", async () => {
    const { token } = await createAuthUser({ userId: "catalog-no-standard" });
    const defaults = buildDefaultReadingThemeCatalog();

    const res = await agent
      .put("/auth/me/reading-theme-catalog")
      .set(authHeader(token))
      .send({
        styleKeys: ["journal"],
        themeIdsByStyle: {
          journal: defaults.themeIdsByStyle.journal.slice(0, 1),
        },
      })
      .expect(400);

    expect(res.body.code).toBe(ErrorCodes.PARAM_ERROR);
  });

  it("PUT /auth/me/reading-theme-catalog 风格至少保留 1 个主题色", async () => {
    const { token } = await createAuthUser({ userId: "catalog-empty-themes" });

    const res = await agent
      .put("/auth/me/reading-theme-catalog")
      .set(authHeader(token))
      .send({
        styleKeys: [null, "journal"],
        themeIdsByStyle: { journal: [] },
      })
      .expect(400);

    expect(res.body.code).toBe(ErrorCodes.PARAM_ERROR);
  });

  it("PUT /auth/me/reading-theme-catalog 系统已隐藏的主题色返回 400", async () => {
    await hideVintageRoseFromSystemCatalog();
    const { token } = await createAuthUser({ userId: "catalog-hidden-theme" });
    const defaults = buildDefaultReadingThemeCatalog();

    const res = await agent
      .put("/auth/me/reading-theme-catalog")
      .set(authHeader(token))
      .send({
        styleKeys: [null, "vintageJournal"],
        themeIdsByStyle: {
          vintageJournal: defaults.themeIdsByStyle.vintageJournal,
        },
      })
      .expect(400);

    expect(res.body.code).toBe(ErrorCodes.PARAM_ERROR);
  });

  it("PUT /auth/me/reading-theme 系统已隐藏的主题色返回 400", async () => {
    await hideVintageRoseFromSystemCatalog();
    const { token } = await createAuthUser({ userId: "reading-theme-hidden" });

    const res = await agent
      .put("/auth/me/reading-theme")
      .set(authHeader(token))
      .send({
        defaultReadingStyleKey: "vintageJournal",
        defaultReadingThemeId: "vintage-rose",
      })
      .expect(400);

    expect(res.body.code).toBe(ErrorCodes.PARAM_ERROR);
  });

  it("PUT /auth/me/reading-theme 仅切换 scope 不因 DB 中失效 themeId 返回 400", async () => {
    await hideVintageRoseFromSystemCatalog();
    const { token } = await createAuthUser({ userId: "reading-theme-scope-only" });

    await agent
      .put("/auth/me/reading-theme")
      .set(authHeader(token))
      .send({
        defaultReadingStyleKey: "vintageJournal",
        defaultReadingThemeId: "vintage-rose",
      })
      .expect(400);

    const res = await agent
      .put("/auth/me/reading-theme")
      .set(authHeader(token))
      .send({ readingThemeApplyScope: "note" })
      .expect(200);

    expect(res.body.data.readingThemeApplyScope).toBe("note");
  });

  it("GET /auth/me-profile 返回 displayPrefs 默认值", async () => {
    const { token } = await createAuthUser({ userId: "display-prefs-default" });

    const res = await agent
      .get("/auth/me-profile")
      .set(authHeader(token))
      .expect(200);

    expect(res.body.data.displayPrefs).toEqual({
      showNoteWordCount: false,
      showReadingThemeClockTime: false,
      useLegacyNoteItem: false,
      albumCoverHighSaturation: false,
      albumCoverNoImageStyle: "dateTeaser",
    });
  });

  it("PUT /auth/me/display-preference 可部分更新", async () => {
    const { token } = await createAuthUser({ userId: "display-prefs-update" });

    const putRes = await agent
      .put("/auth/me/display-preference")
      .set(authHeader(token))
      .send({
        showNoteWordCount: true,
        albumCoverNoImageStyle: "watermark",
      })
      .expect(200);

    expect(putRes.body.data.showNoteWordCount).toBe(true);
    expect(putRes.body.data.albumCoverNoImageStyle).toBe("watermark");
    expect(putRes.body.data.useLegacyNoteItem).toBe(false);

    const getRes = await agent
      .get("/auth/me-profile")
      .set(authHeader(token))
      .expect(200);

    expect(getRes.body.data.displayPrefs.showNoteWordCount).toBe(true);
    expect(getRes.body.data.displayPrefs.albumCoverNoImageStyle).toBe("watermark");
  });

  it("PUT /auth/me/display-preference 空 body 返回 400", async () => {
    const { token } = await createAuthUser({ userId: "display-prefs-empty" });

    const res = await agent
      .put("/auth/me/display-preference")
      .set(authHeader(token))
      .send({})
      .expect(400);

    expect(res.body.code).toBe(ErrorCodes.PARAM_ERROR);
  });

  it("PUT /auth/me/display-preference 非法 albumCoverNoImageStyle 返回 400", async () => {
    const { token } = await createAuthUser({ userId: "display-prefs-invalid" });

    const res = await agent
      .put("/auth/me/display-preference")
      .set(authHeader(token))
      .send({ albumCoverNoImageStyle: "invalid" })
      .expect(400);

    expect(res.body.code).toBe(ErrorCodes.PARAM_ERROR);
  });

  it("PUT /auth/me/display-preference 无 token 返回 401", async () => {
    const res = await agent
      .put("/auth/me/display-preference")
      .send({ showNoteWordCount: true })
      .expect(401);

    expect(res.body.code).toBe(1002);
  });
});
