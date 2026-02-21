import NoteBook from "../model/NoteBook";
import Note from "../model/Note";
import { ActivityLogger } from "../utils/ActivityLogger";
import { ExportData } from "./export.service";

export interface ImportOptions {
  mode: "replace" | "merge"; // replace: 清空现有数据, merge: 合并数据
  conflictStrategy: "skip" | "overwrite"; // merge 模式下的冲突处理
}

export interface ImportResult {
  success: boolean;
  message: string;
  statistics: {
    totalNoteBooks: number;
    importedNoteBooks: number;
    skippedNoteBooks: number;
    totalNotes: number;
    importedNotes: number;
    skippedNotes: number;
  };
  errors?: string[];
}

export class ImportService {
  /**
   * 导入用户数据
   */
  static async importUserData(
    userId: string,
    importData: ExportData,
    options: ImportOptions = { mode: "replace", conflictStrategy: "overwrite" },
  ): Promise<ImportResult> {
    try {
      // 验证导入数据格式
      this.validateImportData(importData);

      const result: ImportResult = {
        success: true,
        message: "导入成功",
        statistics: {
          totalNoteBooks: importData.data.noteBooks.length,
          importedNoteBooks: 0,
          skippedNoteBooks: 0,
          totalNotes: importData.data.notes.length,
          importedNotes: 0,
          skippedNotes: 0,
        },
        errors: [],
      };

      // 根据导入模式处理数据
      if (options.mode === "replace") {
        // 清空现有数据
        await this.clearUserData(userId);
        // 导入所有数据
        await this.importAllData(userId, importData, result);
      } else {
        // 合并模式
        await this.mergeData(userId, importData, options, result);
      }

      // 记录导入活动
      void ActivityLogger.record(
        {
          type: "create",
          target: "noteBook",
          targetId: "import",
          title: `数据导入：${result.statistics.importedNoteBooks}个手帐本，${result.statistics.importedNotes}条手帐`,
          userId,
        },
        { blocking: false },
      );

      return result;
    } catch (error) {
      console.error("导入用户数据失败:", error);
      return {
        success: false,
        message: error instanceof Error ? error.message : "导入失败",
        statistics: {
          totalNoteBooks: 0,
          importedNoteBooks: 0,
          skippedNoteBooks: 0,
          totalNotes: 0,
          importedNotes: 0,
          skippedNotes: 0,
        },
        errors: [error instanceof Error ? error.message : "未知错误"],
      };
    }
  }

  /**
   * 验证导入数据格式
   */
  private static validateImportData(data: ExportData): void {
    if (!data.data) {
      throw new Error("导入数据格式错误：缺少 data 字段");
    }

    if (!Array.isArray(data.data.noteBooks)) {
      throw new Error("导入数据格式错误：noteBooks 必须是数组");
    }

    if (!Array.isArray(data.data.notes)) {
      throw new Error("导入数据格式错误：notes 必须是数组");
    }

    // 验证手帐本数据格式
    data.data.noteBooks.forEach((noteBook, index) => {
      if (!noteBook.title || typeof noteBook.title !== "string") {
        throw new Error(
          `手帐本数据格式错误：第 ${index + 1} 个手帐本缺少 title 字段`,
        );
      }
    });

    // 验证手帐数据格式
    data.data.notes.forEach((note, index) => {
      if (!note.title || typeof note.title !== "string") {
        throw new Error(
          `手帐数据格式错误：第 ${index + 1} 条手帐缺少 title 字段`,
        );
      }
      if (typeof note.content !== "string") {
        throw new Error(
          `手帐数据格式错误：第 ${index + 1} 条手帐缺少 content 字段`,
        );
      }
      if (!note.noteBookId || typeof note.noteBookId !== "string") {
        throw new Error(
          `手帐数据格式错误：第 ${index + 1} 条手帐缺少 noteBookId 字段`,
        );
      }
    });
  }

  /**
   * 清空用户现有数据
   */
  private static async clearUserData(userId: string): Promise<void> {
    await Promise.all([
      NoteBook.deleteMany({ userId }),
      Note.deleteMany({ userId }),
    ]);
  }

  /**
   * 导入所有数据（替换模式）
   */
  private static async importAllData(
    userId: string,
    importData: ExportData,
    result: ImportResult,
  ): Promise<void> {
    // 导入手帐本
    const noteBookMap = new Map<string, string>(); // 旧ID -> 新ID 映射

    for (const noteBookData of importData.data.noteBooks) {
      try {
        const noteBook = new NoteBook({
          title: noteBookData.title,
          coverImg: noteBookData.coverImg || "",
          count: 0, // 初始化为0，后面会根据手帐数量更新
          userId,
        });

        await noteBook.save();
        if (noteBookData.id) {
          noteBookMap.set(noteBookData.id, noteBook._id.toString());
        }
        result.statistics.importedNoteBooks++;
      } catch (error) {
        result.statistics.skippedNoteBooks++;
        result.errors?.push(`手帐本导入失败：${noteBookData.title} - ${error}`);
      }
    }

    // 导入手帐
    for (const noteData of importData.data.notes) {
      try {
        // 获取映射后的手帐本ID
        const newNoteBookId =
          noteBookMap.get(noteData.noteBookId) || noteData.noteBookId;

        const note = new Note({
          noteBookId: newNoteBookId,
          title: noteData.title,
          content: noteData.content,
          tags: noteData.tags || [],
          userId,
        });

        await note.save();
        result.statistics.importedNotes++;
      } catch (error) {
        result.statistics.skippedNotes++;
        result.errors?.push(`手帐导入失败：${noteData.title} - ${error}`);
      }
    }

    // 更新手帐本计数
    await this.updateNoteBookCounts(userId);
  }

  /**
   * 合并数据（合并模式）
   */
  private static async mergeData(
    userId: string,
    importData: ExportData,
    options: ImportOptions,
    result: ImportResult,
  ): Promise<void> {
    // 获取现有数据
    const existingNoteBooks = await NoteBook.find({ userId });
    const existingNotes = await Note.find({ userId });

    const existingNoteBookMap = new Map(
      existingNoteBooks.map((book) => [book.title, book]),
    );
    const existingNoteMap = new Map(
      existingNotes.map((note) => [`${note.noteBookId}_${note.title}`, note]),
    );

    // 合并手帐本
    for (const noteBookData of importData.data.noteBooks) {
      try {
        const existingNoteBook = existingNoteBookMap.get(noteBookData.title);

        if (existingNoteBook) {
          // 手帐本已存在
          if (options.conflictStrategy === "overwrite") {
            // 更新现有手帐本
            existingNoteBook.coverImg =
              noteBookData.coverImg || existingNoteBook.coverImg;
            await existingNoteBook.save();
            result.statistics.importedNoteBooks++;
          } else {
            // 跳过
            result.statistics.skippedNoteBooks++;
          }
        } else {
          // 创建新手帐本
          const noteBook = new NoteBook({
            title: noteBookData.title,
            coverImg: noteBookData.coverImg || "",
            count: 0,
            userId,
          });
          await noteBook.save();
          existingNoteBookMap.set(noteBook.title, noteBook);
          result.statistics.importedNoteBooks++;
        }
      } catch (error) {
        result.statistics.skippedNoteBooks++;
        result.errors?.push(`手帐本合并失败：${noteBookData.title} - ${error}`);
      }
    }

    // 合并手帐
    for (const noteData of importData.data.notes) {
      try {
        // 查找对应的手帐本
        const targetNoteBook = existingNoteBookMap.get(
          this.findNoteBookTitle(
            importData.data.noteBooks,
            noteData.noteBookId,
          ) || "",
        );

        if (!targetNoteBook) {
          result.statistics.skippedNotes++;
          result.errors?.push(
            `手帐导入失败：找不到手帐本 ${noteData.noteBookId}`,
          );
          continue;
        }

        const noteKey = `${targetNoteBook._id}_${noteData.title}`;
        const existingNote = existingNoteMap.get(noteKey);

        if (existingNote) {
          // 手帐已存在
          if (options.conflictStrategy === "overwrite") {
            // 更新现有手帐
            existingNote.content = noteData.content;
            existingNote.tags = noteData.tags || [];
            await existingNote.save();
            result.statistics.importedNotes++;
          } else {
            // 跳过
            result.statistics.skippedNotes++;
          }
        } else {
          // 创建新手帐
          const note = new Note({
            noteBookId: targetNoteBook._id,
            title: noteData.title,
            content: noteData.content,
            tags: noteData.tags || [],
            userId,
          });
          await note.save();
          existingNoteMap.set(noteKey, note);
          result.statistics.importedNotes++;
        }
      } catch (error) {
        result.statistics.skippedNotes++;
        result.errors?.push(`手帐合并失败：${noteData.title} - ${error}`);
      }
    }

    // 更新手帐本计数
    await this.updateNoteBookCounts(userId);
  }

  /**
   * 根据ID查找手帐本标题
   */
  private static findNoteBookTitle(
    noteBooks: any[],
    noteBookId: string,
  ): string | undefined {
    const noteBook = noteBooks.find((book) => book.id === noteBookId);
    return noteBook?.title;
  }

  /**
   * 更新手帐本计数
   */
  private static async updateNoteBookCounts(userId: string): Promise<void> {
    const noteBooks = await NoteBook.find({ userId });

    for (const noteBook of noteBooks) {
      const count = await Note.countDocuments({
        noteBookId: noteBook._id,
        userId,
      });
      noteBook.count = count;
      await noteBook.save();
    }
  }
}
