import { nanoid } from "nanoid";
import User from "../model/User";
import Note from "../model/Note";
import NoteBook from "../model/NoteBook";
import Template from "../model/Template";
import Announcement from "../model/Announcement";
import { signToken } from "../utils/jwt";
import { buildNoteContentPreview } from "../utils/noteContentPreview";
import { getTrashExpireAt } from "./note/note.shared";
import { TemplateService } from "./template.service";

export const SCREENSHOT_USER_ID = "screenshot-fixture-user";
const SCREENSHOT_TAG = "截图示例";

export interface ScreenshotFixtures {
  notebookId: string;
  noteId: string;
  trashNoteId: string;
  shareId: string;
  templateId: string;
  announcementId: string;
  tag: string;
}

export interface ScreenshotSeedResult {
  token: string;
  userId: string;
  fixtures: ScreenshotFixtures;
  reused?: boolean;
}

export class ScreenshotFixtureService {
  static isEnabled(): boolean {
    return (
      process.env.NODE_ENV === "development" &&
      Boolean(String(process.env.SCREENSHOT_SEED_SECRET || "").trim())
    );
  }

  static async seed(options: { reset?: boolean } = {}): Promise<ScreenshotSeedResult> {
    const reset = options.reset !== false;
    if (!reset) {
      const existing = await this.loadExistingFixtures();
      if (existing) {
        return existing;
      }
    }

    await this.cleanup();

    await User.create({
      userId: SCREENSHOT_USER_ID,
      nickname: "截图专用用户",
      points: 500,
      quickCovers: [],
      quickCoversUpdatedAt: new Date(),
    });

    const notebook = await NoteBook.create({
      title: "截图示例手帐本",
      userId: SCREENSHOT_USER_ID,
      count: 2,
    });
    const notebookId = notebook._id.toString();

    const noteContent =
      "用于发版留档的示例正文。包含多行内容与标签，便于截图验收页面排版。";
    const note = await Note.create({
      userId: SCREENSHOT_USER_ID,
      noteBookId: notebookId,
      title: "截图示例手帐",
      content: noteContent,
      contentPreview: buildNoteContentPreview(noteContent),
      tags: [SCREENSHOT_TAG],
      images: [],
    });
    const noteId = note._id.toString();

    const shareId = nanoid(12);
    await Note.findByIdAndUpdate(note._id, {
      isShare: true,
      shareId,
      shareVersion: 1,
    });

    const now = new Date();
    const trashNote = await Note.create({
      userId: SCREENSHOT_USER_ID,
      noteBookId: notebookId,
      title: "截图废纸篓示例",
      content: "已删除的手帐，用于废纸篓详情页截图。",
      contentPreview: buildNoteContentPreview("已删除的手帐，用于废纸篓详情页截图。"),
      tags: [],
      images: [],
      isDeleted: true,
      deletedAt: now,
      deleteExpireAt: getTrashExpireAt(now),
    });
    const trashNoteId = trashNote._id.toString();

    const template = await TemplateService.createTemplate(SCREENSHOT_USER_ID, {
      name: "截图示例模板",
      description: "发版截图专用模板",
      fields: {
        title: "模板标题占位",
        content: "模板正文占位，用于模板编辑页截图。",
        tags: [SCREENSHOT_TAG],
      },
    });
    const templateId = template._id.toString();

    const announcement = await Announcement.create({
      title: "截图示例公告",
      content: "这是一条用于页面截图验收的示例公告正文。",
      images: [],
      priority: 10,
      showViewCount: true,
      viewCount: 0,
      status: "published",
      publishedAt: now,
      createdBy: SCREENSHOT_USER_ID,
      updatedBy: SCREENSHOT_USER_ID,
    });
    const announcementId = announcement._id.toString();

    const token = signToken({ userId: SCREENSHOT_USER_ID });

    return {
      token,
      userId: SCREENSHOT_USER_ID,
      fixtures: {
        notebookId,
        noteId,
        trashNoteId,
        shareId,
        templateId,
        announcementId,
        tag: SCREENSHOT_TAG,
      },
      reused: false,
    };
  }

  static async loadExistingFixtures(): Promise<ScreenshotSeedResult | null> {
    const user = await User.findOne({ userId: SCREENSHOT_USER_ID }).lean();
    if (!user) return null;

    const notebook = await NoteBook.findOne({
      userId: SCREENSHOT_USER_ID,
      title: "截图示例手帐本",
    }).lean();
    if (!notebook?._id) return null;

    const note = await Note.findOne({
      userId: SCREENSHOT_USER_ID,
      noteBookId: notebook._id.toString(),
      title: "截图示例手帐",
      isDeleted: { $ne: true },
    }).lean();
    if (!note?._id || !note.shareId) return null;

    const trashNote = await Note.findOne({
      userId: SCREENSHOT_USER_ID,
      title: "截图废纸篓示例",
      isDeleted: true,
    }).lean();
    if (!trashNote?._id) return null;

    const template = await Template.findOne({
      userId: SCREENSHOT_USER_ID,
      name: "截图示例模板",
      isSystem: false,
    }).lean();
    if (!template?._id) return null;

    const announcement = await Announcement.findOne({
      createdBy: SCREENSHOT_USER_ID,
      title: "截图示例公告",
    }).lean();
    if (!announcement?._id) return null;

    const token = signToken({ userId: SCREENSHOT_USER_ID });
    return {
      token,
      userId: SCREENSHOT_USER_ID,
      fixtures: {
        notebookId: notebook._id.toString(),
        noteId: note._id.toString(),
        trashNoteId: trashNote._id.toString(),
        shareId: String(note.shareId),
        templateId: template._id.toString(),
        announcementId: announcement._id.toString(),
        tag: SCREENSHOT_TAG,
      },
      reused: true,
    };
  }

  static async cleanup(): Promise<void> {
    await Promise.all([
      Note.deleteMany({ userId: SCREENSHOT_USER_ID }),
      NoteBook.deleteMany({ userId: SCREENSHOT_USER_ID }),
      Template.deleteMany({ userId: SCREENSHOT_USER_ID, isSystem: false }),
      Announcement.deleteMany({ createdBy: SCREENSHOT_USER_ID }),
      User.deleteMany({ userId: SCREENSHOT_USER_ID }),
    ]);
  }
}
