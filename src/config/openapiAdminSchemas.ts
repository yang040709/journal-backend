/**
 * Admin OpenAPI components.schemas — 对齐 adminApi.ts 与 AdminAccountService
 */
export const openapiAdminSchemas = {
  AdminProfile: {
    type: "object",
    properties: {
      id: { type: "string" },
      username: { type: "string" },
      role: { type: "string", enum: ["super", "operator"] },
      allowedPages: { type: "array", items: { type: "string" } },
    },
  },
  AdminLoginResult: {
    type: "object",
    properties: {
      token: { type: "string" },
      admin: { $ref: "#/components/schemas/AdminProfile" },
    },
  },
  SuccessAdminLogin: {
    allOf: [{ $ref: "#/components/schemas/ApiEnvelope" }],
    properties: {
      data: { $ref: "#/components/schemas/AdminLoginResult" },
    },
  },
  SuccessAdminProfile: {
    allOf: [{ $ref: "#/components/schemas/ApiEnvelope" }],
    properties: {
      data: { $ref: "#/components/schemas/AdminProfile" },
    },
  },
  AdminAlertRule: {
    type: "object",
    properties: {
      ruleKey: { type: "string" },
      name: { type: "string" },
      description: { type: "string" },
      enabled: { type: "boolean" },
      severity: { type: "string", enum: ["P1", "P2", "P3"] },
      windowMinutes: { type: "integer" },
      minSampleCount: { type: "integer" },
      thresholdType: {
        type: "string",
        enum: ["count", "rate", "ratio_vs_baseline"],
      },
      thresholdValue: { type: "number" },
      recoverValue: { type: "number" },
      consecutiveHits: { type: "integer" },
      cooldownMinutes: { type: "integer" },
      params: { type: "object", additionalProperties: true },
      stats: { type: "object", additionalProperties: true },
      updatedAt: { type: "string", format: "date-time" },
    },
  },
  AdminAlertEvent: {
    type: "object",
    properties: {
      eventId: { type: "string" },
      ruleKey: { type: "string" },
      ruleName: { type: "string" },
      severity: { type: "string", enum: ["P1", "P2", "P3"] },
      status: {
        type: "string",
        enum: ["open", "acknowledged", "resolved", "muted"],
      },
      triggeredAt: { type: "string", format: "date-time" },
      lastHitAt: { type: "string", format: "date-time" },
      resolvedAt: { type: "string", format: "date-time", nullable: true },
      hitValue: { type: "number" },
      baselineValue: { type: "number" },
      metricSnapshot: { type: "object", additionalProperties: true },
      occurrenceCount: { type: "integer" },
      ackBy: { type: "string" },
      ackAt: { type: "string", format: "date-time", nullable: true },
      ackRemark: { type: "string" },
      updatedAt: { type: "string", format: "date-time" },
    },
  },
  SuccessAdminAlertRule: {
    allOf: [{ $ref: "#/components/schemas/ApiEnvelope" }],
    properties: {
      data: { $ref: "#/components/schemas/AdminAlertRule" },
    },
  },
  SuccessAdminAlertRuleList: {
    allOf: [{ $ref: "#/components/schemas/ApiEnvelope" }],
    properties: {
      data: {
        type: "array",
        items: { $ref: "#/components/schemas/AdminAlertRule" },
      },
    },
  },
  SuccessAdminAlertEvent: {
    allOf: [{ $ref: "#/components/schemas/ApiEnvelope" }],
    properties: {
      data: { $ref: "#/components/schemas/AdminAlertEvent" },
    },
  },
  SuccessPaginatedAdminAlertEventList: {
    allOf: [{ $ref: "#/components/schemas/ApiEnvelope" }],
    properties: {
      data: {
        allOf: [{ $ref: "#/components/schemas/PaginatedData" }],
        properties: {
          items: {
            type: "array",
            items: { $ref: "#/components/schemas/AdminAlertEvent" },
          },
        },
      },
    },
  },
  SuccessPaginatedAdminNoteList: {
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
  SuccessAdminNote: {
    allOf: [{ $ref: "#/components/schemas/ApiEnvelope" }],
    properties: {
      data: { $ref: "#/components/schemas/Note" },
    },
  },
};
