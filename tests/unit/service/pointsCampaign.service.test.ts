import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { clearTestDb, connectTestDb } from "../../helpers/db";
import { seedUser } from "../../helpers/seed/user.seed";
import PointsCampaign from "../../../src/model/PointsCampaign";
import PointsCampaignClaim from "../../../src/model/PointsCampaignClaim";
import PointsLedger from "../../../src/model/PointsLedger";
import User from "../../../src/model/User";

const putObject = vi.fn();
const axiosGet = vi.fn();
const axiosPost = vi.fn();

vi.mock("cos-nodejs-sdk-v5", () => ({
  default: class CosMock {
    putObject = putObject;
  },
}));

vi.mock("axios", () => ({
  default: {
    get: (...args: unknown[]) => axiosGet(...args),
    post: (...args: unknown[]) => axiosPost(...args),
  },
}));

import {
  CampaignAlreadyClaimedError,
  CampaignEndedError,
  CampaignNotFoundError,
  CampaignNotPublishedError,
  CampaignNotStartedError,
  CampaignSoldOutError,
  PointsCampaignService,
} from "../../../src/service/pointsCampaign.service";

const COS_ENV_KEYS = [
  "COS_SECRET_ID",
  "COS_SECRET_KEY",
  "COS_BUCKET",
  "COS_REGION",
  "COS_PUBLIC_DOMAIN",
  "COS_UPLOAD_DIR",
  "WX_APPID",
  "WX_SECRET",
  "HTTP_PROXY",
  "HTTPS_PROXY",
] as const;

describe("unit: PointsCampaignService", () => {
  const admin = { id: "a1", username: "admin" };
  const envBackup: Record<string, string | undefined> = {};

  beforeAll(async () => {
    await connectTestDb();
  }, 120_000);

  beforeEach(async () => {
    await clearTestDb();
    putObject.mockReset();
    axiosGet.mockReset();
    axiosPost.mockReset();
    for (const k of COS_ENV_KEYS) {
      if (!(k in envBackup)) envBackup[k] = process.env[k];
    }
    process.env.COS_SECRET_ID = "sid";
    process.env.COS_SECRET_KEY = "skey";
    process.env.COS_BUCKET = "bucket-125000";
    process.env.COS_REGION = "ap-guangzhou";
    process.env.COS_PUBLIC_DOMAIN = "https://cdn.example.com";
    process.env.COS_UPLOAD_DIR = "journal";
    process.env.WX_APPID = "wx-app";
    process.env.WX_SECRET = "wx-secret";
    putObject.mockImplementation((_opts: unknown, cb: (err: Error | null) => void) => {
      cb(null);
    });
  });

  afterEach(() => {
    for (const k of COS_ENV_KEYS) {
      if (envBackup[k] === undefined) delete process.env[k];
      else process.env[k] = envBackup[k];
    }
  });

  function mockWeChatTokenOk(token = "tok-1") {
    axiosGet.mockResolvedValue({
      data: { access_token: token, expires_in: 7200 },
    });
  }

  function mockWeChatCodesOk() {
    mockWeChatTokenOk();
    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    axiosPost.mockResolvedValue({ data: png });
  }

  /** 模块内微信 token 缓存未导出，通过拨快时钟强制下次重新拉取 */
  async function withBustedWxTokenCache<T>(fn: () => Promise<T>): Promise<T> {
    const base = Date.now();
    const spy = vi.spyOn(Date, "now").mockImplementation(() => base + 9_000_000);
    try {
      return await fn();
    } finally {
      spy.mockRestore();
    }
  }

  async function createDraft(overrides: Record<string, unknown> = {}) {
    const startAt = (overrides.startAt as Date) || new Date(Date.now() - 60_000);
    const endAt = (overrides.endAt as Date) || new Date(Date.now() + 86_400_000);
    const created = await PointsCampaignService.createCampaign(
      {
        name: String(overrides.name || "活动"),
        description: String(overrides.description ?? "desc"),
        pointValue: Number(overrides.pointValue ?? 50),
        quota: Number(overrides.quota ?? 10),
        startAt,
        endAt,
        successCopy: String(overrides.successCopy ?? "ok"),
        channelRemark: String(overrides.channelRemark ?? "ch"),
      },
      admin,
      "req-create",
    );
    return created;
  }

  async function publishViaDb(
    id: string,
    patch: Record<string, unknown> = {},
  ) {
    await PointsCampaign.updateOne(
      { _id: id },
      {
        $set: {
          status: "published",
          claimedCount: 0,
          miniCodeUrl: "https://cdn.example/m.png",
          qrCodeUrl: "https://cdn.example/q.png",
          ...patch,
        },
      },
    );
  }

  it("create/更新/列表/下线/用户侧状态（不走微信码）", async () => {
    const { userId } = await seedUser({ userId: "camp-u1" });
    const startAt = new Date(Date.now() - 60_000);
    const endAt = new Date(Date.now() + 86_400_000);

    const created = await PointsCampaignService.createCampaign(
      {
        name: " 春日活动 ",
        description: "desc",
        pointValue: 50,
        quota: 10,
        startAt,
        endAt,
        successCopy: "ok",
        channelRemark: "ch",
      },
      admin,
      "req-1",
    );
    expect(created.displayStatus).toBe("offline");
    expect(created.name).toBe("春日活动");

    const updated = await PointsCampaignService.updateCampaign(
      String(created.id),
      {
        name: "春日活动2",
        description: "d2",
        pointValue: 80,
        quota: 5,
        startAt,
        endAt,
        successCopy: "ok2",
        channelRemark: "ch2",
      },
      admin,
      "req-2",
    );
    expect(updated.name).toBe("春日活动2");
    expect(updated.pointValue).toBe(80);

    await expect(
      PointsCampaignService.updateCampaign(
        String(created.id),
        { startAt: endAt, endAt: startAt },
        admin,
        "req-bad",
      ),
    ).rejects.toThrow(/结束时间/);

    const listed = await PointsCampaignService.listCampaigns({
      page: 1,
      limit: 10,
      status: "draft",
      keyword: "春日",
    });
    expect(listed.total).toBe(1);

    await publishViaDb(String(created.id));

    const forAdmin = await PointsCampaignService.getCampaignForAdmin(
      String(created.id),
    );
    expect(forAdmin.displayStatus).toBe("claimable");

    const forUser = await PointsCampaignService.getCampaignForUser(
      String(created.id),
      userId,
    );
    expect(forUser.displayStatus).toBe("claimable");

    const claims = await PointsCampaignService.listCampaignClaims(
      String(created.id),
      1,
      10,
    );
    expect(claims.total).toBe(0);

    const offline = await PointsCampaignService.offlineCampaign(
      String(created.id),
      admin,
      "req-3",
    );
    expect(offline.status).toBe("offline");
    expect(offline.displayStatus).toBe("offline");

    await expect(
      PointsCampaignService.getCampaignForAdmin("000000000000000000000000"),
    ).rejects.toBeInstanceOf(CampaignNotFoundError);
  });

  it("update 校验：不存在、仅部分字段、时间边界与默认缺省", async () => {
    await expect(
      PointsCampaignService.updateCampaign(
        "000000000000000000000000",
        { name: "x" },
        admin,
        "req-nf",
      ),
    ).rejects.toBeInstanceOf(CampaignNotFoundError);

    const created = await createDraft({ name: "边缘" });
    const onlyName = await PointsCampaignService.updateCampaign(
      String(created.id),
      { name: " 仅改名 " },
      admin,
      "req-partial",
    );
    expect(onlyName.name).toBe("仅改名");
    expect(onlyName.pointValue).toBe(50);

    const startAt = new Date(Date.now() - 10_000);
    const endAt = new Date(Date.now() + 10_000);
    await expect(
      PointsCampaignService.updateCampaign(
        String(created.id),
        { startAt: endAt, endAt: startAt },
        admin,
        "req-time",
      ),
    ).rejects.toThrow(/结束时间/);

    const bare = await PointsCampaignService.createCampaign(
      {
        name: "裸建",
        pointValue: 3.9,
        quota: 2.2,
        startAt: new Date(Date.now() - 1000),
        endAt: new Date(Date.now() + 86_400_000),
      },
      admin,
      "req-bare",
    );
    expect(bare.pointValue).toBe(3);
    expect(bare.quota).toBe(2);
    expect(bare.successCopy).toMatch(/领取成功/);
    expect(bare.description).toBe("");
  });

  it("displayStatus 矩阵：draft/offline/not_started/ended/sold_out/claimable", async () => {
    const { userId } = await seedUser({ userId: "camp-matrix" });
    const draft = await createDraft({ name: "矩阵草稿" });
    expect(draft.displayStatus).toBe("offline");

    await PointsCampaign.updateOne(
      { _id: draft.id },
      { $set: { status: "offline" } },
    );
    const offlineAdmin = await PointsCampaignService.getCampaignForAdmin(
      String(draft.id),
    );
    expect(offlineAdmin.displayStatus).toBe("offline");

    const futureStart = await createDraft({
      name: "未开始",
      startAt: new Date(Date.now() + 86_400_000),
      endAt: new Date(Date.now() + 2 * 86_400_000),
    });
    await publishViaDb(String(futureStart.id));
    const notStarted = await PointsCampaignService.getCampaignForAdmin(
      String(futureStart.id),
    );
    expect(notStarted.displayStatus).toBe("not_started");

    const ended = await createDraft({
      name: "已结束",
      startAt: new Date(Date.now() - 2 * 86_400_000),
      endAt: new Date(Date.now() - 1000),
    });
    await publishViaDb(String(ended.id));
    expect(
      (await PointsCampaignService.getCampaignForAdmin(String(ended.id)))
        .displayStatus,
    ).toBe("ended");

    const sold = await createDraft({ name: "售罄", quota: 2 });
    await publishViaDb(String(sold.id), { claimedCount: 2, quota: 2 });
    expect(
      (await PointsCampaignService.getCampaignForAdmin(String(sold.id)))
        .displayStatus,
    ).toBe("sold_out");

    const claimable = await createDraft({ name: "可领" });
    await publishViaDb(String(claimable.id));
    const forUser = await PointsCampaignService.getCampaignForUser(
      String(claimable.id),
      userId,
    );
    expect(forUser.displayStatus).toBe("claimable");

    await expect(
      PointsCampaignService.getCampaignForUser(String(draft.id), userId),
    ).rejects.toBeInstanceOf(CampaignNotFoundError);
  });

  it("listCampaigns 分页边界与无筛选", async () => {
    await createDraft({ name: "L1" });
    await createDraft({ name: "L2" });
    const all = await PointsCampaignService.listCampaigns({
      page: 0,
      limit: 0,
    });
    expect(all.page).toBe(1);
    expect(all.limit).toBe(1);
    expect(all.total).toBe(2);

    const page2 = await PointsCampaignService.listCampaigns({
      page: 2,
      limit: 1,
    });
    expect(page2.items).toHaveLength(1);

    const noKeyword = await PointsCampaignService.listCampaigns({
      page: 1,
      limit: 50,
      status: "draft",
    });
    expect(noKeyword.total).toBe(2);
  });

  it("offline/getAdmin/listClaims 不存在与空列表", async () => {
    await expect(
      PointsCampaignService.offlineCampaign(
        "000000000000000000000000",
        admin,
        "off-nf",
      ),
    ).rejects.toBeInstanceOf(CampaignNotFoundError);

    const claims = await PointsCampaignService.listCampaignClaims(
      "missing-campaign",
      0,
      999,
    );
    expect(claims.page).toBe(1);
    expect(claims.limit).toBe(100);
    expect(claims.total).toBe(0);
  });

  it("领取成功、重复领取、已领 displayStatus", async () => {
    const { userId } = await seedUser({ userId: "camp-claim-u", points: 10 });
    const created = await createDraft({
      name: "领取测",
      pointValue: 20,
      quota: 2,
    });
    await publishViaDb(String(created.id));

    const claimed = await PointsCampaignService.claimCampaign(
      String(created.id),
      userId,
      { ip: "1.1.1.1", ua: "ut", requestId: "claim-1" },
    );
    expect(claimed.rewardPoints).toBe(20);
    expect(claimed.points).toBe(30);
    expect(claimed.redirectUrl).toContain("points");

    await expect(
      PointsCampaignService.claimCampaign(String(created.id), userId, {
        ip: "1.1.1.1",
        ua: "ut",
        requestId: "claim-2",
      }),
    ).rejects.toBeInstanceOf(CampaignAlreadyClaimedError);

    const after = await PointsCampaignService.getCampaignForUser(
      String(created.id),
      userId,
    );
    expect(after.displayStatus).toBe("already_claimed");
    expect(after.userClaimed).toBe(true);

    const claims = await PointsCampaignService.listCampaignClaims(
      String(created.id),
      1,
      10,
    );
    expect(claims.total).toBe(1);
    expect(claims.items[0].result).toBe("success");
  });

  it("claim 失败分支：不存在/未发布/未开始/已结束/售罄", async () => {
    const { userId } = await seedUser({ userId: "camp-fail-u" });

    await expect(
      PointsCampaignService.claimCampaign(
        "000000000000000000000000",
        userId,
        { ip: "1.1.1.1", ua: "ut", requestId: "c-nf" },
      ),
    ).rejects.toBeInstanceOf(CampaignNotFoundError);

    const draft = await createDraft({ name: "未发布" });
    await expect(
      PointsCampaignService.claimCampaign(String(draft.id), userId, {
        ip: "1.1.1.1",
        ua: "ut",
        requestId: "c-np",
      }),
    ).rejects.toBeInstanceOf(CampaignNotPublishedError);

    const notStarted = await createDraft({
      name: "未开始领",
      startAt: new Date(Date.now() + 86_400_000),
      endAt: new Date(Date.now() + 2 * 86_400_000),
    });
    await publishViaDb(String(notStarted.id));
    await expect(
      PointsCampaignService.claimCampaign(String(notStarted.id), userId, {
        ip: "1.1.1.1",
        ua: "ut",
        requestId: "c-ns",
      }),
    ).rejects.toBeInstanceOf(CampaignNotStartedError);

    const ended = await createDraft({
      name: "已结束领",
      startAt: new Date(Date.now() - 2 * 86_400_000),
      endAt: new Date(Date.now() - 1000),
    });
    await publishViaDb(String(ended.id));
    await expect(
      PointsCampaignService.claimCampaign(String(ended.id), userId, {
        ip: "1.1.1.1",
        ua: "ut",
        requestId: "c-end",
      }),
    ).rejects.toBeInstanceOf(CampaignEndedError);

    const sold = await createDraft({ name: "售罄领", quota: 1 });
    await publishViaDb(String(sold.id), { claimedCount: 1, quota: 1 });
    await expect(
      PointsCampaignService.claimCampaign(String(sold.id), userId, {
        ip: "1.1.1.1",
        ua: "ut",
        requestId: "c-sold",
      }),
    ).rejects.toBeInstanceOf(CampaignSoldOutError);
  });

  it("claim 唯一冲突回滚 claimedCount", async () => {
    const { userId } = await seedUser({ userId: "camp-dup-u", points: 0 });
    const created = await createDraft({ name: "竞态", pointValue: 5, quota: 3 });
    await publishViaDb(String(created.id));

    await PointsCampaignClaim.create({
      campaignId: String(created.id),
      userId,
      pointValue: 5,
      claimAt: new Date(),
      claimIp: "0.0.0.0",
      claimUa: "pre",
      result: "success",
      requestId: "pre-claim",
    });

    // 已有 success claim → already claimed（findOne 路径）
    await expect(
      PointsCampaignService.claimCampaign(String(created.id), userId, {
        ip: "1.1.1.1",
        ua: "ut",
        requestId: "dup",
      }),
    ).rejects.toBeInstanceOf(CampaignAlreadyClaimedError);

    const camp = await PointsCampaign.findById(created.id).lean();
    expect(camp?.claimedCount).toBe(0);
  });

  it("publish 成功生成小程序码与二维码并上传 COS", async () => {
    mockWeChatCodesOk();
    const created = await createDraft({ name: "发布测" });
    const published = await PointsCampaignService.publishCampaign(
      String(created.id),
      admin,
      "pub-ok",
    );
    expect(published.status).toBe("published");
    expect(published.displayStatus).toBe("claimable");
    expect(String(published.miniCodeUrl)).toContain("https://cdn.example.com/");
    expect(String(published.qrCodeUrl)).toContain("-qr.png");
    expect(axiosGet).toHaveBeenCalled();
    expect(axiosPost).toHaveBeenCalledTimes(2);
    expect(putObject).toHaveBeenCalledTimes(2);
  });

  it("publish 使用默认 COS 域名（无 PUBLIC_DOMAIN）", async () => {
    delete process.env.COS_PUBLIC_DOMAIN;
    mockWeChatCodesOk();
    const created = await createDraft({ name: "默认域" });
    const published = await PointsCampaignService.publishCampaign(
      String(created.id),
      admin,
      "pub-domain",
    );
    expect(String(published.miniCodeUrl)).toMatch(
      /https:\/\/bucket-125000\.cos\.ap-guangzhou\.myqcloud\.com\//,
    );
  });

  it("publish 失败：活动不存在", async () => {
    await expect(
      PointsCampaignService.publishCampaign(
        "000000000000000000000000",
        admin,
        "pub-nf",
      ),
    ).rejects.toBeInstanceOf(CampaignNotFoundError);
  });

  it("publish 失败：微信凭证缺失", async () => {
    delete process.env.WX_APPID;
    delete process.env.WX_SECRET;
    const created = await createDraft({ name: "无微信" });
    await withBustedWxTokenCache(async () => {
      await expect(
        PointsCampaignService.publishCampaign(String(created.id), admin, "pub-wx"),
      ).rejects.toThrow(/publish campaign code generation failed/);
    });
  });

  it("publish 失败：微信 token errcode / 空 token", async () => {
    const created = await createDraft({ name: "token错" });
    await withBustedWxTokenCache(async () => {
      axiosGet.mockResolvedValueOnce({
        data: { errcode: 40013, errmsg: "invalid appid" },
      });
      await expect(
        PointsCampaignService.publishCampaign(String(created.id), admin, "pub-te"),
      ).rejects.toThrow(/wechat token error|publish campaign code/);
    });

    await withBustedWxTokenCache(async () => {
      axiosGet.mockResolvedValueOnce({
        data: { access_token: "", expires_in: 100 },
      });
      await expect(
        PointsCampaignService.publishCampaign(
          String(created.id),
          admin,
          "pub-empty",
        ),
      ).rejects.toThrow(/failed to get wechat token|publish campaign code/);
    });
  });

  it("publish 失败：小程序码/二维码 JSON 错误体", async () => {
    const created = await createDraft({ name: "码错误" });
    await withBustedWxTokenCache(async () => {
      mockWeChatTokenOk("tok-err");
      const errBody = Buffer.from(
        JSON.stringify({ errcode: 41030, errmsg: "invalid page" }),
        "utf8",
      );
      axiosPost.mockResolvedValueOnce({ data: errBody });
      await expect(
        PointsCampaignService.publishCampaign(
          String(created.id),
          admin,
          "pub-mini",
        ),
      ).rejects.toThrow(/mini-code|publish campaign code/);
    });

    await withBustedWxTokenCache(async () => {
      mockWeChatTokenOk("tok-err2");
      const png = Buffer.from([0x89, 0x50, 0x4e, 0x47]);
      const qrErr = Buffer.from(
        JSON.stringify({ errcode: 45009, errmsg: "reach max api daily quota" }),
        "utf8",
      );
      axiosPost
        .mockResolvedValueOnce({ data: png })
        .mockResolvedValueOnce({ data: qrErr });
      await expect(
        PointsCampaignService.publishCampaign(String(created.id), admin, "pub-qr"),
      ).rejects.toThrow(/qrcode|publish campaign code/);
    });
  });

  it("publish 失败：COS 凭证 / bucket / putObject 错误", async () => {
    mockWeChatCodesOk();
    const created = await createDraft({ name: "cos错" });

    delete process.env.COS_SECRET_ID;
    await expect(
      PointsCampaignService.publishCampaign(String(created.id), admin, "pub-cred"),
    ).rejects.toThrow(/COS credentials|publish campaign code/);

    process.env.COS_SECRET_ID = "sid";
    delete process.env.COS_BUCKET;
    await expect(
      PointsCampaignService.publishCampaign(String(created.id), admin, "pub-bucket"),
    ).rejects.toThrow(/COS_BUCKET|publish campaign code/);

    process.env.COS_BUCKET = "bucket-125000";
    putObject.mockImplementation((_opts: unknown, cb: (err: Error | null) => void) => {
      cb(new Error("put failed"));
    });
    await expect(
      PointsCampaignService.publishCampaign(String(created.id), admin, "pub-put"),
    ).rejects.toThrow(/put failed|publish campaign code/);
  });

  it("publish 在代理环境变量下仍可完成（proxy 清理分支）", async () => {
    const prevHttp = process.env.HTTP_PROXY;
    const prevHttps = process.env.HTTPS_PROXY;
    process.env.HTTP_PROXY = "http://127.0.0.1:9";
    process.env.HTTPS_PROXY = "http://127.0.0.1:9";
    try {
      mockWeChatCodesOk();
      const created = await createDraft({ name: "代理" });
      const published = await PointsCampaignService.publishCampaign(
        String(created.id),
        admin,
        "pub-proxy",
      );
      expect(published.status).toBe("published");
    } finally {
      if (prevHttp === undefined) delete process.env.HTTP_PROXY;
      else process.env.HTTP_PROXY = prevHttp;
      if (prevHttps === undefined) delete process.env.HTTPS_PROXY;
      else process.env.HTTPS_PROXY = prevHttps;
    }
  });

  it("claim 账本已存在时仍可领取成功", async () => {
    const { userId } = await seedUser({ userId: "camp-min-pts", points: 0 });
    const created = await createDraft({
      name: "账本预置",
      pointValue: 5,
      quota: 2,
    });
    await publishViaDb(String(created.id));
    const bizId = `campaign_claim_${created.id}_${userId}`;
    await PointsLedger.create({
      userId,
      kind: "campaign_claim",
      bizType: "campaign_claim",
      bizId,
      title: "预置",
      flowType: "income",
      pointsDelta: 5,
      balanceBefore: 0,
      balanceAfter: 5,
      operatorType: "system",
      operatorId: "points.campaign",
      operatorName: "system",
      remark: "",
    });

    const claimed = await PointsCampaignService.claimCampaign(
      String(created.id),
      userId,
      { ip: "2.2.2.2", ua: "ut", requestId: "claim-ledger" },
    );
    expect(claimed.rewardPoints).toBe(5);
  });
});
