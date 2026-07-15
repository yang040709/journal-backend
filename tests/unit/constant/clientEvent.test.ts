import { describe, expect, it } from "vitest";
import {
  getClientEventActionLabel,
  getClientEventLabel,
  isClientEventName,
  isClientEventTrackingAllowed,
  normalizeClientEventSettings,
  sanitizeClientEventProps,
} from "../../../src/constant/clientEvent";

describe("unit: clientEvent", () => {
  it("normalize / tracking / labels", () => {
    const settings = normalizeClientEventSettings({
      enabled: false,
      events: { me_menu_click: false },
    });
    expect(settings.enabled).toBe(false);
    expect(settings.events.me_menu_click).toBe(false);
    expect(settings.events.note_detail_action_click).toBe(true);
    expect(isClientEventTrackingAllowed(settings, "me_menu_click")).toBe(false);

    const on = normalizeClientEventSettings(null);
    expect(isClientEventTrackingAllowed(on, "me_menu_click")).toBe(true);
    expect(isClientEventTrackingAllowed(on, "unknown")).toBe(false);
    expect(isClientEventName("me_menu_click")).toBe(true);
    expect(getClientEventLabel("me_menu_click")).toContain("我的");
    expect(getClientEventLabel("x")).toBe("x");
  });

  it("getClientEventActionLabel 覆盖各事件类型", () => {
    expect(
      getClientEventActionLabel("me_menu_click", "x", { itemId: "template" }),
    ).toBe("我的模板");
    expect(getClientEventActionLabel("note_detail_action_click", "edit")).toBe(
      "编辑",
    );
    expect(
      getClientEventActionLabel("note_detail_more_click", "clone"),
    ).toBe("克隆手帐");
    expect(
      getClientEventActionLabel("note_form_dock_click", "save", { mode: "add" }),
    ).toContain("新建");
    expect(
      getClientEventActionLabel("note_form_dock_click", "save", {
        mode: "edit",
      }),
    ).toContain("编辑");
    expect(getClientEventActionLabel("note_form_dock_click", "save")).toBe(
      "保存",
    );
    expect(getClientEventActionLabel("other", "act")).toBe("act");
  });

  it("sanitizeClientEventProps 校验与裁剪", () => {
    expect(sanitizeClientEventProps("me_menu_click", null)).toBeNull();
    expect(
      sanitizeClientEventProps("me_menu_click", { action: "open" }),
    ).toBeNull();
    expect(
      sanitizeClientEventProps("me_menu_click", {
        action: "open",
        section: "content",
        itemId: "template",
      }),
    ).toEqual({
      action: "open",
      section: "content",
      itemId: "template",
    });
    expect(
      sanitizeClientEventProps("note_detail_action_click", {
        action: "edit",
      }),
    ).toBeNull();
    expect(
      sanitizeClientEventProps("note_detail_action_click", {
        action: "edit",
        noteId: " n1 ",
        toggleValue: true,
      }),
    ).toMatchObject({ action: "edit", noteId: "n1", toggleValue: true });
    expect(
      sanitizeClientEventProps("note_form_dock_click", {
        action: "save",
        mode: "bad",
      }),
    ).toBeNull();
    expect(
      sanitizeClientEventProps("note_form_dock_click", {
        action: "save",
        mode: "add",
      })?.mode,
    ).toBe("add");
    expect(
      sanitizeClientEventProps("note_detail_action_click", {
        action: "not_allowed",
        noteId: "n1",
      }),
    ).toBeNull();
  });
});
