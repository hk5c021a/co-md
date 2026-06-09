# API 接口契约：在线实时 Markdown 协同编辑系统

**日期**：2026-04-18
**对应功能**：`001-md-realtime-collab`
**规范版本**：OpenAPI 3.1.0

---

## 认证说明

除 `/api/auth/*` 端点外，所有 API 需要在请求头中携带访问令牌：

```
Authorization: Bearer <access_token>
```

错误响应统一格式（FR-007b）：

```json
{
  "code": "ERROR_CODE",
  "message": "Human readable message",
  "details": {}
}
```

---

## 用户认证 API

### POST /api/auth/register

**描述**：用户注册

**请求体**：
```json
{
  "username": "string (3-30 chars, alphanumeric + underscore)",
  "email": "string (valid email)",
  "phone": "string (E.164 format)",
  "password": "string (min 12 chars)",
  "confirmPassword": "string"
}
```

**成功响应**：`201 Created`
```json
{
  "user": {
    "id": "uuid",
    "username": "string",
    "email": "string",
    "phone": "string"
  },
  "accessToken": "jwt_string",
  "refreshToken": "string"
}
```

**错误码**：
- `USERNAME_TAKEN` (409)
- `EMAIL_TAKEN` (409)
- `PHONE_TAKEN` (409)
- `PASSWORD_MISMATCH` (400)
- `PASSWORD_TOO_WEAK` (400)

---

### POST /api/auth/login

**描述**：用户登录

**请求体**：
```json
{
  "identifier": "string (username 或 email 或 phone)",
  "password": "string"
}
```

**成功响应**：`200 OK`
```json
{
  "user": {
    "id": "uuid",
    "username": "string",
    "email": "string",
    "phone": "string"
  },
  "accessToken": "jwt_string",
  "refreshToken": "string"
}
```

**错误码**：
- `INVALID_CREDENTIALS` (401)
- `ACCOUNT_LOCKED` (423)

---

### POST /api/auth/refresh

**描述**：刷新访问令牌

**请求头**：
```
Cookie: refresh_token=<refresh_token>
```

**成功响应**：`200 OK`
```json
{
  "accessToken": "jwt_string"
}
```

**错误码**：
- `REFRESH_TOKEN_INVALID` (401)
- `REFRESH_TOKEN_EXPIRED` (401)

---

### POST /api/auth/logout

**描述**：登出（撤销当前刷新令牌）

**成功响应**：`204 No Content`

---

### POST /api/auth/password-reset/request

**描述**：请求密码重置

**请求体**：
```json
{
  "identifier": "string (email 或 phone)"
}
```

**成功响应**：`200 OK`
```json
{
  "message": "重置链接/验证码已发送"
}
```

**错误码**：
- `USER_NOT_FOUND` (404)

---

### POST /api/auth/password-reset/confirm

**描述**：确认密码重置

**请求体**：
```json
{
  "token": "string (重置令牌)",
  "newPassword": "string",
  "confirmPassword": "string"
}
```

**成功响应**：`200 OK`
```json
{
  "message": "密码重置成功"
}
```

---

## 用户资料 API

### GET /api/users/me

**描述**：获取当前用户资料

**成功响应**：`200 OK`
```json
{
  "id": "uuid",
  "username": "string",
  "email": "string",
  "phone": "string",
  "createdAt": "ISO8601"
}
```

---

### PATCH /api/users/me

**描述**：更新用户资料

**请求体**（全部或部分字段）：
```json
{
  "username": "string (可选)",
  "email": "string (可选)",
  "phone": "string (可选)"
}
```

**成功响应**：`200 OK`
```json
{
  "id": "uuid",
  "username": "string",
  "email": "string",
  "phone": "string"
}
```

**错误码**：
- `USERNAME_TAKEN` (409)
- `EMAIL_TAKEN` (409)
- `PHONE_TAKEN` (409)

---

### PATCH /api/users/me/password

**描述**：修改密码

**请求体**：
```json
{
  "currentPassword": "string",
  "newPassword": "string (min 12 chars)",
  "confirmPassword": "string"
}
```

**成功响应**：`200 OK`
```json
{
  "message": "密码修改成功"
}
```

---

## 文档管理 API

### GET /api/documents

**描述**：获取当前用户的文档列表（根目录）

**查询参数**：
- `folderId`（可选）：指定文件夹，缺省为根目录

**成功响应**：`200 OK`
```json
{
  "documents": [
    {
      "id": "uuid",
      "title": "string",
      "ownerId": "uuid",
      "parentFolderId": "uuid | null",
      "updatedAt": "ISO8601"
    }
  ],
  "folders": [
    {
      "id": "uuid",
      "name": "string",
      "ownerId": "uuid",
      "parentFolderId": "uuid | null",
      "updatedAt": "ISO8601"
    }
  ]
}
```

---

### POST /api/documents

**描述**：创建文档

**请求体**：
```json
{
  "title": "string",
  "parentFolderId": "uuid | null (可选)"
}
```

**成功响应**：`201 Created`
```json
{
  "id": "uuid",
  "title": "string",
  "content": {},
  "ownerId": "uuid",
  "parentFolderId": "uuid | null",
  "createdAt": "ISO8601",
  "updatedAt": "ISO8601"
}
```

---

### GET /api/documents/:id

**描述**：获取文档详情（含内容）

**成功响应**：`200 OK`
```json
{
  "id": "uuid",
  "title": "string",
  "content": {},
  "ownerId": "uuid",
  "parentFolderId": "uuid | null",
  "createdAt": "ISO8601",
  "updatedAt": "ISO8601"
}
```

**错误码**：
- `DOCUMENT_NOT_FOUND` (404)
- `ACCESS_DENIED` (403)

---

### PATCH /api/documents/:id

**描述**：更新文档元数据（标题等）

**请求体**：
```json
{
  "title": "string",
  "parentFolderId": "uuid | null"
}
```

**成功响应**：`200 OK`

---

### DELETE /api/documents/:id

**描述**：删除文档

**成功响应**：`204 No Content`

**错误码**：
- `ACCESS_DENIED` (403)（仅所有者可删除）

---

### POST /api/documents/:id/move

**描述**：移动文档到其他文件夹

**请求体**：
```json
{
  "targetFolderId": "uuid | null"
}
```

**成功响应**：`200 OK`

---

### POST /api/documents/:id/copy

**描述**：复制文档

**请求体**：
```json
{
  "targetFolderId": "uuid | null"
}
```

**成功响应**：`201 Created`

---

### POST /api/documents/:id/sync

**描述**：获取或提交 Y.Doc 协作编辑更新（CRDT 同步）

**查询参数**：
- `action`: `get`（获取最新状态）或 `submit`（提交变更）

**请求体**（当 action=submit）：
```json
{
  "update": "string (Yjs 更新二进制数据的 base64 编码)"
}
```

**成功响应**：`200 OK`
```json
{
  "update": "string (自上次同步以来的增量更新，base64 编码）",
  "version": "string (当前文档版本向量时钟）"
}
```

---

## 文件上传/下载 API

### POST /api/upload/presigned

**描述**：获取 RustFS Presigned URL 用于前端直接上传文件

**请求体**：
```json
{
  "filename": "string",
  "contentType": "string (如 image/png, text/markdown)",
  "size": "number (文件大小，字节)"
}
```

**成功响应**：`200 OK`
```json
{
  "uploadUrl": "string (RustFS Presigned PUT URL，有效期 15 分钟）",
  "fileKey": "string (上传后的文件 key，用于后续访问）"
}
```

**错误码**：
- `FILE_TOO_LARGE` (400, 文件超过 50MB)
- `INVALID_CONTENT_TYPE` (400)

---

### GET /api/documents/:id/download

**描述**：生成文档下载的 Presigned URL（或直接返回文件内容）

**成功响应**：`200 OK`
```json
{
  "downloadUrl": "string (RustFS Presigned GET URL，有效期 15 分钟）",
  "filename": "string (下载文件名）",
  "contentType": "string"
}
```

---

## 文件夹管理 API

### POST /api/folders

**描述**：创建文件夹

**请求体**：
```json
{
  "name": "string",
  "parentFolderId": "uuid | null (可选)"
}
```

**成功响应**：`201 Created`

---

### PATCH /api/folders/:id

**描述**：重命名文件夹

**请求体**：
```json
{
  "name": "string"
}
```

---

### DELETE /api/folders/:id

**描述**：删除文件夹（递归删除所有子项）

**成功响应**：`204 No Content`

---

## 联系人管理 API

### GET /api/contacts

**描述**：获取联系人列表

**成功响应**：`200 OK`
```json
{
  "contacts": [
    {
      "id": "uuid",
      "userId": "uuid",
      "contactUserId": "uuid",
      "contact": {
        "id": "uuid",
        "username": "string",
        "email": "string"
      },
      "createdAt": "ISO8601"
    }
  ]
}
```

---

### DELETE /api/contacts/:id

**描述**：移除联系人（双向移除）

**成功响应**：`204 No Content`

---

### GET /api/contacts/invitations

**描述**：获取收到的邀请列表

**成功响应**：`200 OK`
```json
{
  "invitations": [
    {
      "id": "uuid",
      "inviter": {
        "id": "uuid",
        "username": "string"
      },
      "status": "pending | accepted | declined | expired",
      "expiresAt": "ISO8601",
      "createdAt": "ISO8601"
    }
  ]
}
```

---

### POST /api/contacts/invitations

**描述**：发送联系人邀请

**请求体**：
```json
{
  "inviteeIdentifier": "string (username 或 email 或 phone)"
}
```

**成功响应**：`201 Created`

**错误码**：
- `USER_NOT_FOUND` (404)
- `INVITATION_ALREADY_EXISTS` (409)
- `ALREADY_CONTACTS` (409)

---

### POST /api/contacts/invitations/:id/accept

**描述**：接受邀请

**成功响应**：`200 OK`

---

### POST /api/contacts/invitations/:id/decline

**描述**：拒绝邀请

**成功响应**：`200 OK`

---

## 权限管理 API

### GET /api/documents/:id/permissions

**描述**：获取文档的权限列表

**成功响应**：`200 OK`
```json
{
  "owner": {
    "id": "uuid",
    "username": "string"
  },
  "permissions": [
    {
      "id": "uuid",
      "userId": "uuid",
      "user": {
        "id": "uuid",
        "username": "string"
      },
      "level": "read-only | read-write",
      "grantedBy": "uuid",
      "createdAt": "ISO8601",
      "updatedAt": "ISO8601"
    }
  ]
}
```

---

### POST /api/documents/:id/permissions

**描述**：批量授予或调整权限

**请求体**：
```json
{
  "permissions": [
    {
      "userId": "uuid",
      "level": "read-only | read-write"
    }
  ]
}
```

**成功响应**：`200 OK`

---

### DELETE /api/documents/:id/permissions/:permissionId

**描述**：撤销特定权限

**成功响应**：`204 No Content`

---

## 通知 API

### GET /api/notifications

**描述**：获取通知列表

**查询参数**：
- `unreadOnly`（可选，boolean）：仅返回未读通知

**成功响应**：`200 OK`
```json
{
  "notifications": [
    {
      "id": "uuid",
      "type": "string",
      "content": "string (本地化 key)",
      "metadata": {},
      "read": false,
      "createdAt": "ISO8601"
    }
  ]
}
```

---

### PATCH /api/notifications/:id/read

**描述**：标记通知为已读

**成功响应**：`200 OK`

---

### PATCH /api/notifications/read-all

**描述**：全部标记为已读

**成功响应**：`200 OK`

---

## 搜索 API

### GET /api/users/search

**描述**：搜索用户（用于添加联系人）

**查询参数**：
- `q`: 搜索关键词（匹配 username、email、phone）

**成功响应**：`200 OK`
```json
{
  "users": [
    {
      "id": "uuid",
      "username": "string"
    }
  ]
}
```

**限制**：
- 速率限制：10 次/分钟/user（FR-007b）
- 最多返回 20 条结果

---

## WebSocket 协作协议

### 连接

```
wss://<host>/collab/:documentId?access_token=<access_token>
```

### 消息类型

**客户端 → 服务器**：
```json
{ "type": "sync", "data": { "update": "<binary>" } }
{ "type": "awareness", "data": { "state": { "user": { "name": "string", "color": "string" } } } }
```

**服务器 → 客户端**：
```json
{ "type": "sync", "data": { "update": "<binary>" } }
{ "type": "awareness", "data": { "state": { "user": { "name": "string", "color": "string" } } } }
{ "type": "permission-change", "data": { "level": "read-only | read-write | revoked" } }
```

### 权限变更推送（服务器主动）

当用户在编辑时权限被变更，服务器主动推送：
```json
{ "type": "permission-change", "data": { "level": "read-only | read-write | revoked" } }
```

---

## 错误码汇总

| code | HTTP 状态码 | 说明 |
|------|-------------|------|
| INVALID_CREDENTIALS | 401 | 凭证无效 |
| ACCESS_TOKEN_EXPIRED | 401 | 访问令牌过期 |
| REFRESH_TOKEN_INVALID | 401 | 刷新令牌无效 |
| REFRESH_TOKEN_EXPIRED | 401 | 刷新令牌过期 |
| ACCESS_DENIED | 403 | 无访问权限 |
| DOCUMENT_NOT_FOUND | 404 | 文档不存在 |
| USER_NOT_FOUND | 404 | 用户不存在 |
| USERNAME_TAKEN | 409 | 用户名已被占用 |
| EMAIL_TAKEN | 409 | 邮箱已被占用 |
| PHONE_TAKEN | 409 | 电话已被占用 |
| INVITATION_ALREADY_EXISTS | 409 | 邀请已存在 |
| ALREADY_CONTACTS | 409 | 已是联系人 |
| PASSWORD_MISMATCH | 400 | 两次密码输入不一致 |
| PASSWORD_TOO_WEAK | 400 | 密码不符合复杂度要求 |
| RATE_LIMITED | 429 | 请求过于频繁 |
| INTERNAL_ERROR | 500 | 服务器内部错误 |
