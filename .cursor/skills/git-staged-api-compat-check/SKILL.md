---
name: git-staged-api-compat-check
description: Audits git staged backend changes for backward compatibility with the previous API contract (HEAD). Compares routes, models, schemas, and service responses against old clients and cross-repo consumers. Use when the user asks to check staged changes for API compatibility, breaking changes, or old-version interface issues before commit or deploy.
disable-model-invocation: true
---

# Git 暂存区 API 兼容性排查

## 用户指令（原文）

请你查看当前git暂存区的文件有没有和旧版本的接口有兼容性的问题，请你排查一下，先不改动代码，把问题列出来就行，没有问题就说没问题

## 范围与触发

- **仅分析当前暂存区**（`git diff --cached`），基准为 **HEAD（旧版已提交后端）**。
- 默认 **只读**：不修改代码、不提交、不 push，除非用户另行要求。
- 适用目录：`backend/` 暂存改动；需联动时只读查看 `client/`、`admin/`、`docs/spec/`。

## 禁止

- 未获授权前不得改代码或「顺手修复」兼容性问题。
- 不得把「新增接口 / 新增响应字段」误判为 breaking（应标为向后兼容）。
- 不得跳过与 C 端 / Admin 的路径、字段消费方交叉核对。

## 执行流程

### 1. 收集 diff

并行执行：

```bash
git status -sb
git diff --cached --stat
git diff --cached
```

若暂存区为空，告知用户先 `git add` 再排查。

### 2. 定位 API 影响面

从暂存 diff 中筛选：

| 类别 | 重点文件 |
|------|----------|
| 路由契约 | `src/routes/*.ts` |
| 入参校验 | `src/schemas/*.ts`、route 内 `z.object` |
| 响应形状 | `src/service/*.ts`、`success(ctx, data)` 的 `data` |
| 持久化字段 | `src/model/*.ts` |
| 生成路径 | `buildFrontendPath`、小程序码 `page` 字段 |
| 常量枚举 | `src/constant/*.ts` |

对每条疑似 API 变更，用 `git show HEAD:<path>` 对比旧版字段/校验/行为。

### 3. 兼容性判定维度

按下列维度逐项检查（细则见 [reference.md](reference.md)）：

1. **响应字段删除或改名** → breaking
2. **请求字段删除** → breaking（Zod 静默 strip 仍算 breaking，需注明「静默丢弃」）
3. **校验收紧**（枚举、白名单、必填）→ 行为变更，旧客户端可能 400
4. **仅新增字段/新路由** → 向后兼容
5. **生成的前端路径 / 小程序 page 变更** → 与 C 端 `pages.json` 及已发布包是否同步发版
6. **读接口副作用**（如 ensureDocument）→ 标注，非契约 breaking

### 4. 交叉核对消费方

只读搜索 monorepo：

```bash
# 示例：在仓库根目录
rg "字段名|路由片段" client/src admin/src docs/spec
```

重点：

- C 端 `client/src/api/`、`store/`、`utils/` 是否仍发送已删字段
- Admin `admin/src/api/` 是否依赖变更后的路径或响应
- `docs/spec/feature/` 是否声明「不做遗留兼容」（若有，在结论中引用）

### 5. 输出报告

**有问题时**使用下列结构；**无 breaking / 行为风险 / 跨端发版依赖** 时，正文仅写：**没问题**（可附一句「均为向后兼容增量」）。

```markdown
## 暂存区 API 兼容性排查

**基准**：HEAD（`<short-sha>`）  
**暂存文件**：N 个

### 1. 破坏性变更（旧客户端/旧调用方会受影响）
- ...

### 2. 行为收紧（旧版能成功，新版可能 400/失败）
- ...

### 3. 向后兼容（旧客户端可忽略）
- ...

### 4. 跨端发版依赖（需与 client/admin 同步）
- ...

### 总结
| 级别 | 结论 |
|------|------|
| 相对旧后端 API | 有问题 / 无 breaking |
| 发版建议 | 如需协调，一句话说明 |
```

每条问题须包含：**接口路径**、**旧行为 → 新行为**、**受影响方**（旧 client / Admin / 外部调用方）。

## 本项目常见模式（Journal backend）

- 阅读主题：scope 在 User（`readingThemeApplyScope`），Note 上 `readingThemeScope` 移除即 breaking；catalog 白名单校验在 Admin 收窄后才与旧版分叉。
- 小程序路径：主包 `pages/...` 与分包 `packages/<root>/pages/...` 须与 `client/src/pages.json` 一致；backend 路径变更早于 client 分包上线会导致跳转/扫码失败。
- Theme id 列表：backend `readingThemeManifest.ts` 与 client `style-theme-presets.js` 应对齐；不对齐时标注「client 有、server 不认」风险。
- Koa 路由前缀：C 端 `/auth/*`、`/notes/*`；Admin `/admin/*`；公告公开 `/announcements/*`。

## 进阶清单

完整检查项与命令示例见 [reference.md](reference.md)。
