import mongoose from "mongoose";
import Template, { ITemplate, LeanTemplate } from "../model/Template";
import { ActivityLogger } from "../utils/ActivityLogger";
// import { ErrorCodes } from "../utils/response";
import { toLeanTemplateArray, toLeanTemplate } from "../utils/typeUtils";
import { noteTemplates } from "@/constant/templates.js";
import type { FlattenMaps } from "mongoose";
import {
  ensurePageDepth,
  normalizeKeyword,
  pickSortField,
  toSafeRegex,
} from "../utils/querySafety";

/** C 端列表：系统模板 id 使用 systemKey，与历史常量 id 一致 */
export function templateDocToClientLean(
  doc: FlattenMaps<ITemplate>,
): LeanTemplate {
  const lean = toLeanTemplate(doc);
  if (doc.isSystem) {
    return {
      ...lean,
      id: doc.systemKey || lean.id,
      systemKey: doc.systemKey,
      mongoId: doc._id.toString(),
      priority: Number.isFinite(doc.priority) ? Number(doc.priority) : 100,
    } as LeanTemplate;
  }
  return lean;
}

async function getSystemTemplatesFallbackConstant(): Promise<LeanTemplate[]> {
  return noteTemplates.map((template) => ({
    id: template.id,
    userId: "system",
    name: template.name,
    description: template.description,
    fields: template.fields,
    isSystem: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  })) as LeanTemplate[];
}

export async function loadSystemTemplatesForClient(): Promise<LeanTemplate[]> {
  const docs = await Template.find({
    isSystem: true,
    $or: [{ enabled: true }, { enabled: { $exists: false } }],
  })
    .lean();
  if (docs.length === 0) {
    return getSystemTemplatesFallbackConstant();
  }
  return docs
    .map((d) => templateDocToClientLean(d))
    .sort((a, b) => {
      const pa = Number.isFinite((a as any).priority) ? Number((a as any).priority) : 100;
      const pb = Number.isFinite((b as any).priority) ? Number((b as any).priority) : 100;
      if (pa !== pb) return pa - pb;
      const at = new Date(String((a as any).updatedAt || 0)).getTime();
      const bt = new Date(String((b as any).updatedAt || 0)).getTime();
      if (at !== bt) return bt - at;
      return String(a.name || "").localeCompare(String(b.name || ""), "zh-Hans-CN");
    });
}

export interface CreateTemplateData {
  name: string;
  description: string;
  fields: {
    title: string;
    content: string;
    tags: string[];
  };
}

export interface UpdateTemplateData {
  name?: string;
  description?: string;
  fields?: {
    title?: string;
    content?: string;
    tags?: string[];
  };
}

export interface PaginationParams {
  page?: number;
  limit?: number;
  sortBy?: string;
  order?: "asc" | "desc";
  search?: string;
}

const MAX_PAGE_DEPTH = 10_000;
const MIN_SEARCH_KEYWORD_LENGTH = 1;

export class TemplateService {
  /**
   * 创建自定义模板
   */
  static async createTemplate(
    userId: string,
    data: CreateTemplateData,
  ): Promise<ITemplate> {
    const template = new Template({
      userId,
      name: data.name,
      description: data.description,
      fields: data.fields,
      isSystem: false,
    });

    await template.save();

    // 记录活动
    ActivityLogger.record(
      {
        type: "create",
        target: "template",
        targetId: template.id,
        title: `创建模板：${data.name}`,
        userId,
      },
      { blocking: false },
    );

    return template;
  }

  /**
   * 获取用户模板列表
   */
  static async getUserTemplates(
    userId: string,
    params: PaginationParams = {},
  ): Promise<{ items: LeanTemplate[]; total: number }> {
    const page = Math.max(1, params.page || 1);
    const limit = Math.min(100, Math.max(1, params.limit || 20));
    ensurePageDepth({ page, limit, maxDepth: MAX_PAGE_DEPTH });
    const skip = (page - 1) * limit;

    const sortField = pickSortField(
      ["createdAt", "updatedAt", "name"] as const,
      params.sortBy,
      "updatedAt",
    );
    const sortOrder = params.order === "asc" ? 1 : -1;

    // 构建查询条件
    const query: any = { userId, isSystem: false };

    // 搜索筛选
    const keyword = normalizeKeyword(params.search, {
      min: MIN_SEARCH_KEYWORD_LENGTH,
      max: 100,
    });
    if (keyword) {
      const searchRegex = toSafeRegex(keyword);
      query.$or = [{ name: searchRegex }, { description: searchRegex }];
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

  /**
   * 获取单个模板
   */
  static async getTemplateById(
    id: string,
    userId: string,
  ): Promise<LeanTemplate | null> {
    const userT = await Template.findOne({
      _id: id,
      userId,
      isSystem: false,
    }).lean();
    if (userT) {
      return toLeanTemplate(userT);
    }

    if (mongoose.Types.ObjectId.isValid(id)) {
      const sysByMongo = await Template.findOne({
        _id: id,
        isSystem: true,
      }).lean();
      if (sysByMongo) {
        return templateDocToClientLean(sysByMongo);
      }
    }

    const sysByKey = await Template.findOne({
      systemKey: id,
      isSystem: true,
    }).lean();
    if (sysByKey) {
      return templateDocToClientLean(sysByKey);
    }

    const fromConst = noteTemplates.find((t) => t.id === id);
    if (fromConst) {
      return {
        id: fromConst.id,
        userId: "system",
        name: fromConst.name,
        description: fromConst.description,
        fields: fromConst.fields,
        isSystem: true,
        createdAt: new Date(0),
        updatedAt: new Date(0),
      } as LeanTemplate;
    }

    return null;
  }

  /**
   * 更新模板
   */
  static async updateTemplate(
    id: string,
    userId: string,
    data: UpdateTemplateData,
  ): Promise<ITemplate | null> {
    const template = await Template.findOne({
      _id: id,
      userId,
      isSystem: false,
    });
    if (!template) {
      return null;
    }

    if (data.name !== undefined) template.name = data.name;
    if (data.description !== undefined) template.description = data.description;

    if (data.fields) {
      if (data.fields.title !== undefined)
        template.fields.title = data.fields.title;
      if (data.fields.content !== undefined)
        template.fields.content = data.fields.content;
      if (data.fields.tags !== undefined)
        template.fields.tags = data.fields.tags;
    }

    await template.save();

    // 记录活动
    ActivityLogger.record(
      {
        type: "update",
        target: "template",
        targetId: template.id,
        title: `更新模板：${template.name}`,
        userId,
      },
      { blocking: false },
    );

    return template;
  }

  /**
   * 删除模板
   */
  static async deleteTemplate(id: string, userId: string): Promise<boolean> {
    const template = await Template.findOne({
      _id: id,
      userId,
      isSystem: false,
    });
    if (!template) {
      return false;
    }

    // 删除模板
    await Template.deleteOne({ _id: id, userId, isSystem: false });

    // 记录活动
    ActivityLogger.record(
      {
        type: "delete",
        target: "template",
        targetId: id,
        title: `删除模板：${template.name}`,
        userId,
      },
      { blocking: false },
    );

    return true;
  }

  /**
   * 获取所有模板（系统模板 + 用户自定义模板）
   */
  static async getAllTemplates(userId: string): Promise<LeanTemplate[]> {
    const systemTemplates = await loadSystemTemplatesForClient();

    const userTemplates = await Template.find({ userId, isSystem: false })
      .sort({ updatedAt: -1 })
      .lean();

    // 合并并返回,把用户的模板放在前面
    return [...toLeanTemplateArray(userTemplates), ...systemTemplates];
  }

  /**
   * 验证用户对模板的访问权限
   */
  static async validateTemplateAccess(
    templateId: string,
    userId: string,
  ): Promise<boolean> {
    const template = await Template.findOne({ _id: templateId, userId });
    return !!template;
  }

  /**
   * 批量删除模板
   */
  static async batchDeleteTemplates(
    templateIds: string[],
    userId: string,
  ): Promise<number> {
    if (!templateIds.length) {
      return 0;
    }

    // 获取要删除的模板信息，用于记录活动
    const templates = await Template.find({
      _id: { $in: templateIds },
      userId,
      isSystem: false,
    });
    if (!templates.length) {
      return 0;
    }

    // 批量删除模板
    const result = await Template.deleteMany({
      _id: { $in: templateIds },
      userId,
      isSystem: false,
    });

    // 记录活动
    void ActivityLogger.record(
      {
        type: "delete",
        target: "template",
        targetId: "batch",
        title: `批量删除模板：共删除${result.deletedCount}个`,
        userId,
      },
      { blocking: false },
    );

    return result.deletedCount || 0;
  }
}
