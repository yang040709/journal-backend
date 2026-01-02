# 手帐应用后端接口文档

## 概述

本文档描述了手帐应用的后端 RESTful API 接口。所有接口都遵循统一的响应格式，并使用 JWT 进行身份验证（除登录接口外）。

## 基础信息

- **基础 URL**: `http://localhost:3000/api`
- **响应格式**: JSON
- **认证方式**: JWT Token（Bearer Token）

## 响应格式

### 成功响应

```json
{
  "code": 0,
  "message": "success",
  "data": {...},
  "timestamp": 1640995200000
}
```

### 分页响应

```json
{
  "code": 0,
  "message": "success",
  "data": {
    "items": [...],
    "total": 100,
    "page": 1,
    "limit": 20,
    "totalPages": 5
  },
  "timestamp": 1640995200000
}
```

### 错误响应

```json
{
  "code": 1001,
  "message": "参数验证失败",
  "data": null,
  "timestamp": 1640995200000
}
```

## 错误码

| 错误码 | 描述           | HTTP 状态码 |
| ------ | -------------- | ----------- |
| 0      | 成功           | 200         |
| 1001   | 参数验证失败   | 400         |
| 1002   | 认证失败       | 401         |
| 1003   | 权限不足       | 403         |
| 1004   | 资源不存在     | 404         |
| 1005   | 资源已存在     | 409         |
| 2001   | 手帐本不存在   | 404         |
| 2002   | 手帐不存在     | 404         |
| 3001   | 用户凭证错误   | 401         |
| 3002   | 用户已存在     | 409         |
| 3003   | 用户不存在     | 404         |
| 9999   | 服务器内部错误 | 500         |

## 认证

### 登录接口

获取 JWT Token，后续所有接口都需要在请求头中携带此 Token。

**请求头**:

```
Authorization: Bearer {token}
```

## 接口列表

### 1. 认证接口

#### 1.1 用户登录

- **URL**: `/api/auth/login`
- **方法**: `POST`
- **认证**: 不需要
- **描述**: 使用微信小程序 code 登录，获取 JWT Token

**请求参数**:

```json
{
  "code": "微信小程序登录凭证"
}
```

**响应**:

```json
{
  "code": 0,
  "message": "登录成功",
  "data": {
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "userId": "用户ID"
  },
  "timestamp": 1640995200000
}
```

### 2. 手帐本接口

所有手帐本接口都需要认证。

#### 2.1 获取手帐本列表

- **URL**: `/api/note-books`
- **方法**: `GET`
- **认证**: 需要
- **描述**: 获取用户的手帐本列表（分页）

**查询参数**:
| 参数名 | 类型 | 必填 | 默认值 | 描述 |
|--------|------|------|--------|------|
| page | number | 否 | 1 | 页码 |
| limit | number | 否 | 20 | 每页数量（1-100） |
| sortBy | string | 否 | "updatedAt" | 排序字段：createdAt, updatedAt, title |
| order | string | 否 | "desc" | 排序顺序：asc, desc |

**响应**:

```json
{
  "code": 0,
  "message": "获取手帐本列表成功",
  "data": {
    "items": [
      {
        "id": "手帐本ID",
        "title": "手帐本标题",
        "coverImg": "封面图片URL",
        "count": 10,
        "userId": "用户ID",
        "createdAt": "2024-01-01T00:00:00.000Z",
        "updatedAt": "2024-01-01T00:00:00.000Z"
      }
    ],
    "total": 100,
    "page": 1,
    "limit": 20,
    "totalPages": 5
  },
  "timestamp": 1640995200000
}
```

#### 2.2 获取单个手帐本

- **URL**: `/api/note-books/:id`
- **方法**: `GET`
- **认证**: 需要
- **描述**: 获取指定 ID 的手帐本详情

**路径参数**:
| 参数名 | 类型 | 必填 | 描述 |
|--------|------|------|------|
| id | string | 是 | 手帐本 ID |

**响应**:

```json
{
  "code": 0,
  "message": "获取手帐本成功",
  "data": {
    "id": "手帐本ID",
    "title": "手帐本标题",
    "coverImg": "封面图片URL",
    "count": 10,
    "userId": "用户ID",
    "createdAt": "2024-01-01T00:00:00.000Z",
    "updatedAt": "2024-01-01T00:00:00.000Z"
  },
  "timestamp": 1640995200000
}
```

#### 2.3 创建手帐本

- **URL**: `/api/note-books`
- **方法**: `POST`
- **认证**: 需要
- **描述**: 创建新的手帐本

**请求体**:

```json
{
  "title": "手帐本标题",
  "coverImg": "封面图片URL（可选）"
}
```

**响应**:

```json
{
  "code": 0,
  "message": "创建手帐本成功",
  "data": {
    "id": "手帐本ID",
    "title": "手帐本标题",
    "coverImg": "封面图片URL",
    "count": 0,
    "userId": "用户ID",
    "createdAt": "2024-01-01T00:00:00.000Z",
    "updatedAt": "2024-01-01T00:00:00.000Z"
  },
  "timestamp": 1640995200000
}
```

#### 2.4 更新手帐本

- **URL**: `/api/note-books/:id`
- **方法**: `PUT`
- **认证**: 需要
- **描述**: 更新手帐本信息

**路径参数**:
| 参数名 | 类型 | 必填 | 描述 |
|--------|------|------|------|
| id | string | 是 | 手帐本 ID |

**请求体**:

```json
{
  "title": "新手帐本标题（可选）",
  "coverImg": "新封面图片URL（可选）"
}
```

**响应**:

```json
{
  "code": 0,
  "message": "更新手帐本成功",
  "data": {
    "id": "手帐本ID",
    "title": "手帐本标题",
    "coverImg": "封面图片URL",
    "count": 10,
    "userId": "用户ID",
    "createdAt": "2024-01-01T00:00:00.000Z",
    "updatedAt": "2024-01-01T00:00:00.000Z"
  },
  "timestamp": 1640995200000
}
```

#### 2.5 删除手帐本

- **URL**: `/api/note-books/:id`
- **方法**: `DELETE`
- **认证**: 需要
- **描述**: 删除手帐本及其下的所有手帐

**路径参数**:
| 参数名 | 类型 | 必填 | 描述 |
|--------|------|------|------|
| id | string | 是 | 手帐本 ID |

**响应**:

```json
{
  "code": 0,
  "message": "删除手帐本成功",
  "data": {
    "deleted": true
  },
  "timestamp": 1640995200000
}
```

#### 2.6 获取手帐本统计

- **URL**: `/api/note-books/:id/stats`
- **方法**: `GET`
- **认证**: 需要
- **描述**: 获取手帐本的统计信息

**路径参数**:
| 参数名 | 类型 | 必填 | 描述 |
|--------|------|------|------|
| id | string | 是 | 手帐本 ID |

**响应**:

```json
{
  "code": 0,
  "message": "获取手帐本统计成功",
  "data": {
    "noteCount": 10
  },
  "timestamp": 1640995200000
}
```

### 3. 手帐接口

所有手帐接口都需要认证。

#### 3.1 获取手帐列表

- **URL**: `/api/notes`
- **方法**: `GET`
- **认证**: 需要
- **描述**: 获取手帐列表（分页），可筛选手帐本

**查询参数**:
| 参数名 | 类型 | 必填 | 默认值 | 描述 |
|--------|------|------|--------|------|
| page | number | 否 | 1 | 页码 |
| limit | number | 否 | 20 | 每页数量（1-100） |
| sortBy | string | 否 | "updatedAt" | 排序字段：createdAt, updatedAt, title |
| order | string | 否 | "desc" | 排序顺序：asc, desc |
| noteBookId | string | 否 | - | 手帐本 ID（筛选特定手帐本） |

**响应**:

```json
{
  "code": 0,
  "message": "获取手帐列表成功",
  "data": {
    "items": [
      {
        "id": "手帐ID",
        "noteBookId": "手帐本ID",
        "title": "手帐标题",
        "content": "手帐内容",
        "tags": ["标签1", "标签2"],
        "userId": "用户ID",
        "createdAt": "2024-01-01T00:00:00.000Z",
        "updatedAt": "2024-01-01T00:00:00.000Z"
      }
    ],
    "total": 100,
    "page": 1,
    "limit": 20,
    "totalPages": 5
  },
  "timestamp": 1640995200000
}
```

#### 3.2 获取单个手帐

- **URL**: `/api/notes/:id`
- **方法**: `GET`
- **认证**: 需要
- **描述**: 获取指定 ID 的手帐详情

**路径参数**:
| 参数名 | 类型 | 必填 | 描述 |
|--------|------|------|------|
| id | string | 是 | 手帐 ID |

**响应**:

```json
{
  "code": 0,
  "message": "获取手帐成功",
  "data": {
    "id": "手帐ID",
    "noteBookId": "手帐本ID",
    "title": "手帐标题",
    "content": "手帐内容",
    "tags": ["标签1", "标签2"],
    "userId": "用户ID",
    "createdAt": "2024-01-01T00:00:00.000Z",
    "updatedAt": "2024-01-01T00:00:00.000Z"
  },
  "timestamp": 1640995200000
}
```

#### 3.3 创建手帐

- **URL**: `/api/notes`
- **方法**: `POST`
- **认证**: 需要
- **描述**: 创建新的手帐

**请求体**:

```json
{
  "noteBookId": "手帐本ID",
  "title": "手帐标题",
  "content": "手帐内容",
  "tags": ["标签1", "标签2"] // 可选
}
```

**响应**:

```json
{
  "code": 0,
  "message": "创建手帐成功",
  "data": {
    "id": "手帐ID",
    "noteBookId": "手帐本ID",
    "title": "手帐标题",
    "content": "手帐内容",
    "tags": ["标签1", "标签2"],
    "userId": "用户ID",
    "createdAt": "2024-01-01T00:00:00.000Z",
    "updatedAt": "2024-01-01T00:00:00.000Z"
  },
  "timestamp": 1640995200000
}
```

#### 3.4 更新手帐

- **URL**: `/api/notes/:id`
- **方法**: `PUT`
- **认证**: 需要
- **描述**: 更新手帐信息，可更换手帐本

**路径参数**:
| 参数名 | 类型 | 必填 | 描述 |
|--------|------|------|------|
| id | string | 是 | 手帐 ID |

**请求体**:

```json
{
  "title": "新手帐标题（可选）",
  "content": "新手帐内容（可选）",
  "tags": ["新标签1", "新标签2"] // 可选
  "noteBookId": "新手帐本ID（可选）"
}
```

**响应**:

```json
{
  "code": 0,
  "message": "更新手帐成功",
  "data": {
    "id": "手帐ID",
    "noteBookId": "手帐本ID",
    "title": "手帐标题",
    "content": "手帐内容",
    "tags": ["标签1", "标签2"],
    "userId": "用户ID",
    "createdAt": "2024-01-01T00:00:00.000Z",
    "updatedAt": "2024-01-01T00:00:00.000Z"
  },
  "timestamp": 1640995200000
}
```

#### 3.5 删除手帐

- **URL**: `/api/notes/:id`
- **方法**: `DELETE`
- **认证**: 需要
- **描述**: 删除手帐

**路径参数**:
| 参数名 | 类型 | 必填 | 描述 |
|--------|------|------|------|
| id | string | 是 | 手帐 ID |

**响应**:

```json
{
  "code": 0,
  "message": "删除手帐成功",
  "data": {
    "deleted": true
  },
  "timestamp": 1640995200000
}
```

#### 3.6 批量删除手帐

- **URL**: `/api/notes/batch-delete`
- **方法**: `POST`
- **认证**: 需要
- **描述**: 批量删除手帐

**请求体**:

```json
{
  "noteIds": ["手帐ID1", "手帐ID2", "手帐ID3"]
}
```

**响应**:

```json
{
  "code": 0,
  "message": "成功删除 3 条手帐",
  "data": {
    "deletedCount": 3
  },
  "timestamp": 1640995200000
}
```

#### 3.7 搜索手帐

- **URL**: `/api/notes/search`
- **方法**: `GET`
- **认证**: 需要
- **描述**: 搜索手帐（支持关键词、标签、时间范围）

**查询参数**:
| 参数名 | 类型 | 必填 | 描述 |
|--------|------|------|------|
| q | string | 是 | 搜索关键词 |
| noteBookId | string | 否 | 手帐本 ID（筛选特定手帐本） |
| tags | string[] | 否 | 标签数组 |
| startTime | number | 否 | 开始时间戳（毫秒） |
| endTime | number | 否 | 结束时间戳（毫秒） |

**响应**:

```json
{
  "code": 0,
  "message": "搜索手帐成功",
  "data": [
    {
      "id": "手帐ID",
      "noteBookId": "手帐本ID",
      "title": "手帐标题",
      "content": "手帐内容",
      "tags": ["标签1", "标签2"],
      "userId": "用户ID",
      "createdAt": "2024-01-01T00:00:00.000Z",
      "updatedAt": "2024-01-01T00:00:00.000Z"
    }
  ],
  "timestamp": 1640995200000
}
```

#### 3.8 获取最近更新的手帐

- **URL**: `/api/notes/recent`
- **方法**: `GET`
- **认证**: 需要
- **描述**: 获取最近更新的手帐

**查询参数**:
| 参数名 | 类型 | 必填 | 默认值 | 描述 |
|--------|------|------|--------|------|
| limit | number | 否 | 10 | 返回数量（1-100） |

**响应**:

```json
{
  "code": 0,
  "message": "获取最近手帐成功",
  "data": [
    {
      "id": "手帐ID",
      "noteBookId": "手帐本ID",
      "title": "手帐标题",
      "content": "手帐内容",
      "tags": ["标签1", "标签2"],
      "userId": "用户ID",
      "createdAt": "2024-01-01T00:00:00.000Z",
      "updatedAt": "2024-01-01T00:00:00.000Z"
    }
  ],
  "timestamp": 1640995200000
}
```

### 4. 统计接口

所有统计接口都需要认证。

#### 4.1 获取用户统计信息

- **URL**: `/api/stats/user`
- **方法**: `GET`
- **认证**: 需要
- **描述**: 获取用户的整体统计信息

**响应**:

```json
{
  "code": 0,
  "message": "获取用户统计成功",
  "data": {
    "noteBookCount": 5,
    "noteCount": 100,
    "recentActivity": [
      {
        "type": "create",
        "target": "note",
        "targetId": "手帐ID",
        "title": "创建手帐：手帐标题",
        "timestamp": 1640995200000
      }
    ]
  },
  "timestamp": 1640995200000
}
```

#### 4.2 获取标签统计信息

- **URL**: `/api/stats/tags`
- **方法**: `GET`
- **认证**: 需要
- **描述**: 获取用户所有标签的使用统计

**响应**:

```json
{
  "code": 0,
  "message": "获取标签统计成功",
  "data": [
    {
      "tag": "标签1",
      "count": 20
    },
    {
      "tag": "标签2",
      "count": 15
    }
  ],
  "timestamp": 1640995200000
}
```

#### 4.3 获取用户活动时间线

- **URL**: `/api/stats/activity`
- **方法**: `GET`
- **认证**: 需要
- **描述**: 获取用户最近的活动记录

**查询参数**:
| 参数名 | 类型 | 必填 | 默认值 | 描述 |
|--------|------|------|--------|------|
| limit | number | 否 | 20 | 返回数量（1-100） |

**响应**:

```json
{
  "code": 0,
  "message": "获取活动时间线成功",
  "data": [
    {
      "id": "活动ID",
      "type": "create",
      "target": "note",
      "targetId": "手帐ID",
      "title": "创建手帐：手帐标题",
      "userId": "用户ID",
      "createdAt": "2024-01-01T00:00:00.000Z"
    }
  ],
  "timestamp": 1640995200000
}
```

#### 4.4 获取手帐本使用统计

- **URL**: `/api/stats/note-book-usage`
- **方法**: `GET`
- **认证**: 需要
- **描述**: 获取各个手帐本的使用情况统计

**响应**:

```json
{
  "code": 0,
  "message": "获取手帐本使用统计成功",
  "data": [
    {
      "noteBookId": "手帐本ID",
      "title": "手帐本标题",
      "noteCount": 25,
      "lastUpdated": "2024-01-01T00:00:00.000Z"
    }
  ],
  "timestamp": 1640995200000
}
```

## 数据模型

### 手帐本模型 (NoteBook)

```typescript
{
  id: string;           // 手帐本ID
  title: string;        // 手帐本标题（1-100字符）
  coverImg?: string;    // 封面图片URL
  count: number;        // 手帐数量
  userId: string;       // 用户ID
  createdAt: Date;      // 创建时间
  updatedAt: Date;      // 更新时间
}
```

### 手帐模型 (Note)

```typescript
{
  id: string;           // 手帐ID
  noteBookId: string;   // 所属手帐本ID
  title: string;        // 手帐标题（1-200字符）
  content: string;      // 手帐内容
  tags: string[];       // 标签数组
  userId: string;       // 用户ID
  createdAt: Date;      // 创建时间
  updatedAt: Date;      // 更新时间
}
```

### 活动模型 (Activity)

```typescript
{
  id: string; // 活动ID
  type: "create" | "update" | "delete"; // 活动类型
  target: "noteBook" | "note"; // 活动目标
  targetId: string; // 目标ID
  title: string; // 活动标题
  userId: string; // 用户ID
  createdAt: Date; // 活动时间
}
```

## 注意事项

1. **认证要求**: 除登录接口外，所有接口都需要在请求头中携带 `Authorization: Bearer {token}`

2. **参数验证**: 所有接口都使用 Zod 进行严格的参数验证，不符合要求的参数会返回错误码 1001

3. **分页限制**: 所有分页接口的每页数量限制在 1-100 之间

4. **错误处理**: 所有错误都返回统一的错误格式，包含错误码和描述信息

5. **时间格式**: 所有时间字段都使用 ISO 8601 格式（UTC 时间）

6. **权限控制**: 用户只能访问自己创建的手帐本和手帐，尝试访问其他用户的资源会返回 404 错误

## 开发说明

### 环境变量

```bash
# 微信小程序配置
WX_APPID=你的微信小程序AppID
WX_SECRET=你的微信小程序AppSecret

# JWT配置
JWT_SECRET=你的JWT密钥

# MongoDB配置
MONGODB_URI=mongodb://localhost:27017/journal
```

### 启动服务

```bash
cd backend
pnpm install
pnpm dev
```

### 测试接口

可以使用 `backend/test-api.http` 文件中的 HTTP 请求进行接口测试。
