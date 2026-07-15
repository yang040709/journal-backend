import { afterEach, describe, expect, it, vi } from "vitest";

const deleteMultipleObject = vi.fn();

vi.mock("cos-nodejs-sdk-v5", () => {
  return {
    default: class CosMock {
      deleteMultipleObject = deleteMultipleObject;
    },
  };
});

import { deleteCosObjects } from "../../../src/utils/cosDelete";

describe("unit: cosDelete deleteCosObjects", () => {
  const keys = [
    "COS_SECRET_ID",
    "COS_SECRET_KEY",
    "COS_BUCKET",
    "COS_REGION",
  ] as const;
  const prev: Record<string, string | undefined> = {};

  afterEach(() => {
    for (const k of keys) {
      if (prev[k] === undefined) delete process.env[k];
      else process.env[k] = prev[k];
    }
    deleteMultipleObject.mockReset();
  });

  function rememberEnv() {
    for (const k of keys) {
      if (!(k in prev)) prev[k] = process.env[k];
    }
  }

  it("缺少 bucket/region 抛错；空有效 key 返回 0", async () => {
    rememberEnv();
    delete process.env.COS_BUCKET;
    delete process.env.COS_REGION;
    await expect(deleteCosObjects(["a/b.png"])).rejects.toThrow(/COS_BUCKET/);

    process.env.COS_BUCKET = "b";
    process.env.COS_REGION = "r";
    process.env.COS_SECRET_ID = "id";
    process.env.COS_SECRET_KEY = "key";
    await expect(deleteCosObjects(["", "cover:1", "alone"])).resolves.toEqual({
      deletedKeys: 0,
    });
  });

  it("成功删除与 credentials 缺失、回调错误、超时", async () => {
    rememberEnv();
    process.env.COS_BUCKET = "bucket";
    process.env.COS_REGION = "ap-shanghai";
    process.env.COS_SECRET_ID = "id";
    process.env.COS_SECRET_KEY = "key";

    deleteMultipleObject.mockImplementation((_opts, cb) => {
      cb(null, { Deleted: [{ Key: "a/b.png" }, { Key: "a/c.png" }] });
    });
    await expect(deleteCosObjects(["a/b.png", "a/c.png", "a/b.png"])).resolves.toEqual({
      deletedKeys: 2,
    });

    deleteMultipleObject.mockImplementation((_opts, cb) => {
      cb(null, {});
    });
    await expect(deleteCosObjects(["x/y.png"])).resolves.toEqual({ deletedKeys: 0 });

    deleteMultipleObject.mockImplementation((_opts, cb) => {
      cb(new Error("cos fail"));
    });
    await expect(deleteCosObjects(["x/y.png"])).rejects.toThrow(/cos fail/);

    delete process.env.COS_SECRET_ID;
    await expect(deleteCosObjects(["x/y.png"])).rejects.toThrow(/credentials/);

    process.env.COS_SECRET_ID = "id";
    deleteMultipleObject.mockImplementation(() => {
      /* never calls back — race with timeout */
    });
    await expect(deleteCosObjects(["x/y.png"], { timeoutMs: 20 })).rejects.toThrow(/timeout/);
  });
});
