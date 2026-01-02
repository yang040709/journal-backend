# Schedule Management Backend

一个基于 Koa.js 和 TypeScript 的习惯养成与日程管理后端系统，提供完整的用户认证、习惯追踪、日程管理和 AI 智能建议功能。

## 技术栈

- **运行时**: Node.js
- **框架**: Koa.js + TypeScript
- **数据库**: MongoDB + Redis
- **认证**: JWT
- **构建工具**: tsup
- **包管理**: pnpm

## 功能特性

### 用户认证

- JWT 身份验证
- 用户注册和登录
- 密码加密存储

### 习惯管理

- 创建习惯（每日/每周/每月）
- 习惯打卡和取消打卡
- 习惯统计和进度追踪
- 连续打卡天数计算
- 成功率统计

### 日程管理

- 创建和管理日程
- AI 智能日程生成
- 日程流程链管理
- 日程修改建议

### AI 智能功能

- AI 日程建议生成
- 基于编辑的智能建议
- 自动日程优化

### 数据统计

- 习惯完成统计
- 成功率分析
- 成就系统

## 快速开始

### 环境要求

- Node.js 18+
- MongoDB
- Redis
- pnpm

### 安装依赖

```bash
pnpm install
```

### 环境配置

复制 `.env.example` 文件为 `.env` 并配置以下环境变量：

```env
# 数据库配置
MONGODB_URI=mongodb://localhost:27017/schedule_management
REDIS_URL=redis://localhost:6379

# JWT 配置
JWT_SECRET=your_jwt_secret_key

# AI 配置
OPENAI_API_KEY=your_openai_api_key
```

### 开发模式运行

```bash
pnpm run dev
```

### 生产构建

```bash
pnpm run build
```

## Docker 部署

### 使用 Docker Compose

```bash
docker-compose up -d
```

### 构建 Docker 镜像

```bash
docker build -t schedule-management-backend .
```

## 开发指南

### 项目结构

```
src/
├── config/          # 配置文件
├── middlewares/     # 中间件
├── model/          # 数据模型
├── routes/         # 路由定义
├── service/        # 业务逻辑
├── types/          # TypeScript 类型定义
└── utils/          # 工具函数
```
