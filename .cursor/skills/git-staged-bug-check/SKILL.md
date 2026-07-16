---
name: git-staged-bug-check
description: Audits git staged backend changes for logic bugs, correctness defects, and high-risk regressions against HEAD. Read-only by default; lists confirmed bugs and risks without editing code. Use when the user asks to check staged changes for bugs, logic errors, or defects before commit.
disable-model-invocation: true
---

# Git 暂存区 Bug 排查

## 用户指令（原文）

请你查看当前 git 暂存区的代码有没有什么 bug，请你排查一下，先不改动代码，把问题列出来就行，没有问题就说没问题

## 范围与触发

- **仅分析当前暂存区**（`git diff --cached`），基准为 **HEAD**。
- 默认 **只读**：不修改代码、不提交、不 push，除非用户另行要求。
- 适用目录：`backend/` 暂存改动；需理解影响面时只读查看 `client/`、`admin/`、`docs/spec/`，但不以 C 端 / Admin 自身 bug 为主线。
- 在 `backend/` 目录（或该 git 仓库根）执行 git 命令。

## 禁止

- 未获授权前不得改代码或「顺手修复」。
- 不得把 style / 命名偏好标成 bug。
- 不得把未暂存工作区 diff 混进结论（可提示存在同文件未暂存，但仍以 staged 为准）。
- 不得展开完整 API 兼容矩阵（交给同目录 `git-staged-api-compat-check`）。

## 执行流程

### 1. 收集 diff

并行执行：

```bash
git status -sb
git diff --cached --stat
git diff --cached
```

若暂存区为空，告知用户先 `git add` 再排查。

### 2. 定位风险面

从暂存 diff 中筛选：

| 类别 | 重点文件 |
|------|----------|
| 路由 / 入口 | `src/routes/*.ts`、`src/app.ts`、`src/index.ts` |
| 入参校验 | `src/schemas/*.ts`、route 内 `z.object` |
| 业务逻辑 | `src/service/*.ts` |
| 持久化 | `src/model/*.ts` |
| 中间件 / 鉴权 | `src/middleware/**`、`src/utils/*Jwt*` |
| 工具 / 常量 | `src/utils/*.ts`、`src/constant/*.ts` |
| 调度 | `src/scheduler/**` |
| 测试 / CI / 配置 | `tests/**`、`.github/**`、`Dockerfile`、`.env.example` |

对可疑 hunk 用 `git show HEAD:<path>` 对比旧行为。

### 3. 排查维度

按下列维度逐项检查（细则见 [reference.md](reference.md)）：

1. **正确性**：条件反转、漏 `await`、错误分支吞掉、off-by-one、空 / undefined 解引用
2. **异步 / 并发**：竞态、重复调度、未处理的 Promise rejection
3. **数据与校验**：Zod 静默 strip、错误默认值、时区 / 日期边界、事务 / 一致性遗漏
4. **HTTP / 业务**：错误状态码与业务 code 不一致、鉴权 / 权限漏检
5. **安全**（diff 触及才查）：鉴权绕过、密钥进日志、敏感字段未 scrub
6. **回归信号**：删 / 改窄测试却扩大行为；缺测的关键路径标「风险」而非硬 bug（除非能证明错误）
7. **构建 / 配置**：`.env.example` 与代码读取不一致、Dockerfile / CI 破坏性变更（若在暂存内）

必要时只读搜调用方（`rg`）。**不默认跑全量** `pnpm test`（除非用户另要求，或 diff 极小且命令廉价）。

### 4. 与 API 兼容 skill 分流

- 本 skill 聚焦 **逻辑 / 正确性**。
- 若暂存明显触及路由契约、schema、响应形状：在报告末尾加一行「建议另跑 API 兼容排查」（`git-staged-api-compat-check`），**不**展开兼容专项报告。
- 分拆提交交给 `git-staged-split-commit`。

### 5. 输出报告

**有确认 Bug 或高风险疑点时**使用下列结构；**无确认 Bug 且无疑点**时，正文仅写：**没问题**（可附一句「均为低风险增量」）。

```markdown
## 暂存区 Bug 排查

**基准**：HEAD（`<short-sha>`）
**暂存文件**：N 个

### 1. 确认的 Bug（应修）
- 文件:行 / 符号 — 旧行为 → 新行为 — 为何错 — 影响面

### 2. 高风险疑点（证据不足但值得修前确认）
- ...

### 3. 非 Bug（可忽略）
- 纯重构/格式/文档/明确向后兼容增量等一句话带过

### 总结
| 级别 | 结论 |
|------|------|
| 确认 Bug | 有 / 无 |
| 建议 | 一句话 |
```

每条问题须包含：**位置**（文件与符号）、**旧行为 → 新行为**、**为何是 bug / 风险**、**影响面**。

## 进阶清单

完整检查项与命令示例见 [reference.md](reference.md)。
