import mongoose from "mongoose";
import Template, { ITemplate } from "../model/Template";
import { toLeanTemplate, toLeanTemplateArray } from "../utils/typeUtils";
import { LeanTemplate } from "../types/mongoose";
import {
  loadSystemTemplatesForClient,
  templateDocToClientLean,
} from "./template.service";

export interface AdminTemplateListParams {
  page?: number;
  limit?: number;
  sortBy?: string;
  order?: "asc" | "desc";
  userId?: string;
  search?: string;
}

export class AdminTemplateService {
  /** 系统内置模板（数据库；空库时与 TemplateService 一致回退常量） */
  static async listSystemTemplates(): Promise<LeanTemplate[]> {
    return loadSystemTemplatesForClient();
  }

  static async listTemplates(params: AdminTemplateListParams = {}) {
    const page = Math.max(1, params.page || 1);
    const limit = Math.min(100, Math.max(1, params.limit || 20));
    const skip = (page - 1) * limit;
    const sortField = params.sortBy || "updatedAt";
    const sortOrder = params.order === "asc" ? 1 : -1;

    const query: Record<string, unknown> = { isSystem: false };
    if (params.userId?.trim()) {
      query.userId = params.userId.trim();
    }
    if (params.search?.trim()) {
      const rx = new RegExp(params.search.trim(), "i");
      query.$or = [{ name: rx }, { description: rx }];
    }

    const [items, total] = await Promise.all([
      Template.find(query)
        .sort({ [sortField]: sortOrder })
        .skip(skip)
        .limit(limit)
        .lean(),
      Template.countDocuments(query),
    ]);
    return { items: toLeanTemplateArray(items), total };
  }

  static async getTemplateById(id: string): Promise<LeanTemplate | null> {
    if (mongoose.Types.ObjectId.isValid(id)) {
      const doc = await Template.findById(id).lean();
      if (doc) {
        if (doc.isSystem) {
          return templateDocToClientLean(doc);
        }
        return toLeanTemplate(doc);
      }
    }
    const byKey = await Template.findOne({ systemKey: id, isSystem: true }).lean();
    if (byKey) {
      return templateDocToClientLean(byKey);
    }
    return null;
  }

  static async createTemplate(data: {
    userId: string;
    name: string;
    description?: string;
    fields: { title: string; content: string; tags: string[] };
  }): Promise<ITemplate> {
    const t = new Template({
      userId: data.userId.trim(),
      name: data.name.trim(),
      description: (data.description ?? "").trim(),
      fields: {
        title: data.fields.title,
        content: data.fields.content,
        tags: data.fields.tags ?? [],
      },
      isSystem: false,
    });
    await t.save();
    return t;
  }

  static async createSystemTemplate(data: {
    name: string;
    description?: string;
    fields: { title: string; content: string; tags: string[] };
    systemKey?: string;
  }): Promise<ITemplate> {
    const t = new Template({
      userId: "system",
      name: data.name.trim(),
      description: (data.description ?? "").trim(),
      fields: {
        title: data.fields.title,
        content: data.fields.content,
        tags: data.fields.tags ?? [],
      },
      isSystem: true,
      systemKey: data.systemKey?.trim() || undefined,
    });
    await t.save();
    return t;
  }

  static async updateTemplate(
    id: string,
    data: {
      name?: string;
      description?: string;
      fields?: { title?: string; content?: string; tags?: string[] };
    },
  ): Promise<ITemplate | null> {
    const template = await Template.findOne({ _id: id, isSystem: false });
    if (!template) {
      return null;
    }
    if (data.name !== undefined) {
      template.name = data.name.trim();
    }
    if (data.description !== undefined) {
      template.description = data.description.trim();
    }
    if (data.fields) {
      if (data.fields.title !== undefined) {
        template.fields.title = data.fields.title;
      }
      if (data.fields.content !== undefined) {
        template.fields.content = data.fields.content;
      }
      if (data.fields.tags !== undefined) {
        template.fields.tags = data.fields.tags;
      }
    }
    await template.save();
    return template;
  }

  static async updateSystemTemplate(
    id: string,
    data: {
      name?: string;
      description?: string;
      systemKey?: string;
      fields?: { title?: string; content?: string; tags?: string[] };
    },
  ): Promise<ITemplate | null> {
    const template = await Template.findOne({ _id: id, isSystem: true });
    if (!template) {
      return null;
    }
    if (data.name !== undefined) {
      template.name = data.name.trim();
    }
    if (data.description !== undefined) {
      template.description = data.description.trim();
    }
    if (data.systemKey !== undefined) {
      const k = data.systemKey.trim();
      template.systemKey = k || undefined;
    }
    if (data.fields) {
      if (data.fields.title !== undefined) {
        template.fields.title = data.fields.title;
      }
      if (data.fields.content !== undefined) {
        template.fields.content = data.fields.content;
      }
      if (data.fields.tags !== undefined) {
        template.fields.tags = data.fields.tags;
      }
    }
    await template.save();
    return template;
  }

  static async deleteTemplate(id: string): Promise<boolean> {
    const r = await Template.deleteOne({ _id: id, isSystem: false });
    return r.deletedCount === 1;
  }

  static async deleteSystemTemplate(id: string): Promise<boolean> {
    const r = await Template.deleteOne({ _id: id, isSystem: true });
    return r.deletedCount === 1;
  }
}
