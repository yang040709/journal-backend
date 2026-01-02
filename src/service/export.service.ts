import NoteBook from "../model/NoteBook";
import Note from "../model/Note";
import { defaultNoteBook } from "../constant/img";

export interface ExportData {
  version: string;
  exportTime: string;
  appName: string;
  data: {
    noteBooks: any[];
    notes: any[];
  };
  statistics: {
    noteBookCount: number;
    noteCount: number;
  };
}

export class ExportService {
  /**
   * 导出用户的所有数据
   */
  static async exportUserData(userId: string): Promise<ExportData> {
    try {
      // 获取用户的所有手帐本
      const noteBooks = await NoteBook.find({ userId }).lean();

      // 获取用户的所有手帐
      const notes = await Note.find({ userId }).lean();

      // 转换数据格式，移除 MongoDB 的 _id 和 __v
      const cleanNoteBooks = noteBooks.map((book) => ({
        id: book._id?.toString(),
        title: book.title,
        coverImg: book.coverImg || "",
        count: book.count,
        userId: book.userId,
        createdAt: book.createdAt?.toISOString(),
        updatedAt: book.updatedAt?.toISOString(),
      }));

      const cleanNotes = notes.map((note) => ({
        id: note._id?.toString(),
        noteBookId: note.noteBookId,
        title: note.title,
        content: note.content,
        tags: note.tags || [],
        userId: note.userId,
        createdAt: note.createdAt?.toISOString(),
        updatedAt: note.updatedAt?.toISOString(),
      }));

      return {
        version: "2.0.0",
        exportTime: new Date().toISOString(),
        appName: "手帐",
        data: {
          noteBooks: cleanNoteBooks,
          notes: cleanNotes,
        },
        statistics: {
          noteBookCount: cleanNoteBooks.length,
          noteCount: cleanNotes.length,
        },
      };
    } catch (error) {
      console.error("导出用户数据失败:", error);
      throw new Error("导出数据失败");
    }
  }

  /**
   * 获取导出数据的文件名
   */
  static getExportFileName(): string {
    const timestamp = new Date()
      .toISOString()
      .replace(/[:.]/g, "-")
      .replace("T", "_")
      .split(".")[0];
    return `手帐备份_${timestamp}.json`;
  }
}
