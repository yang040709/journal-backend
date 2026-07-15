import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { clearTestDb, connectTestDb } from "../../helpers/db";
import { AdminTemplateService } from "../../../src/service/adminTemplate.service";

describe("unit: AdminTemplateService", () => {
  beforeAll(async () => {
    await connectTestDb();
  }, 120_000);

  beforeEach(async () => {
    await clearTestDb();
  });

  it("用户模板与系统模板 CRUD / 批量启停", async () => {
    const userTpl = await AdminTemplateService.createTemplate({
      userId: "tpl-user-1",
      name: "我的模板",
      description: "desc",
      fields: { title: "t", content: "c", tags: ["a"] },
    });
    const sys = await AdminTemplateService.createSystemTemplate({
      name: "系统模板",
      description: "sys",
      fields: { title: "st", content: "sc", tags: [] },
      systemKey: "sys_key_1",
      enabled: true,
      priority: 10,
    });

    const listed = await AdminTemplateService.listTemplates({
      page: 1,
      limit: 10,
      userId: "tpl-user-1",
      search: "模板",
      sortBy: "name",
      order: "asc",
    });
    expect(listed.total).toBe(1);

    const systems = await AdminTemplateService.listSystemTemplates();
    expect(systems.some((t) => t.name === "系统模板")).toBe(true);

    expect(
      (await AdminTemplateService.getTemplateById(String(userTpl._id)))?.name,
    ).toBe("我的模板");
    expect(
      (await AdminTemplateService.getTemplateById(String(sys._id)))?.name,
    ).toBe("系统模板");
    expect(
      (await AdminTemplateService.getTemplateById("sys_key_1"))?.name,
    ).toBe("系统模板");
    expect(await AdminTemplateService.getTemplateById("missing")).toBeNull();

    const updatedUser = await AdminTemplateService.updateTemplate(
      String(userTpl._id),
      {
        name: "我的模板2",
        description: "d2",
        fields: { title: "t2", content: "c2", tags: ["b"] },
      },
    );
    expect(updatedUser?.name).toBe("我的模板2");
    expect(
      await AdminTemplateService.updateTemplate(String(sys._id), { name: "x" }),
    ).toBeNull();

    const updatedSys = await AdminTemplateService.updateSystemTemplate(
      String(sys._id),
      {
        name: "系统模板2",
        description: "sys2",
        systemKey: "sys_key_2",
        enabled: false,
        priority: 20,
        fields: { title: "st2", content: "sc2", tags: ["s"] },
      },
    );
    expect(updatedSys?.enabled).toBe(false);
    expect(updatedSys?.systemKey).toBe("sys_key_2");

    const batchBad = await AdminTemplateService.batchSetSystemTemplateEnabled(
      ["bad-id", String(sys._id), String(sys._id)],
      false,
    );
    expect(batchBad.failedCount).toBeGreaterThan(0);

    const batchOk = await AdminTemplateService.batchSetSystemTemplateEnabled(
      [String(sys._id)],
      true,
    );
    expect(batchOk.successCount).toBe(1);

    expect(await AdminTemplateService.deleteTemplate(String(userTpl._id))).toBe(
      true,
    );
    expect(await AdminTemplateService.deleteTemplate(String(userTpl._id))).toBe(
      false,
    );
    expect(
      await AdminTemplateService.deleteSystemTemplate(String(sys._id)),
    ).toBe(true);
  });
});
