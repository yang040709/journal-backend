# 功能：开发环境独立部署（dev 分支 / Mongo 27019）

## 1. 背景与目标

仓库已具备**正式上线**链路：`main` 分支推送 → GitHub Actions 构建镜像 → 服务器 `/opt/journal` 使用 `docker-compose.yml` 拉起应用与 MongoDB（生产 Mongo 宿主机映射为 `127.0.0.1:27018:27017`）。

本次需求是在**不替换现网流程**的前提下，增加一套**开发环境部署**：

| 维度 | 正式上线（现有） | 开发上线（目标） |
|------|------------------|-------------------|
| 触发分支 | `main` | `dev` |
| 服务器目录 | `/opt/journal`（现有约定） | 建议独立目录，例如 `/opt/journal-dev`，与生产隔离 |
| Mongo 宿主机端口 | `127.0.0.1:27018` → 容器 27017 | `127.0.0.1:27019` → 容器 27017（由你在宿主机与 nginx 侧自行衔接） |
| 应用对外端口 | `3001:3000`（现有 compose） | 可在 `docker-compose.dev.yml` 中约定为另一宿主机端口（如 `3002:3000`），避免与生产冲突 |
| 反向代理 | 由你方在服务器配置 nginx | 同上，文档仅约定端口与 upstream，**具体 nginx 由你自行配置** |
| 镜像 tag | `yang0709/journal-backend:latest` | 建议使用独立 tag，例如 `yang0709/journal-backend:dev`，避免与 `latest` 互相覆盖 |

**已实现文件**：根目录 [`docker-compose.dev.yml`](../../docker-compose.dev.yml)、[`.github/workflows/deploy-dev.yml`](../../.github/workflows/deploy-dev.yml)。Secrets 与服务器准备见下文第 9–11 节。

---

## 2. 现有生产 `docker-compose.yml` 与完整业务配置的差异

当前生产 `docker-compose.yml` 仅向 `app` 注入：

- `MONGO_URI`、`JWT_SECRET`、`WX_APPID`、`WX_SECRET`、`PORT`
- 日志：`LOG_LEVEL`、`LOG_DIR`、`LOG_MAX_SIZE`、`LOG_MAX_FILES`
- `NODE_ENV=production`

而项目本地/演示完整配置见仓库根目录 **`.env.demo`**（与 `.env.example` 对齐扩展能力）。相对生产 compose，**下列类别在生产 compose 中缺失或未传入容器**，若开发/完整功能联调需要，应在开发版 compose 或部署脚本中补齐（或通过 `env_file` 挂载）：

| 类别 | 变量（摘自 `.env.demo`） | 说明 |
|------|--------------------------|------|
| 后台管理 | `ADMIN_JWT_SECRET`、`ADMIN_BOOTSTRAP_USERNAME`、`ADMIN_BOOTSTRAP_PASSWORD`；可选 `ADMIN_JWT_EXPIRES_IN` | 管理端登录与首轮 bootstrap；须与 `JWT_SECRET` 区分 |
| 敏感词 | `SENSITIVE_WORDS_KEY` | 32 字节用途的密钥占位，生产须换强随机值 |
| Redis | `REDIS_URL` | 若代码路径依赖缓存，容器内需能解析到可达的 Redis（同 compose 内服务或外部地址） |
| 腾讯云 COS | `COS_SECRET_ID`、`COS_SECRET_KEY`、`COS_BUCKET`、`COS_REGION`、`COS_PUBLIC_DOMAIN`、`COS_UPLOAD_DIR`、`COS_STS_DURATION_SECONDS`、`COS_MAX_FILE_SIZE_MB` | 直传/STS 等上传链路 |
| 配额与 AI | `UPLOAD_DAILY_BASE_LIMIT`、`DEEPSEEK_API_KEY`、`DEEPSEEK_API_BASE`、`DEEPSEEK_MODEL`、`AI_DAILY_BASE_LIMIT` | 上传日配额与 AI 写手帐（详见 `.env.example` 中可选扩展） |

**说明**：生产环境可能通过镜像内默认值、或未启用部分功能，因而未在 compose 中写全；**开发独立栈**若要与本地 `.env.demo` 行为一致，建议按上表在 **开发 compose / CI 生成的 `.env`** 中显式配置，避免「本地正常、服务器缺变量」的问题。

---

## 3. `.env.demo` 全量变量清单（部署对齐用）

以下与 `.env.demo` 第 1–44 行一致，作为**开发服务器环境变量完整性**的检查表（值在服务器与 GitHub Secrets 中配置，勿将真实密钥提交仓库）。

**服务与运行时**

- `PORT`（容器内一般为 `3000`，与 compose `ports` 映射配合）
- `NODE_ENV`（开发栈可设为 `development` 或按团队约定 `production` + 独立域名）
- `MONGO_URI`（Compose 内应形如 `mongodb://mongo:27017/<库名>`，与 backup 服务一致）

**鉴权与微信**

- `JWT_SECRET`
- `WX_APPID`
- `WX_SECRET`

**Redis（可选）**

- `REDIS_URL`

**敏感词**

- `SENSITIVE_WORDS_KEY`

**日志**

- `LOG_LEVEL`、`LOG_DIR`、`LOG_MAX_SIZE`、`LOG_MAX_FILES`  
  （容器内 `LOG_DIR` 建议与生产一致使用 `/app/logs` 并挂载卷。）

**腾讯云 COS**

- `COS_SECRET_ID`、`COS_SECRET_KEY`、`COS_BUCKET`、`COS_REGION`、`COS_PUBLIC_DOMAIN`、`COS_UPLOAD_DIR`、`COS_STS_DURATION_SECONDS`、`COS_MAX_FILE_SIZE_MB`

**上传与 AI**

- `UPLOAD_DAILY_BASE_LIMIT`
- `DEEPSEEK_API_KEY`、`DEEPSEEK_API_BASE`、`DEEPSEEK_MODEL`、`AI_DAILY_BASE_LIMIT`

**后台管理**

- `ADMIN_JWT_SECRET`
- 可选：`ADMIN_JWT_EXPIRES_IN`
- `ADMIN_BOOTSTRAP_USERNAME`、`ADMIN_BOOTSTRAP_PASSWORD`（仅无超级管理员时 bootstrap；生产须强密码）

若启用 `.env.example` 中其它项（如 `ADMIN_CORS_ORIGIN`、广告奖励额度等），按业务需要在开发环境单独追加。

---

## 4. 开发版 Docker Compose 设计要点（建议稿）

建议新增 **`docker-compose.dev.yml`**（文件名可调整，与 CI 中上传文件名一致即可），与生产差异要点：

1. **项目名或容器名**：使用不同 `name:` 或明确 `container_name` 前缀（如 `journal-dev-*`），避免与生产 `docker compose` 默认网络/卷冲突。
2. **Mongo 端口**：`ports` 使用 `127.0.0.1:27019:27017`，满足「服务器暴露 27019」的约定。
3. **应用端口**：宿主机端口与生产 `3001` 区分，例如 `3002:3000`。
4. **卷**：独立 volume 名（如 `mongo_data_dev`），避免误用生产数据。
5. **环境变量**：按第三节清单，通过 `environment` 或 `env_file: .env` 注入；**`MONGO_URI` 必须与 dev 的 mongo 服务主机名、库名一致**；`backup` 服务若保留，`MONGO_URI` 与 app 相同。
6. **Redis**：若需要与 `.env.demo` 一致，可增加 `redis` 服务，并将 `REDIS_URL=redis://redis:6379` 写入 app；否则指向你方已有 Redis 地址。

当前生产 compose **未包含 Redis 服务**，开发栈是否新增 Redis 由功能与联调需求决定。

---

## 5. 开发版 GitHub Actions 设计要点（建议稿）

建议新增 **`.github/workflows/deploy-dev.yml`**（或同等命名），与现有 `deploy.yml` 差异要点：

| 项 | 建议 |
|----|------|
| 触发 | `push` → `branches: [dev]` |
| 镜像 tag | `yang0709/journal-backend:dev`（或组织规定的 dev tag） |
| 上传文件 | `docker-compose.dev.yml`（若文件名不同，与 scp `source` 一致） |
| 服务器目标路径 | 独立目录，如 `/opt/journal-dev`，避免覆盖 `/opt/journal` |
| 远程脚本 | `docker compose -f docker-compose.dev.yml`；`docker pull` 对应 dev tag |
| `.env` 或 Secrets | 与生产类似用 `cat > .env` 或 `env_file`，但应使用**开发专用** Secrets（如 `JWT_SECRET_DEV`、`WX_APPID` 是否与生产共用由产品决定；**建议密钥与生产隔离**） |

**Secrets 规划建议**：在 GitHub 仓库中为 dev 流水线单独配置 Secret（命名示例：`JWT_SECRET`、`ADMIN_JWT_SECRET` 的 dev 变体，或统一前缀），避免 dev 与 main 共用同一 `JWT_SECRET` 导致 token 跨环境混用风险。

---

## 6. Nginx 与端口（由你方实施）

本文档不规定具体 `server`/`location` 写法。约定层面：

- 应用在宿主机监听端口与 **`docker-compose.dev.yml` 中 `app.ports` 左值**一致（例如 `3002`）。
- Mongo **仅本机**访问时保持 `127.0.0.1:27019:27017`；若需外网或内网其它机器访问，需你自行评估 bind 地址与安全组，**不建议**默认 `0.0.0.0` 暴露无鉴权 Mongo。

---

## 7. 落地验收清单（建议）

- [x] 仓库中存在 `docker-compose.dev.yml`，Mongo 映射为 `127.0.0.1:27019:27017`，应用端口 `3002` 与生产不冲突。
- [x] `dev` 分支推送触发 `deploy-dev.yml`：构建并推送 `yang0709/journal-backend:dev`，目标机 `pull` 后 `compose up`（需配置 Secrets 与目录，见第 9–11 节）。
- [ ] 容器内环境变量与第三节清单一致，关键路径（登录、上传、AI、管理端）在开发服务器上可测通（部署后自测）。
- [ ] 生产目录 `/opt/journal` 与开发目录互不影响（卷、端口、镜像 tag）。

---

## 8. 文档维护

- **关联文件**：根目录 `docker-compose.yml`、`docker-compose.dev.yml`、`.github/workflows/deploy.yml`、`.github/workflows/deploy-dev.yml`、`.env.demo`、`.env.example`。
- **变更说明**：若后端新增必填环境变量，应同步更新 `.env.example`、`.env.demo`、`docker-compose.dev.yml`、`deploy-dev.yml` 与本节清单。

---

## 9. GitHub Actions：`deploy-dev.yml` 所需 Secrets

以下与 [`.github/workflows/deploy-dev.yml`](../../.github/workflows/deploy-dev.yml) 中引用一致。连接类、微信、Redis、敏感词、COS、DeepSeek、管理端 bootstrap 等 **Secret 名称与正式环境一致**（与生产在 GitHub 中配置同一组 Secret 即可）。仅用户 JWT 使用 `JWT_SECRET_DEV`，与生产 `deploy.yml` 使用的 `JWT_SECRET` 区分，避免 dev/main 镜像混用 token。

| Secret 名称 | 说明 |
|-------------|------|
| `DOCKERHUB_USERNAME` | Docker Hub 登录（与生产相同） |
| `DOCKERHUB_TOKEN` | Docker Hub Token |
| `SERVER_HOST` | 部署主机 |
| `SERVER_USER` | SSH 用户 |
| `SERVER_SSH_KEY` | SSH 私钥 |
| `SERVER_PORT` | SSH 端口 |
| `JWT_SECRET_DEV` | 用户 JWT（dev 专用；生产 `deploy.yml` 使用 `JWT_SECRET`） |
| `WX_APPID` | 微信小程序 AppID（与生产相同） |
| `WX_SECRET` | 微信小程序 Secret（与生产相同） |
| `REDIS_URL` | 可选；不需要 Redis 时可留空，生成 `REDIS_URL=`（与生产同名） |
| `SENSITIVE_WORDS_KEY` | 敏感词加密密钥（与生产同名） |
| `COS_SECRET_ID` | 腾讯云 COS SecretId（与生产同名） |
| `COS_SECRET_KEY` | 腾讯云 COS SecretKey（与生产同名） |
| `COS_BUCKET` | COS Bucket（与生产同名） |
| `COS_REGION` | COS 地域（与生产同名） |
| `COS_PUBLIC_DOMAIN` | COS 访问域名（与生产同名） |
| `DEEPSEEK_API_KEY` | DeepSeek API Key（与生产同名） |
| `ADMIN_JWT_SECRET` | 管理端 JWT，须与用户 JWT 区分（与生产同名） |
| `ADMIN_BOOTSTRAP_USERNAME` | 无超级管理员时的 bootstrap 用户名（与生产同名） |
| `ADMIN_BOOTSTRAP_PASSWORD` | bootstrap 密码（与生产同名） |

流水线中写死的非敏感默认值（与当前 `deploy-dev.yml` 一致）：`NODE_ENV=development`、`LOG_LEVEL`/`LOG_MAX_*`、`COS_UPLOAD_DIR=journal`、`COS_STS_DURATION_SECONDS=1800`、`COS_MAX_FILE_SIZE_MB=2`、`UPLOAD_DAILY_BASE_LIMIT=15`、`DEEPSEEK_API_BASE`/`DEEPSEEK_MODEL`/`AI_DAILY_BASE_LIMIT`、`ADMIN_JWT_EXPIRES_IN=7d`。若需改为可配置，可再改为 Repository variables 或新增 Secret。

---

## 10. 服务器首次准备（运维）

在**首次**运行 dev 流水线前于目标机执行（路径与计划一致）：

```bash
sudo mkdir -p /opt/journal-dev/logs /opt/journal-dev/backups
sudo chown -R "$USER:$USER" /opt/journal-dev
```

确保宿主机 **3002**、**127.0.0.1:27019** 未被占用；生产栈占用 **3001**、**27018** 时不应冲突。反向代理将 upstream 指向 **`127.0.0.1:3002`**（第 6 节）。

---

## 11. 推送后手动验证（dev）

1. 向 `dev` 分支推送代码，确认 GitHub Actions「Deploy dev with Docker Compose」成功。
2. 在服务器执行 `sudo docker ps`，可见 `journal-dev` 相关容器及镜像 `yang0709/journal-backend:dev`。
3. `curl -sS http://127.0.0.1:3002/`（或项目健康检查路径）确认进程可访问。
4. 自测登录、上传、AI、管理端等关键路径；Mongo 仅本机时：`mongosh "mongodb://127.0.0.1:27019/journal"`（库名与 compose 内一致为 `journal`）。

**注意**：首次推送前须已在 Docker Hub 存在 `dev` tag 的构建成功记录；否则服务器 `docker pull` 会失败，属预期，重跑成功流水线即可。
