// config/swaggerOptions.ts
import { openapiSchemas } from "./openapiSchemas";

export default {
  definition: {
    openapi: "3.0.0",
    info: {
      title: "Journal Backend API",
      version: "1.0.0",
      description: "个人日记本后端服务，基于 Koa2 开发",
      contact: {
        name: "API Support",
        email: "support@example.com",
      },
    },
    servers: [
      {
        url: "http://localhost:3000",
        description: "开发环境",
      },
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: "http",
          scheme: "bearer",
          bearerFormat: "JWT",
          description: "请输入 JWT Token (不带 Bearer 前缀)",
        },
      },
      schemas: openapiSchemas,
    },
  },
  apis: ["./src/routes/**/*.ts"],
};
