# ---------------- 第一阶段：构建 TypeScript ----------------
FROM node:22-alpine AS builder

WORKDIR /app

RUN npm install -g pnpm

COPY package.json pnpm-lock.yaml ./
# 只安装生产依赖（加快构建、减小体积）
RUN pnpm install --prod=false  # 先装全部以便构建
COPY . .
# 构建产物到 dist/
RUN pnpm exec tsup

# ---------------- 第二阶段：运行时 ----------------
FROM node:22-alpine AS runner

WORKDIR /app

# 安装生产依赖（不含 devDependencies）
COPY package.json pnpm-lock.yaml ./
RUN npm install -g pnpm && \
  pnpm install

# 从 builder 阶段复制编译后的代码
COPY --from=builder /app/dist ./dist

# 暴露端口
EXPOSE 3000

# 启动应用（假设你的入口是 dist/index.js）
CMD ["node", "dist/index.js"]