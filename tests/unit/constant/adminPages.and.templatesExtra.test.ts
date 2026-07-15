import { describe, expect, it } from "vitest";
import {
  ASSIGNABLE_ADMIN_PAGES,
  isAssignablePage,
} from "../../../src/constant/adminPages";
import { getTemplateById, noteTemplates } from "../../../src/constant/templates";

describe("unit: adminPages + templates extras", () => {
  it("isAssignablePage 覆盖白名单", () => {
    expect(ASSIGNABLE_ADMIN_PAGES.length).toBeGreaterThan(5);
    expect(isAssignablePage(ASSIGNABLE_ADMIN_PAGES[0])).toBe(true);
    expect(isAssignablePage("not-real-page")).toBe(false);
  });

  it("遍历模板 id 均可查询", () => {
    for (const t of noteTemplates.slice(0, 8)) {
      expect(getTemplateById(t.id)?.id).toBe(t.id);
    }
  });
});
