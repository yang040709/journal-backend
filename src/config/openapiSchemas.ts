/**
 * OpenAPI components.schemas — 与 response.ts envelope 及领域模型对齐
 */
import { openapiAdminSchemas } from "./openapiAdminSchemas";

export const openapiSchemas = {
  ApiEnvelope: {
    type: "object",
    required: ["code", "message", "data", "requestId", "timestamp"],
    properties: {
      code: { type: "integer", example: 0 },
      message: { type: "string", example: "success" },
      data: { nullable: true },
      requestId: { type: "string" },
      timestamp: { type: "integer", format: "int64" },
    },
  },
  ErrorResponse: {
    allOf: [{ $ref: "#/components/schemas/ApiEnvelope" }],
    description: "业务错误响应，code !== 0",
  },
  PaginatedData: {
    type: "object",
    required: ["items", "total", "page", "limit", "totalPages"],
    properties: {
      items: { type: "array", items: {} },
      total: { type: "integer" },
      page: { type: "integer" },
      limit: { type: "integer" },
      totalPages: { type: "integer" },
    },
  },
  NoteImage: {
    type: "object",
    properties: {
      url: { type: "string" },
      key: { type: "string" },
      thumbUrl: { type: "string" },
      thumbKey: { type: "string" },
      width: { type: "integer" },
      height: { type: "integer" },
      size: { type: "integer" },
      mimeType: {
        type: "string",
        enum: ["image/jpeg", "image/png", "image/webp"],
      },
    },
  },
  User: {
    type: "object",
    properties: {
      userId: { type: "string" },
      nickname: { type: "string" },
      avatarUrl: { type: "string" },
      bio: { type: "string" },
      membershipText: { type: "string" },
      points: { type: "integer" },
      exportExtraCredits: { type: "integer" },
      quickCovers: { type: "array", items: { type: "string" } },
      customNoteTags: { type: "array", items: { type: "string" } },
      defaultReadingStyleKey: { type: "string", nullable: true },
      defaultReadingThemeId: { type: "string", nullable: true },
      readingThemeApplyScope: {
        type: "string",
        enum: ["global", "note"],
      },
      createdAt: { type: "string", format: "date-time" },
      updatedAt: { type: "string", format: "date-time" },
    },
  },
  Note: {
    type: "object",
    properties: {
      _id: { type: "string" },
      noteBookId: { type: "string" },
      title: { type: "string" },
      content: { type: "string" },
      tags: { type: "array", items: { type: "string" } },
      images: {
        type: "array",
        items: { $ref: "#/components/schemas/NoteImage" },
      },
      userId: { type: "string" },
      isShare: { type: "boolean" },
      shareId: { type: "string" },
      isDeleted: { type: "boolean" },
      isFavorite: { type: "boolean" },
      isPinned: { type: "boolean" },
      readingStyleKey: { type: "string", nullable: true },
      readingThemeId: { type: "string", nullable: true },
      createdAt: { type: "string", format: "date-time" },
      updatedAt: { type: "string", format: "date-time" },
    },
  },
  NoteBook: {
    type: "object",
    properties: {
      _id: { type: "string" },
      title: { type: "string" },
      coverImg: { type: "string" },
      count: { type: "integer" },
      userId: { type: "string" },
      isDeleted: { type: "boolean" },
      createdAt: { type: "string", format: "date-time" },
      updatedAt: { type: "string", format: "date-time" },
    },
  },
  Reminder: {
    type: "object",
    properties: {
      _id: { type: "string" },
      userId: { type: "string" },
      noteId: { type: "string" },
      title: { type: "string" },
      content: { type: "string" },
      remindTime: { type: "string", format: "date-time" },
      subscriptionStatus: {
        type: "string",
        enum: ["pending", "subscribed", "cancelled"],
      },
      sendStatus: {
        type: "string",
        enum: ["pending", "sent", "failed"],
      },
      createdAt: { type: "string", format: "date-time" },
      updatedAt: { type: "string", format: "date-time" },
    },
  },
  Template: {
    type: "object",
    properties: {
      _id: { type: "string" },
      userId: { type: "string" },
      name: { type: "string" },
      description: { type: "string" },
      fields: {
        type: "object",
        properties: {
          title: { type: "string" },
          content: { type: "string" },
          tags: { type: "array", items: { type: "string" } },
        },
      },
      isSystem: { type: "boolean" },
      systemKey: { type: "string" },
      createdAt: { type: "string", format: "date-time" },
      updatedAt: { type: "string", format: "date-time" },
    },
  },
  UserImageAsset: {
    type: "object",
    properties: {
      _id: { type: "string" },
      userId: { type: "string" },
      url: { type: "string" },
      key: { type: "string" },
      source: { type: "string", enum: ["note", "cover"] },
      createdAt: { type: "string", format: "date-time" },
    },
  },
  UserFeedback: {
    type: "object",
    properties: {
      _id: { type: "string" },
      userId: { type: "string" },
      type: { type: "string" },
      content: { type: "string" },
      status: { type: "string" },
      createdAt: { type: "string", format: "date-time" },
    },
  },
  Announcement: {
    type: "object",
    properties: {
      _id: { type: "string" },
      title: { type: "string" },
      content: { type: "string" },
      publishedAt: { type: "string", format: "date-time" },
    },
  },
  BrowseBanner: {
    type: "object",
    properties: {
      _id: { type: "string" },
      title: { type: "string" },
      imageUrl: { type: "string" },
      linkUrl: { type: "string" },
    },
  },
  LoginResult: {
    type: "object",
    properties: {
      token: { type: "string" },
      user: { $ref: "#/components/schemas/User" },
    },
  },
  RefreshTokenResult: {
    type: "object",
    properties: {
      token: { type: "string" },
    },
  },
  SuccessLogin: {
    allOf: [{ $ref: "#/components/schemas/ApiEnvelope" }],
    properties: {
      data: { $ref: "#/components/schemas/LoginResult" },
    },
  },
  SuccessRefreshToken: {
    allOf: [{ $ref: "#/components/schemas/ApiEnvelope" }],
    properties: {
      data: { $ref: "#/components/schemas/RefreshTokenResult" },
    },
  },
  SuccessUser: {
    allOf: [{ $ref: "#/components/schemas/ApiEnvelope" }],
    properties: {
      data: { $ref: "#/components/schemas/User" },
    },
  },
  SuccessNote: {
    allOf: [{ $ref: "#/components/schemas/ApiEnvelope" }],
    properties: {
      data: { $ref: "#/components/schemas/Note" },
    },
  },
  SuccessNoteList: {
    allOf: [{ $ref: "#/components/schemas/ApiEnvelope" }],
    properties: {
      data: { type: "array", items: { $ref: "#/components/schemas/Note" } },
    },
  },
  SuccessPaginatedNoteList: {
    allOf: [{ $ref: "#/components/schemas/ApiEnvelope" }],
    properties: {
      data: {
        allOf: [{ $ref: "#/components/schemas/PaginatedData" }],
        properties: {
          items: {
            type: "array",
            items: { $ref: "#/components/schemas/Note" },
          },
        },
      },
    },
  },
  SuccessNoteBook: {
    allOf: [{ $ref: "#/components/schemas/ApiEnvelope" }],
    properties: {
      data: { $ref: "#/components/schemas/NoteBook" },
    },
  },
  SuccessPaginatedNoteBookList: {
    allOf: [{ $ref: "#/components/schemas/ApiEnvelope" }],
    properties: {
      data: {
        allOf: [{ $ref: "#/components/schemas/PaginatedData" }],
        properties: {
          items: {
            type: "array",
            items: { $ref: "#/components/schemas/NoteBook" },
          },
        },
      },
    },
  },
  SuccessReminder: {
    allOf: [{ $ref: "#/components/schemas/ApiEnvelope" }],
    properties: {
      data: { $ref: "#/components/schemas/Reminder" },
    },
  },
  SuccessPaginatedReminderList: {
    allOf: [{ $ref: "#/components/schemas/ApiEnvelope" }],
    properties: {
      data: {
        allOf: [{ $ref: "#/components/schemas/PaginatedData" }],
        properties: {
          items: {
            type: "array",
            items: { $ref: "#/components/schemas/Reminder" },
          },
        },
      },
    },
  },
  SuccessTemplate: {
    allOf: [{ $ref: "#/components/schemas/ApiEnvelope" }],
    properties: {
      data: { $ref: "#/components/schemas/Template" },
    },
  },
  SuccessTemplateList: {
    allOf: [{ $ref: "#/components/schemas/ApiEnvelope" }],
    properties: {
      data: { type: "array", items: { $ref: "#/components/schemas/Template" } },
    },
  },
  SuccessPaginatedTemplateList: {
    allOf: [{ $ref: "#/components/schemas/ApiEnvelope" }],
    properties: {
      data: {
        allOf: [{ $ref: "#/components/schemas/PaginatedData" }],
        properties: {
          items: {
            type: "array",
            items: { $ref: "#/components/schemas/Template" },
          },
        },
      },
    },
  },
  SuccessPaginatedUserImageAssetList: {
    allOf: [{ $ref: "#/components/schemas/ApiEnvelope" }],
    properties: {
      data: {
        allOf: [{ $ref: "#/components/schemas/PaginatedData" }],
        properties: {
          items: {
            type: "array",
            items: { $ref: "#/components/schemas/UserImageAsset" },
          },
        },
      },
    },
  },
  SuccessGeneric: {
    allOf: [{ $ref: "#/components/schemas/ApiEnvelope" }],
    description: "通用成功响应，data 结构见各接口 description",
  },
  SuccessObject: {
    allOf: [{ $ref: "#/components/schemas/ApiEnvelope" }],
    properties: {
      data: { type: "object", additionalProperties: true },
    },
  },
  SuccessArray: {
    allOf: [{ $ref: "#/components/schemas/ApiEnvelope" }],
    properties: {
      data: { type: "array", items: {} },
    },
  },
  ...openapiAdminSchemas,
};
