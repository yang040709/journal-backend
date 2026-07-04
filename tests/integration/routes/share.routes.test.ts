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
import { clearTestDb, connectTestDb } from "../../helpers/db";
import { seedNote } from "../../helpers/seed/note.seed";
import { seedNoteBook } from "../../helpers/seed/notebook.seed";
import { ErrorCodes } from "../../../src/utils/response";

vi.mock("../../../src/service/shareSecurityTask.service", () => ({
  ShareSecurityTaskService: {
    getLatestRiskSummary: vi.fn().mockResolvedValue({
      riskStatus: "pass",
      riskMessage: "",
    }),
    enqueueWeChatChecks: vi.fn().mockResolvedValue(undefined),
    recordLocalReject: vi.fn().mockResolvedValue(undefined),
  },
}));

describe("integration: /share", () => {
  const agent = createTestAgent();

  beforeAll(async () => {
    await connectTestDb();
  }, 120_000);

  beforeEach(async () => {
    await clearTestDb();
  });

  it("GET /share/:shareId 匿名可读已分享手帐", async () => {
    const { userId } = await createAuthUser({ userId: "share-owner" });
    const book = await seedNoteBook(userId);
    const note = await seedNote({
      userId,
      noteBookId: book.id,
      title: "公开手帐",
      content: "分享内容",
      shareId: "share-public-001",
      isShare: true,
    });

    const res = await agent.get(`/share/${note.shareId}`).expect(200);

    expect(res.body.code).toBe(0);
    expect(res.body.data.title).toBe("公开手帐");
    expect(res.body.data.isOwner).toBe(false);
  });

  it("GET /share/:shareId 不存在返回 404", async () => {
    const res = await agent.get("/share/not-exists-id").expect(404);

    expect(res.body.code).toBe(ErrorCodes.SHARE_NOT_FOUND);
  });

  it("POST /share/notes/:id/share 登录用户可开启分享", async () => {
    const { token, userId } = await createAuthUser();
    const book = await seedNoteBook(userId);
    const note = await seedNote({
      userId,
      noteBookId: book.id,
      title: "待分享",
      content: "干净内容",
    });

    const res = await agent
      .post(`/share/notes/${note.id}/share`)
      .set(authHeader(token))
      .send({ share: true })
      .expect(200);

    expect(res.body.code).toBe(0);
    expect(res.body.data.isShare).toBe(true);
    expect(res.body.data.shareId).toBeTruthy();
  });
});
