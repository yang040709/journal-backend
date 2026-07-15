import { describe, expect, it } from "vitest";
import { getTemplateById, noteTemplates } from "../../../src/constant/templates";

describe("unit: templates constant", () => {
  it("noteTemplates 非空且 getTemplateById 可查", () => {
    expect(noteTemplates.length).toBeGreaterThan(5);
    const first = noteTemplates[0];
    expect(getTemplateById(first.id)?.name).toBe(first.name);
    expect(getTemplateById("___missing___")).toBeUndefined();
  });
});
