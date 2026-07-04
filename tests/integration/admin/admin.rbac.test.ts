import STS from "qcloud-cos-sts";
import {
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { createTestAgent } from "../../helpers/appFactory";
import {
  adminAuthHeader,
  seedAdmin,
  seedGalleryAdmin,
  seedLimitedAdmin,
  seedNotesAdmin,
} from "../../helpers/adminFactory";
import { clearTestDb, connectTestDb } from "../../helpers/db";
import { ErrorCodes } from "../../../src/utils/response";

vi.mock("qcloud-cos-sts", () => ({
  default: {
    getCredential: vi.fn(),
  },
}));

const stsPayload = {
  expiredTime: Math.floor(Date.now() / 1000) + 1800,
  credentials: {
    tmpSecretId: "tmp-id",
    tmpSecretKey: "tmp-key",
    sessionToken: "tmp-token",
  },
};

describe("integration: admin RBAC", () => {
  const agent = createTestAgent();

  beforeAll(async () => {
    await connectTestDb();
  }, 120_000);

  beforeEach(async () => {
    await clearTestDb();
    vi.mocked(STS.getCredential).mockReset();
    vi.mocked(STS.getCredential).mockResolvedValue(stsPayload as never);
  });

  it("super GET /admin/stats/overview 成功", async () => {
    const { token } = await seedAdmin();

    const res = await agent
      .get("/admin/stats/overview")
      .set(adminAuthHeader(token))
      .expect(200);

    expect(res.body.code).toBe(0);
    expect(res.body.data).toBeTruthy();
  });

  it("普通 admin GET /admin/stats/overview 返回 403", async () => {
    const { token } = await seedNotesAdmin();

    const res = await agent
      .get("/admin/stats/overview")
      .set(adminAuthHeader(token))
      .expect(403);

    expect(res.body.code).toBe(ErrorCodes.PERMISSION_ERROR);
  });

  it("有 notes 权限的 admin GET /admin/notes 成功", async () => {
    const { token } = await seedNotesAdmin();

    const res = await agent
      .get("/admin/notes")
      .query({ page: 1, limit: 10 })
      .set(adminAuthHeader(token))
      .expect(200);

    expect(res.body.code).toBe(0);
    expect(Array.isArray(res.body.data.items)).toBe(true);
  });

  it("无 notes 权限的 admin GET /admin/notes 返回 403", async () => {
    const { token } = await seedLimitedAdmin();

    const res = await agent
      .get("/admin/notes")
      .query({ page: 1, limit: 10 })
      .set(adminAuthHeader(token))
      .expect(403);

    expect(res.body.code).toBe(ErrorCodes.PERMISSION_ERROR);
  });

  it("super GET /admin/admins 成功", async () => {
    const { token } = await seedAdmin();

    const res = await agent
      .get("/admin/admins")
      .query({ page: 1, limit: 10 })
      .set(adminAuthHeader(token))
      .expect(200);

    expect(res.body.code).toBe(0);
    expect(Array.isArray(res.body.data.items)).toBe(true);
  });

  it("普通 admin GET /admin/admins 返回 403", async () => {
    const { token } = await seedNotesAdmin();

    const res = await agent
      .get("/admin/admins")
      .query({ page: 1, limit: 10 })
      .set(adminAuthHeader(token))
      .expect(403);

    expect(res.body.code).toBe(ErrorCodes.PERMISSION_ERROR);
  });

  it("有 gallery 权限 POST /admin/gallery/cos/sts mock COS 成功", async () => {
    const { token } = await seedGalleryAdmin();

    const res = await agent
      .post("/admin/gallery/cos/sts")
      .set(adminAuthHeader(token))
      .send({
        biz: "system_cover",
        fileName: "cover.jpg",
        fileType: "image/jpeg",
        fileSize: 2048,
      })
      .expect(200);

    expect(res.body.code).toBe(0);
    expect(res.body.data.key).toBeTruthy();
    expect(STS.getCredential).toHaveBeenCalledOnce();
  });
});
