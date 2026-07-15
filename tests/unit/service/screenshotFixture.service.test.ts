import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { clearTestDb, connectTestDb } from "../../helpers/db";
import {
  ScreenshotFixtureService,
  SCREENSHOT_USER_ID,
} from "../../../src/service/screenshotFixture.service";
import User from "../../../src/model/User";
import Note from "../../../src/model/Note";

describe("unit: ScreenshotFixtureService", () => {
  const prevEnv = {
    NODE_ENV: process.env.NODE_ENV,
    SCREENSHOT_SEED_SECRET: process.env.SCREENSHOT_SEED_SECRET,
  };

  beforeAll(async () => {
    await connectTestDb();
  }, 120_000);

  beforeEach(async () => {
    await clearTestDb();
    process.env.NODE_ENV = "development";
    process.env.SCREENSHOT_SEED_SECRET = "test-secret";
  });

  afterEach(() => {
    if (prevEnv.NODE_ENV === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = prevEnv.NODE_ENV;
    if (prevEnv.SCREENSHOT_SEED_SECRET === undefined) {
      delete process.env.SCREENSHOT_SEED_SECRET;
    } else {
      process.env.SCREENSHOT_SEED_SECRET = prevEnv.SCREENSHOT_SEED_SECRET;
    }
  });

  it("isEnabled 依赖环境变量", () => {
    expect(ScreenshotFixtureService.isEnabled()).toBe(true);
    delete process.env.SCREENSHOT_SEED_SECRET;
    expect(ScreenshotFixtureService.isEnabled()).toBe(false);
    process.env.SCREENSHOT_SEED_SECRET = "x";
    process.env.NODE_ENV = "production";
    expect(ScreenshotFixtureService.isEnabled()).toBe(false);
  });

  it("seed reset 与 reused 分支", async () => {
    const first = await ScreenshotFixtureService.seed({ reset: true });
    expect(first.userId).toBe(SCREENSHOT_USER_ID);
    expect(first.token).toBeTruthy();
    expect(first.fixtures.noteId).toBeTruthy();
    expect(first.fixtures.trashNoteId).toBeTruthy();
    expect(await Note.countDocuments({ userId: SCREENSHOT_USER_ID })).toBeGreaterThanOrEqual(2);

    const reused = await ScreenshotFixtureService.seed({ reset: false });
    expect(reused.reused).toBe(true);
    expect(reused.fixtures.noteId).toBe(first.fixtures.noteId);

    const resetAgain = await ScreenshotFixtureService.seed({ reset: true });
    expect(resetAgain.reused).toBeFalsy();
    expect(await User.countDocuments({ userId: SCREENSHOT_USER_ID })).toBe(1);
  });
});
