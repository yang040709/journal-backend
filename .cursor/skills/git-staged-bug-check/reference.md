# 暂存区 Bug 排查 — 参考清单

## 命令速查

PowerShell 用分号连接：

```bash
git status -sb
git diff --cached --stat
git diff --cached

# 单文件与 HEAD 对比（旧版）
git show HEAD:src/service/note.service.ts

# 只读搜调用方（在 monorepo 根或 backend）
rg "函数名|路由片段" src client/src admin/src
```

不默认跑全量测试。用户明确要求或 diff 极小时可选用：

```bash
cd backend; pnpm test -- path/to/related.test.ts
```

## 与 API 兼容 skill 分流

| 关注点 | 本 skill | `git-staged-api-compat-check` |
|--------|----------|-------------------------------|
| 逻辑错误、漏 await、空引用 | 是 | 否 |
| 鉴权漏检、错误码写错 | 是 | 仅当影响旧客户端行为时 |
| 响应字段删/改名、校验收紧 | 报告末尾提示另跑 | 是（主报告） |
| 跨端发版依赖 | 提示即可 | 是 |

## 按路径关注点

### 路由 `src/routes/`

- handler 是否漏 `await` service
- `try/catch` 是否吞错并返回成功
- 鉴权中间件是否挂在正确路由（含 Admin `/admin/*` vs C 端）
- 错误映射：业务 Error → HTTP status / `code` 是否与邻近路由一致

### 校验 `src/schemas/` / `z.object`

- `.optional()` / `.nullable()` / 默认值变更是否导致下游 `undefined` 解引用
- `.strip()` / 未知字段丢弃是否与 service 假设冲突（正确性角度；兼容性另跑 API skill）
- transform 后类型与 service 入参是否一致

### Service `src/service/`

- 条件分支反转（`===` vs `!==`、提前 return）
- 并发写：缺少事务 / 乐观锁时的双写
- 查询条件漏 `userId` / 租户边界 → 越权读
- 日期用本地时区 vs UTC 混用

### Model `src/model/`

- required / default 变更是否与已有文档不兼容导致运行时失败
- 索引或唯一约束变更是否引入写入失败（标风险）

### 中间件 / JWT `src/middleware/`、`src/utils/*Jwt*`

- 跳过鉴权的白名单路径是否过宽
- token 校验失败是否仍进入业务逻辑
- 密钥 / secret 是否被 `console.log` 或错误响应带出

### Scheduler

- 重复注册 cron、漏清除旧任务
- 失败重试是否放大副作用（重复扣减、重复通知）

### 测试 `tests/`

- 删除或放宽断言却扩大生产行为 → §2 风险
- 仅改 mock 不改实现时，确认 mock 仍反映真实契约

### 配置 / CI

- `.env.example` 新增/改名键而代码仍读旧键
- Dockerfile / workflow 破坏性命令（错删产物、错误工作目录）

## 归类规则

| 证据 | 报告章节 |
|------|----------|
| 可证明会错（逻辑反了、必崩路径、明确越权） | §1 确认的 Bug |
| 可疑但缺运行证据或依赖外部状态 | §2 高风险疑点 |
| 纯重构、文档、明确安全增量 | §3 非 Bug 或省略 |

## 报告质量

- 每条可独立理解：位置 + 旧→新 + 为何错 + 影响面。
- 不堆砌文件列表；按缺陷组织。
- 无问题时不过度展开，直接「没问题」。
