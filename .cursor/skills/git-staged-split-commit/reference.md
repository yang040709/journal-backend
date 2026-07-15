# git-staged-split-commit — 进阶说明

## 提案超过 6 个自然组时

将相邻目录或同一功能域合并为一条提交，在 **message body** 中简要列出所含子路径或子主题；若用户坚持更细粒度，可说明「当前 skill 约定提案 ≤6 条」并请其指定要合并的组或分两轮提交。

## `git stash push --keep-index` 与分拆的配合

用途：在有「暂存区 + 同文件未暂存」时，把工作区中非 index 的差异移入 stash，使 index 仍可被 `git reset HEAD` 后按文件组重新构造提交，且不丢失用户在 pop 前要保留的本地修改。

要点：

- stash 前先确认 `git status` 与用户理解一致。
- 多条 stash 时注意顺序：先 push keep-index，完成所有 `commit` 后再 `stash pop` 一次还原未暂存部分。
- `stash pop` 若冲突：按惯例解决冲突后 `git add` 再继续开发；本 skill 不强制自动解决。

## 仅标题、无正文的示例

```bash
git commit -m "feat(tabbar-home): 首页赛程卡片接入真实接口"
```

## 标题 + 多行正文

```bash
git commit -m "fix(event-detail): 修复取消报名弹窗在 iOS 上的穿透点击" \
  -m "将遮罩设为同档 z-index 并阻断 touch；与 EventCancelRegistrationPopup 行为一致。"
```

PowerShell 中续行可使用反引号或单次 `git commit -m "title" -m "body"`

## 空暂存或误操作撤销

- 尚未 push：可用 `git reset --soft HEAD~K`（K 为误提交个数）撤回最近若干 commit，内容与 index 保留，再重来分组（**提醒用户**：仅在其明确要求且未与他人同步时使用）。

## hooks 失败

复述 hook 报错；建议用户在本机脚本或模板中收窄规则，或使用项目允许的跳过方式（仅在用户明示且合规时）。
