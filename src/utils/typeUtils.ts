import { FlattenMaps } from "mongoose";
import {
  LeanNoteBook,
  LeanNote,
  LeanActivity,
  LeanTemplate,
} from "../types/mongoose";

// 类型转换工具函数
export function toLeanNoteBook(doc: FlattenMaps<any>): LeanNoteBook {
  const { _id, __v, ...rest } = doc;
  return {
    ...rest,
    id: _id?.toString() || "",
  } as LeanNoteBook;
}

export function toLeanNote(doc: FlattenMaps<any>): LeanNote {
  const { _id, __v, ...rest } = doc;
  return {
    ...rest,
    id: _id?.toString() || "",
  } as LeanNote;
}

export function toLeanActivity(doc: FlattenMaps<any>): LeanActivity {
  const { _id, __v, ...rest } = doc;
  return {
    ...rest,
    id: _id?.toString() || "",
  } as LeanActivity;
}

// 批量转换函数
export function toLeanNoteBookArray(docs: FlattenMaps<any>[]): LeanNoteBook[] {
  return docs.map(toLeanNoteBook);
}

export function toLeanNoteArray(docs: FlattenMaps<any>[]): LeanNote[] {
  return docs.map(toLeanNote);
}

export function toLeanActivityArray(docs: FlattenMaps<any>[]): LeanActivity[] {
  return docs.map(toLeanActivity);
}

// Template 类型转换函数
export function toLeanTemplate(doc: FlattenMaps<any>): LeanTemplate {
  const { _id, __v, ...rest } = doc;
  return {
    ...rest,
    id: _id?.toString() || "",
  } as LeanTemplate;
}

export function toLeanTemplateArray(docs: FlattenMaps<any>[]): LeanTemplate[] {
  return docs.map(toLeanTemplate);
}
