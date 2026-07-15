import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { clearTestDb, connectTestDb } from "../../helpers/db";
import Template from "../../../src/model/Template";
import {
  TemplateService,
  loadSystemTemplatesForClient,
  templateDocToClientLean,
} from "../../../src/service/template.service";

describe("unit: TemplateService", () => {
  beforeAll(async () => {
    await connectTestDb();
  }, 120_000);

  beforeEach(async () => {
    await clearTestDb();
  });

  it("用户模板 CRUD / 搜索 / 批量删除 / 系统回落", async () => {
    const created = await TemplateService.createTemplate("tpl-u1", {
      name: "晨间",
      description: "日记",
      fields: { title: "t", content: "c", tags: ["日常"] },
    });

    const listed = await TemplateService.getUserTemplates("tpl-u1", {
      page: 1,
      limit: 10,
      search: "晨",
      sortBy: "name",
      order: "asc",
    });
    expect(listed.total).toBe(1);

    const byId = await TemplateService.getTemplateById(
      String(created._id),
      "tpl-u1",
    );
    expect(byId?.name).toBe("晨间");

    const updated = await TemplateService.updateTemplate(
      String(created._id),
      "tpl-u1",
      {
        name: "晨间2",
        description: "d2",
        fields: { title: "t2", content: "c2", tags: ["计划"] },
      },
    );
    expect(updated?.name).toBe("晨间2");

    expect(
      await TemplateService.validateTemplateAccess(String(created._id), "tpl-u1"),
    ).toBe(true);
    expect(
      await TemplateService.validateTemplateAccess(String(created._id), "other"),
    ).toBe(false);

    const sys = await Template.create({
      userId: "system",
      name: "系统A",
      description: "",
      fields: { title: "st", content: "sc", tags: [] },
      isSystem: true,
      systemKey: "sys_a",
      enabled: true,
      priority: 5,
    });
    expect(
      templateDocToClientLean(sys.toObject() as any).id,
    ).toBe("sys_a");
    expect(
      (await TemplateService.getTemplateById(String(sys._id), "tpl-u1"))?.name,
    ).toBe("系统A");
    expect(
      await TemplateService.getTemplateById(
        "000000000000000000000000",
        "tpl-u1",
      ),
    ).toBeNull();



    const all = await TemplateService.getAllTemplates("tpl-u1");
    expect(all.some((t) => t.name === "晨间2")).toBe(true);
    expect(all.some((t) => t.name === "系统A")).toBe(true);

    const more = await TemplateService.createTemplate("tpl-u1", {
      name: "晚间",
      description: "",
      fields: { title: "t", content: "c", tags: [] },
    });
    const deletedCount = await TemplateService.batchDeleteTemplates(
      [String(created._id), String(more._id)],
      "tpl-u1",
    );
    expect(deletedCount).toBe(2);
    expect(await TemplateService.deleteTemplate(String(created._id), "tpl-u1")).toBe(
      false,
    );
    expect(await TemplateService.batchDeleteTemplates([], "tpl-u1")).toBe(0);

    await Template.deleteMany({ isSystem: true });
    const fallback = await loadSystemTemplatesForClient();
    expect(fallback.length).toBeGreaterThan(5);
  });
});
