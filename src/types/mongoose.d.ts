import { Document, FlattenMaps } from "mongoose";

// 扩展Mongoose的FlattenMaps类型，使其包含id属性
declare module "mongoose" {
  interface FlattenMaps<T> {
    id: string;
  }
}

// 创建一个更简单的类型，只包含我们需要的属性，排除Mongoose的方法属性
type SimpleFlattenMaps<T> = Omit<
  FlattenMaps<T>,
  | "$assertPopulated"
  | "$clearModifiedPaths"
  | "$clone"
  | "$createModifiedPathsSnapshot"
  | "$getAllSubdocs"
  | "$getPopulatedDocs"
  | "$ignore"
  | "$isDefault"
  | "$isDeleted"
  | "$markValid"
  | "$op"
  | "$parent"
  | "$session"
  | "$set"
  | "$where"
  | "$__"
  | "$isNew"
  | "$errors"
  | "$locals"
  | "$__original_validate"
  | "$__original_save"
  | "$__original_remove"
  | "$__original_init"
  | "$__delta"
  | "$__version"
  | "$__path"
  | "$__schema"
  | "$__parentArray"
  | "$__parent"
  | "$__index"
  | "$__storage"
  | "$__cachedAtomics"
  | "$__selected"
  | "$__v"
  | "$__"
> & {
  id: string;
};

// 通用类型转换工具 - 使用更简单的定义
export type LeanDocument<T extends Document> = Omit<
  SimpleFlattenMaps<T>,
  "_id" | "__v"
> & {
  id: string;
};

// 手帐本相关类型
export type LeanNoteBook = LeanDocument<import("../model/NoteBook").INoteBook>;
export type LeanNote = LeanDocument<import("../model/Note").INote>;
export type LeanActivity = LeanDocument<import("../model/Activity").IActivity>;
export type LeanTemplate = LeanDocument<import("../model/Template").ITemplate>;
