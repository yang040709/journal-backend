# API 兼容性排查 — 参考清单

## 命令速查

```bash
# 暂存区概览
git status -sb
git diff --cached --stat

# 单文件与 HEAD 对比（旧版）
git show HEAD:src/routes/user.routes.ts

# 在仓库根目录搜消费方
rg "readingThemeScope|/auth/me-profile" client/src admin/src

# 对比 backend manifest 与 client preset（示例）
cd backend; npx tsx -e "import { getManifestThemeIdsByStyle } from './src/constant/readingThemeManifest.ts'; console.log(JSON.stringify(getManifestThemeIdsByStyle()))"
cd client; node -e "import { getThemesByStyleKey } from './src/components/export-image-preview/style-theme-presets.js'; ..."
```

## Breaking vs 非 Breaking

| 变更类型 | 判定 | 报告归类 |
|----------|------|----------|
| 响应少字段 | Breaking | §1 |
| 请求少字段且旧客户端仍发送 | Breaking（注明 Zod strip / 400） | §1 或 §2 |
| 响应多字段 | 兼容 | §3 |
| 新路由 | 兼容（旧客户端不调） | §3 |
| 校验更严 | 行为变更 | §2 |
| 默认值变化且影响未传参客户端 | 行为变更 | §2 |
| 错误码 / HTTP 状态变化 | 行为变更 | §2 |
| DB 读接口写入 SystemConfig | 副作用 | 正文脚注，非 §1 |

## 路由排查顺序

1. **入参**：`z.object` 增删字段、`.enum()`、`.nullable()`、`.optional()` 变化。
2. **出参**：service 返回对象、`success(ctx, data)` 的 `data` 结构。
3. **错误分支**：新增 `instanceof XxxError` → 是否把原 500 改为 400。
4. **副作用**：GET 是否触发 `ensureDocument`、`create` 等写库。

## 模型字段移除

- Mongoose schema 删除字段 → GET 通常不再返回该字段（即使 Mongo 文档仍有旧值）。
- 标注：旧客户端读不到 / 写不进去 / 静默丢弃。

## 跨 repo 路径

检查项：

1. 暂存区 `buildFrontendPath`、小程序码 `page` 字符串。
2. `git show HEAD:client/src/pages.json` 与工作区 `client/src/pages.json` 是否一致。
3. 若 backend 已改分包路径而 client 未提交分包改造 → **§4 跨端发版依赖**。

## 集成测试信号

暂存区若含 `tests/integration/**` 变更，阅读断言：

- `toBeUndefined()` 原字段 → 确认 intentional breaking。
- 新增 400 用例 → 对应 §2 行为收紧。

## 文档对齐

优先读：

- `docs/spec/feature/feature-手帐详情阅读主题.md`（§7 API、§7.4 迁移、是否声明不做遗留兼容）
- `docs/功能变更.md`

若文档写明「功能未上线 / 不做 xxx 兼容」，在总结中引用，但不抵消 §4 跨端发版风险。

## 报告质量

- 每条问题可独立理解，含路径与方法（GET/PUT）。
- 不堆砌文件列表；按**接口契约**组织。
- 无问题时不过度展开，直接「没问题」。
