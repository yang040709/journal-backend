---
name: git-staged-split-commit
description: Analyzes git staged changes only, groups files by path into multiple commits (proposal at most 6 commits, prefer fewer by merging related groups) with Conventional Commit-style messages in Chinese, incorporates user edits to the proposal, and after explicit approval runs git reset plus batched git add/commit. Use when the user wants split commits from the index, end-of-day batch commits, or help writing messages for what's already staged.
disable-model-invocation: true
---

# Git 暂存区分批提交

## 范围与触发

- **仅处理当前暂存区**（`git diff --cached`）。不替用户决定「该不该暂存」某文件。
- 用户口述下班前大批量暂存、`写提交`、`分拆提交`、`按暂存区分多次 commit`、或载入本 skill 时按本流程执行。

## 禁止

- 用户未明示授权前：**不得**执行 `git commit`、`git merge`、`git push`，不得改写远端。
- **不得**默认使用 `git add -p` / 交互式分段；仅在用户明确要求对同一文件拆进不同提交时再讨论（本仓库默认整文件归入单次提交）。
- **不得**把含糊应答（单独一个「好」「行」等）当作执行提交的授权。

## 授权用语（满足其一才可执行写入）

用户须使用明确意向，例如：**可以**、**就这么提交**、**执行提交**。执行前必须用一句话复述：**将连续执行 N 次 `git commit`、每组主题与大致文件集合**。

## 前置检查

1. `git status -sb`、`git diff --cached --stat`。若缓存区无任何差异，告知用户先 `git add` 再唤起本流程。
2. **暂存与未暂存混在同一文件**：对 `git diff --cached --name-only` 列出路径，逐个检查 `git diff -- <path>` 是否为空。若非空：**停止自动提交**，说明「reset 会失去已暂存/未暂存边界」的风险，并请用户任选：
   - 执行 `git stash push --keep-index -m "guopai-split-unstaged"` 收走**未暂存** → 分拆提交完毕后 `git stash pop`；或
   - 用户自行整理工作区直至「所列暂存文件中无并行未暂存 diff」再继续。
3. 无上述冲突时再进入分析与执行。

## 分析分组（整文件粒度）

依据 **路径前缀** 与 **语义** 归档，使每条提交单一主题：

- **提案条数**：**最多 6 条提交**（含 6）；能更少则更好（例如 3～5 条能说清就不必凑满 6）。若按路径/语义自然拆分会超过 6 条：**合并**相邻或同源目录、把强相关改动并入同一条，或在一条里用 body 列出子主题；避免机械「一目录一提交」导致提案过长。
- `src/api/`、`src/pages/`、`src/components/`、`src/stores/`、`docs/`、`package.json` + lockfile、`src/constant/` 等可分属不同提交；强耦合的少量文件可并入同一条并在 body 注明。
- 为每组选择 Conventional **type**（见下表）与简短 **scope**（小写-kebab，如 `event-detail`、`tabbar-home`、`api`）。

| type       | 适用 |
|-----------|------|
| `feat`    | 新行为、新页面/API 接线、用户可见功能 |
| `fix`     | 缺陷修复 |
| `refactor`| 不改变对外行为的重组 |
| `docs`    | 仅文档 |
| `chore`   | 构建、依赖、格式化、脚手架 |
| `style`   | 纯样式/UI 调整且无逻辑变更时用；与代码格式工具区分不开的归 `chore` |

## 输出模板（给用户审阅）

按固定结构给出**提案**，便于用户点名改某一号。**N 须满足 1 ≤ N ≤ 6**（与上文「最多 6 条」一致）。

```markdown
## 分拆提交提案（共 N 条，N≤6）

### 提交 1
- **路径**： …（可折叠为目录层级）
- **message**：  
  feat(scope): 中文标题 Imperative Briefly

  （可选 body：动机、风险、兼容性，2～6 行）

### 提交 2
…

---
请直接回复要改的序号与修改意见；确认无误后用 **「可以」** 或 **「执行提交」** 授权本地提交。
```

- **标题行**：`<type>(<scope>): <中文描述>`，描述用动词开头短语（如「增加」「修复」「抽出」）。
- **正文**：如需说明，单独成段；避免在标题堆砌细节。

## 与用户迭代

用户修改 scope、title 或合并/拆分某组时：**只更新提案文本**，直至出现「授权用语」再上屏执行。

## 执行序列（仅授权后）

在仓库根目录执行（PowerShell / bash 均可的多 `-m` 传 body）：

1. **若曾因混合同步使用过 keep-index stash**：此处保持 stash 在未 pop 状态，先做下面步骤再 `git stash pop`（若有冲突协助用户手动解决）。
2. `git reset HEAD`（或等价的取消暂存，**不改变**已成功分离到工作区的内容；目的在于清空 index 以便按组重新 `git add`）。
3. **按提案顺序**：对每组 `git add -- <paths...>` → `git commit -m "<title>" [-m "<body line>" …]`。
4. 全部完成后 `git status` 确认：原暂存集合应已入账；必要时再 `git stash pop`。

严禁使用 `git commit -a` 以免纳入未安排的已跟踪修改。

若 `prepare-commit-msg`/`commit-msg` 等钩子失败：**不**绕过钩子；汇报错误输出，请用户修正或调整 message 后再试。

## 进阶与排障

见同目录 [reference.md](reference.md)。
