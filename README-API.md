# 手帐应用后端 API

基于 Koa + TypeScript + MongoDB 的手帐应用后端服务。

## 功能特性

- ✅ 用户认证（JWT）
- ✅ 手帐本管理（CRUD）
- ✅ 手帐管理（CRUD）
- ✅ 标签系统
- ✅ 全文搜索
- ✅ 活动记录
- ✅ 统计信息
- ✅ 批量操作
- ✅ 数据验证（Zod）
- ✅ 错误处理
- ✅ 分页支持

## 技术栈

- **运行时**: Node.js 18+
- **框架**: Koa 2.x
- **语言**: TypeScript
- **数据库**: MongoDB + Mongoose
- **验证**: Zod
- **构建**: tsup

## 快速开始

### 1. 环境准备

```bash
# 复制环境变量文件
cp .env.example .env

# 编辑.env文件，配置数据库连接和JWT密钥
```

### 2. 安装依赖

```bash
pnpm install
```

### 3. 启动 MongoDB

```bash
# 使用Docker启动MongoDB
docker-compose up -d

# 或者手动启动MongoDB服务
```

### 4. 启动开发服务器

```bash
# 开发模式（热重载）
pnpm dev

# 生产模式
pnpm build
pnpm start
```

### 5. 访问 API

服务器启动后，访问：http://localhost:3000

## API 文档

### 认证

所有 API（除用户注册/登录外）都需要在请求头中添加：

```
Authorization: Bearer <your-jwt-token>
```

### 主要接口

#### 手帐本管理

| 方法   | 路径                    | 描述           |
| ------ | ----------------------- | -------------- |
| GET    | `/note-books`           | 获取手帐本列表 |
| GET    | `/note-books/:id`       | 获取单个手帐本 |
| POST   | `/note-books`           | 创建手帐本     |
| PUT    | `/note-books/:id`       | 更新手帐本     |
| DELETE | `/note-books/:id`       | 删除手帐本     |
| GET    | `/note-books/:id/stats` | 获取手帐本统计 |

#### 手帐管理

| 方法   | 路径                  | 描述         |
| ------ | --------------------- | ------------ |
| GET    | `/notes`              | 获取手帐列表 |
| GET    | `/notes/:id`          | 获取单个手帐 |
| POST   | `/notes`              | 创建手帐     |
| PUT    | `/notes/:id`          | 更新手帐     |
| DELETE | `/notes/:id`          | 删除手帐     |
| POST   | `/notes/batch-delete` | 批量删除手帐 |
| GET    | `/notes/search`       | 搜索手帐     |
| GET    | `/notes/recent`       | 获取最近手帐 |

#### 统计信息

| 方法 | 路径                     | 描述               |
| ---- | ------------------------ | ------------------ |
| GET  | `/stats/user`            | 获取用户统计       |
| GET  | `/stats/tags`            | 获取标签统计       |
| GET  | `/stats/activity`        | 获取活动时间线     |
| GET  | `/stats/note-book-usage` | 获取手帐本使用统计 |

### 数据模型

#### 手帐本 (NoteBook)

```typescript
{
  id: string;
  title: string;
  coverImg?: string;
  count: number;
  userId: string;
  createdAt: Date;
  updatedAt: Date;
}
```

#### 手帐 (Note)

```typescript
{
  id: string;
  noteBookId: string;
  title: string;
  content: string;
  tags: string[];
  userId: string;
  createdAt: Date;
  updatedAt: Date;
}
```

#### 活动记录 (Activity)

```typescript
{
  id: string;
  type: "create" | "update" | "delete";
  target: "noteBook" | "note";
  targetId: string;
  title: string;
  userId: string;
  createdAt: Date;
}
```

## 测试 API

使用 `test-api.http` 文件进行 API 测试（需要先获取有效的 JWT token）：

1. 启动服务器
2. 使用 REST 客户端（如 VS Code 的 REST Client 扩展）打开 `test-api.http`
3. 替换 `YOUR_TOKEN_HERE` 为实际的 JWT token
4. 执行各个请求

## 开发指南

### 项目结构

```
backend/
├── src/
│   ├── config/          # 配置文件
│   ├── middlewares/     # 中间件
│   ├── model/          # 数据模型
│   ├── routes/         # 路由
│   ├── service/        # 业务逻辑
│   ├── types/          # TypeScript类型
│   ├── utils/          # 工具函数
│   ├── app.ts          # Koa应用
│   └── index.ts        # 入口文件
├── test-api.http       # API测试文件
├── .env.example        # 环境变量示例
├── docker-compose.yml  # Docker配置
└── package.json        # 依赖配置
```

### 添加新功能

1. 在 `src/model/` 中定义数据模型
2. 在 `src/service/` 中实现业务逻辑
3. 在 `src/routes/` 中创建路由
4. 在 `src/app.ts` 中注册路由

### 数据库索引

已为常用查询创建索引：

- 用户 ID + 创建时间
- 用户 ID + 更新时间
- 手帐本 ID + 创建时间
- 标签索引
- 全文搜索索引

## 部署

### Docker 部署

```bash
# 构建镜像
docker build -t journal-backend .

# 运行容器
docker run -p 3000:3000 --env-file .env journal-backend
```

### 传统部署

```bash
# 构建
pnpm build

# 启动
NODE_ENV=production pnpm start
```

## 注意事项

1. **JWT 密钥**: 生产环境务必使用强密钥
2. **MongoDB 连接**: 确保 MongoDB 服务正常运行
3. **环境变量**: 所有敏感配置都应通过环境变量设置
4. **CORS**: 根据前端地址配置 CORS
5. **日志**: 生产环境建议配置日志收集

## 故障排除

### 常见问题

1. **MongoDB 连接失败**

   - 检查 MongoDB 服务状态
   - 验证 MONGO_URI 配置

2. **JWT 验证失败**

   - 检查 JWT_SECRET 配置
   - 验证 token 格式和有效期

3. **端口占用**
   - 修改 PORT 环境变量
   - 检查是否有其他服务占用 3000 端口

### 日志查看

```bash
# 查看应用日志
pnpm dev  # 开发模式输出日志

# 查看Docker日志
docker-compose logs -f
```

## 许可证

MIT
