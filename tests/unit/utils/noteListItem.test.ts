import { describe, expect, it } from "vitest";
import {
  toLeanNoteListItem,
  toLeanNoteListItems,
} from "../../../src/utils/noteListItem";

describe("noteListItem", () => {
  it("从 content 补全缺失的 contentPreview 且不返回 content", () => {
    const item = toLeanNoteListItem({
      _id: "507f1f77bcf86cd799439011",
      title: "测试",
      content: "昨天忘记记录了\n今天补一下",
      userId: "u1",
      noteBookId: "b1",
    });

    expect(item.contentPreview).toBe("昨天忘记记录了\n今天补一下");
    expect((item as { content?: string }).content).toBeUndefined();
  });

  it("已有 contentPreview 时优先使用存储值，不从 content 重算", () => {
    const item = toLeanNoteListItem({
      _id: "507f1f77bcf86cd799439011",
      title: "测试",
      content: "第一行\n第二行",
      contentPreview: "旧摘要",
      userId: "u1",
      noteBookId: "b1",
    });

    expect(item.contentPreview).toBe("旧摘要");
    expect((item as { content?: string }).content).toBeUndefined();
  });

  it("toLeanNoteListItems 批量转换", () => {
    const items = toLeanNoteListItems([
      {
        _id: "507f1f77bcf86cd799439011",
        title: "a",
        content: "正文一",
        userId: "u1",
        noteBookId: "b1",
      },
    ]);
    expect(items).toHaveLength(1);
    expect(items[0].contentPreview).toBe("正文一");
  });
});
