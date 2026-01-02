import { Document, FlattenMaps } from "mongoose";

// 扩展Mongoose的FlattenMaps类型，使其包含id属性
declare module "mongoose" {
  interface FlattenMaps<T> {
    id: string;
  }
}

// 通用类型转换工具 - 使用更简单的定义
export type LeanDocument<T extends Document> = Omit<
  FlattenMaps<T>,
  "_id" | "__v"
> & {
  id: string;
};

// 手帐本相关类型
export type LeanNoteBook = LeanDocument<import("../model/NoteBook").INoteBook>;
export type LeanNote = LeanDocument<import("../model/Note").INote>;
export type LeanActivity = LeanDocument<import("../model/Activity").IActivity>;
