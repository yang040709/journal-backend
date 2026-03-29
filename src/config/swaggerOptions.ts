// config/swaggerOptions.js
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
        url: "http://localhost:3000", // 对应 docker-compose 映射的端口
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
    },
  },
  // 指定包含注释的文件路径 glob 模式
  apis: ["./src/routes/*.ts"],
};
