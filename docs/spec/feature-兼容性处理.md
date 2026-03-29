# 功能：后端 API 与旧版小程序兼容性说明

## 1. 背景与目标

本仓库某次迭代（以 **git 暂存区** 相对上一版后端的差异为准）在笔记搜索、标签策略、错误响应等方面调整了**接口契约**。旧版微信小程序若仍按旧约定解析响应或依赖「自由标签」行为，可能出现**运行时异常**（如对非数组调用数组方法）或**数据被静默修改**（标签丢失）。

本文档用于：

- 列出**与小程序直连相关的**兼容性风险与等级；
- 给出**推荐处理方式**（发版策略、可选后端兼容、运营补数据等）；
- 提供**变更摘要表**与**错误码扩展**说明，便于前后端对齐最低版本或特性开关。

**不涉及**：管理端 Admin、部署脚本、仅 H5/浏览器场景的 CORS 细节（文末仅简要提示）。

---

## 2. 变更摘要表

| 接口 / 范围 | 风险等级 | 旧契约（推断） | 新契约 | 建议 |
|-------------|----------|----------------|--------|------|
| `GET /notes/search` | **高** | `data` 为手帐对象数组；服务层单次最多约 **100** 条 | `data` 为分页对象：`{ items, total, page, limit, totalPages }`；默认 `page=1`、`limit=20` | 新版本解析 `data.items` 并分页；或后端增加 legacy 开关（见 §3.1）；或标明最低客户端版本 |
| `POST/PUT /notes`（`tags`） | **高** | 可保存任意字符串标签（历史行为） | 经 `NotePresetTagService.filterToPreset` 过滤，**仅保留**服务端预设白名单内标签 | 运营补全白名单；或产品接受「仅预设标签」；或技术方案区分「自定义标签」字段（见 §3.2） |
| `PUT /covers/quick` 部分错误 | **中** | 部分业务错误返回 **500** + `INTERNAL_ERROR` | 匹配业务文案时改为 **400** + `PARAM_ERROR` | 客户端勿仅依赖「非 500 即成功」；按 `code`/`message` 展示 |
| `error()` 响应体 | **低** | 错误时 `data` 多为 `null` | 可为 `null` 或**对象**（如额度明细） | 错误分支勿假设 `data` 恒为 `null`（若需可判空对象） |
| `Note` 等模型新字段 | **低** | 无 `images` 等 | 响应中可能含 `images: []` 等 | 客户端忽略未知字段即可 |
| 新路由（`/api/upload`、`/stats/*`、`/notes/ai/*` 等） | **低** | 不存在 | 新增 | 旧版不调用的接口无影响 |

---

## 3. 详细说明

### 3.1 `GET /notes/search`（破坏性）

**实现参考**：[`src/routes/note.routes.ts`](../../src/routes/note.routes.ts) 使用 [`paginatedSuccess`](../../src/utils/response.ts)；[`NoteService.searchNotes`](../../src/service/note.service.ts) 返回 `{ items, total }` 并分页。

**现象**：

1. **结构**：若旧版执行 `res.data.map(...)` 或 `res.data.length`，`data` 变为对象后可能**抛错**。
2. **语义**：旧版单次最多约 **100** 条；新版默认每页 **20** 条，不翻页则列表**不完整**。

**推荐处理**：

- **客户端升级（推荐）**：统一从 `data.items` 读取列表，使用 `page`、`limit`、`total`（或 `totalPages`）做分页。
- **发版节奏**：新版本全量后再关旧契约，或限制旧版包可见范围。
- **可选后端兼容**（需维护成本）：例如查询参数 `legacy=1` 或版本头，在路由层对旧客户端仍 `success(ctx, items, ...)`，并固定上限与旧版一致（如 100）；新客户端走 `paginatedSuccess`。

---

### 3.2 创建 / 更新手帐时的 `tags`（数据语义）

**实现参考**：[`NoteService.createNote` / `updateNote`](../../src/service/note.service.ts) 调用 [`NotePresetTagService.filterToPreset`](../../src/service/notePresetTag.service.ts)，预设列表来自 `SystemConfig`（`note_preset_tags`）及种子数据。

**现象**：用户输入的、不在服务端白名单内的标签在保存后会被**静默丢弃**，表现为「标签丢失」「编辑后变少」。

**推荐处理**：

- **运营 / 管理端**：将历史高频标签纳入预设配置，减少误伤。
- **产品声明**：若战略上仅允许预设标签，应在小程序内明确提示，避免用户认为是缺陷。
- **技术扩展**（若需支持自由标签）：需单独字段或策略，例如仅新客户端写入「自定义标签」集合，或与预设过滤解耦；属独立需求，不在本文档范围内实现约定。

---

### 3.3 快捷封面 `PUT /covers/quick`

**实现参考**：[`src/routes/cover.routes.ts`](../../src/routes/cover.routes.ts) 中对部分错误使用 `isBizError` 将 HTTP 状态与 `ErrorCodes` 从 500/9999 调整为 400/1001。

**现象**：依赖「只要 500 才提示服务器错误」的客户端，提示文案或埋点可能变化；通常对用户**更友好**。

**推荐处理**：以 `code` 与 `message` 为准分支，避免写死 HTTP 状态与业务含义的绑定。

---

### 3.4 错误响应 `data` 字段

**实现参考**：[`src/utils/response.ts`](../../src/utils/response.ts) 中 `error()` 支持传入 `data`；未传时仍为 `null`。

**推荐处理**：旧客户端可继续只读 `message`；若需展示额度等，可适配 `data` 对象。

---

### 3.5 新增错误码（`ErrorCodes`）

下列为扩展能力，旧客户端未识别时可回退为展示 `message`：

| 区间 | 含义（示例） |
|------|----------------|
| 4001–4005 | 上传与日配额、广告奖励相关 |
| 4101–4104 | AI 写手帐 / 广告奖励相关 |

完整定义见 [`src/utils/response.ts`](../../src/utils/response.ts) 中 `ErrorCodes`。

---

### 3.6 新增字段与仅新增路由

- **响应多字段**：如 `Note.images` 等，旧版忽略即可。
- **未调用的接口**：不产生影响。

---

### 3.7 其他（H5 / 浏览器，小程序风险低）

[`src/middlewares/adminCors.middleware.ts`](../../src/middlewares/adminCors.middleware.ts) 对 `OPTIONS` 可能直接返回 204。微信小程序 `wx.request` 多数场景**不依赖**浏览器 CORS 预检；若同一后端域名给 **H5 跨域** 使用，需单独联调。

---

## 4. 版本与协同（占位）

| 项目 | 说明 |
|------|------|
| 最低小程序版本 | （由产品填写，例如「搜索与标签新行为自 x.y.z 起」） |
| 后端发版标签 / 分支 | （与本次部署分支或 tag 对齐） |
| 是否启用 legacy 搜索 API | （是 / 否；若否，旧版须升级或下线） |

---

## 5. 相关源码索引

| 主题 | 路径 |
|------|------|
| 搜索路由与分页响应 | [`src/routes/note.routes.ts`](../../src/routes/note.routes.ts) |
| 搜索服务实现 | [`src/service/note.service.ts`](../../src/service/note.service.ts) |
| 预设标签过滤 | [`src/service/notePresetTag.service.ts`](../../src/service/notePresetTag.service.ts) |
| 统一响应与错误码 | [`src/utils/response.ts`](../../src/utils/response.ts) |
| 封面快捷接口 | [`src/routes/cover.routes.ts`](../../src/routes/cover.routes.ts) |

---

## 6. 修订记录

| 日期 | 说明 |
|------|------|
| 2026-03-29 | 初版：基于暂存区 diff 与代码审查整理兼容性风险与处理建议 |
