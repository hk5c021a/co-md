# 数据模型：在线实时 Markdown 协同编辑系统

**日期**：2026-04-18
**对应功能**：`001-md-realtime-collab`

---

## 实体关系图

```
User ─────< Contact ─────< User
  │                           │
  └────< Document             │
        │                     │
        ├────< Permission     │
        │                     │
        └────< Notification   │
                                  │
Session ────< User (反向引用)        │

Folder ─────< Folder (自引用)
  │
  └────< Document
```

---

## 实体定义

### 1. User（用户）

| 字段 | 类型 | 约束 | 说明 |
|------|------|------|------|
| id | text (UUID) | PK | 用户唯一标识 |
| username | text | UNIQUE, NOT NULL | 用户名（登录凭证） |
| email | text | UNIQUE, NOT NULL | 电子邮箱（唯一且用于密码重置） |
| phone | text | UNIQUE, NOT NULL | 电话号码（唯一且用于密码重置） |
| passwordHash | text | NOT NULL | 密码 bcrypt 哈希值 |
| createdAt | timestamp | NOT NULL, DEFAULT NOW() | 账户创建时间 |
| updatedAt | timestamp | NOT NULL | 最后更新时间 |

**验证规则**：
- username: 3-30 字符，允许字母、数字、下划线
- email: 有效邮箱格式
- phone: 有效国际电话号码格式（E.164）
- passwordHash: bcrypt 哈希，强度要求符合 FR-002（12+ 字符，特殊/大小写/数字）

---

### 2. Session（会话）

| 字段 | 类型 | 约束 | 说明 |
|------|------|------|------|
| id | text (UUID) | PK | 会话唯一标识 |
| userId | text (UUID) | FK → User.id, NOT NULL | 所属用户 |
| accessToken | text | NOT NULL | JWT 访问令牌 |
| refreshTokenHash | text | NOT NULL | 刷新令牌哈希（存储 SHA-256 哈希值） |
| deviceInfo | text | | 设备描述信息（User-Agent 等） |
| createdAt | timestamp | NOT NULL, DEFAULT NOW() | 会话创建时间 |
| expiresAt | timestamp | NOT NULL | 会话过期时间 |

**验证规则**：
- accessToken TTL: 15 分钟（FR-004）
- refreshToken TTL: 7 天（FR-004）
- 单会话模式：同一 userId 仅允许一个活跃会话（FR-005），新建会话时删除旧会话

---

### 3. PasswordResetToken（密码重置令牌）

| 字段 | 类型 | 约束 | 说明 |
|------|------|------|------|
| id | text (UUID) | PK | 令牌唯一标识 |
| userId | text (UUID) | FK → User.id, NOT NULL | 所属用户 |
| tokenHash | text | NOT NULL | 重置令牌哈希（SHA-256，用于验证） |
| expiresAt | timestamp | NOT NULL | 过期时间（createdAt + 15 分钟） |
| createdAt | timestamp | NOT NULL, DEFAULT NOW() | 创建时间 |

**验证规则**：
- 令牌有效期：15 分钟（FR-006）
- 每次生成新令牌时，删除该用户所有旧的重置令牌（防止多次有效令牌共存）
- 验证时：查找 tokenHash 匹配且 expiresAt > NOW() 的记录

---

### 4. Document（文档）

| 字段 | 类型 | 约束 | 说明 |
|------|------|------|------|
| id | text (UUID) | PK | 文档唯一标识 |
| title | text | NOT NULL | 文档标题 |
| content | jsonb | | CRDT Y.Doc 序列化状态（Yjs 文档树） |
| ownerId | text (UUID) | FK → User.id, NOT NULL | 所有者用户 |
| parentFolderId | text (UUID) | FK → Folder.id, NULL | 所属父文件夹（NULL 表示根目录） |
| version | text | NOT NULL, DEFAULT '0' | 向量时钟版本字符串 |
| createdAt | timestamp | NOT NULL, DEFAULT NOW() | 创建时间 |
| updatedAt | timestamp | NOT NULL | 最后更新时间 |

**验证规则**：
- title: 非空字符串，最大 255 字符
- content: 有效的 Y.Doc JSON 表示
- version: 字符串格式的向量时钟

---

### 5. Folder（文件夹）

| 字段 | 类型 | 约束 | 说明 |
|------|------|------|------|
| id | text (UUID) | PK | 文件夹唯一标识 |
| name | text | NOT NULL | 文件夹名称 |
| ownerId | text (UUID) | FK → User.id, NOT NULL | 所有者用户 |
| parentFolderId | text (UUID) | FK → Folder.id, NULL | 父文件夹（NULL 表示根目录） |
| createdAt | timestamp | NOT NULL, DEFAULT NOW() | 创建时间 |
| updatedAt | timestamp | NOT NULL | 最后更新时间 |

**验证规则**：
- name: 非空字符串，最大 255 字符，不允许字符 `/` 和 `\`
- 不允许循环引用（parentFolderId 不能指向自身或后代文件夹）

---

### 6. Contact（联系人，双向关系）

| 字段 | 类型 | 约束 | 说明 |
|------|------|------|------|
| id | text (UUID) | PK | 联系人关系唯一标识 |
| userId | text (UUID) | FK → User.id, NOT NULL | 用户 |
| contactUserId | text (UUID) | FK → User.id, NOT NULL | 联系人用户 |
| createdAt | timestamp | NOT NULL, DEFAULT NOW() | 建立联系的时间 |

**验证规则**：
- userId ≠ contactUserId（不能添加自己为联系人）
- (userId, contactUserId) 组合唯一（双向关系不重复）
- 联系人是双向的：添加 A → B 时，自动创建 (A,B) 和 (B,A) 两条记录

---

### 7. ContactInvitation（联系人邀请）

| 字段 | 类型 | 约束 | 说明 |
|------|------|------|------|
| id | text (UUID) | PK | 邀请唯一标识 |
| inviterId | text (UUID) | FK → User.id, NOT NULL | 邀请人 |
| inviteeId | text (UUID) | FK → User.id, NOT NULL | 被邀请人 |
| status | text | NOT NULL, DEFAULT 'pending' | pending / accepted / declined / expired |
| expiresAt | timestamp | NOT NULL | 过期时间（createdAt + 24h） |
| createdAt | timestamp | NOT NULL, DEFAULT NOW() | 邀请创建时间 |

**验证规则**：
- status 仅允许：pending、accepted、decline、expired
- 过期规则：expiresAt < NOW() 时自动视为 expired（FR-021）
- 同一 (inviterId, inviteeId) 仅允许一条 pending 状态的邀请

---

### 8. Permission（文档权限）

| 字段 | 类型 | 约束 | 说明 |
|------|------|------|------|
| id | text (UUID) | PK | 权限唯一标识 |
| documentId | text (UUID) | FK → Document.id, NOT NULL | 文档 |
| userId | text (UUID) | FK → User.id, NOT NULL | 被授权用户 |
| level | text | NOT NULL | read-only / read-write / revoked |
| grantedBy | text (UUID) | FK → User.id, NOT NULL | 授权人（通常是所有者） |
| createdAt | timestamp | NOT NULL, DEFAULT NOW() | 授权时间 |
| updatedAt | timestamp | NOT NULL | 最后更新时间 |

**验证规则**：
- level 仅允许：read-only、read-write、revoked（revoked 表示权限已被撤销，用于权限变更消息推送）
- (documentId, userId) 组合唯一
- 只有文档所有者可以授予或撤销权限
- 删除权限时，如果用户在编辑中，需按 FR-027 处理

---

### 9. Notification（通知）

| 字段 | 类型 | 约束 | 说明 |
|------|------|------|------|
| id | text (UUID) | PK | 通知唯一标识 |
| userId | text (UUID) | FK → User.id, NOT NULL | 接收通知的用户 |
| type | text | NOT NULL | permission-granted / permission-revoked / permission-changed / contact-invitation / contact-added |
| content | text | NOT NULL | 通知内容（中英文本地化 key） |
| metadata | jsonb | | 附加数据（如 documentId、invitationId） |
| read | boolean | NOT NULL, DEFAULT FALSE | 是否已读 |
| createdAt | timestamp | NOT NULL, DEFAULT NOW() | 创建时间 |

**验证规则**：
- 通知永久保留直至用户手动清除（澄清记录）
- type 定义了通知的类型，用于前端渲染和过滤器

---

## 索引设计

| 表 | 索引类型 | 字段 | 用途 |
|----|---------|------|------|
| users | UNIQUE | username | 登录查询 |
| users | UNIQUE | email | 邮箱查询、密码重置 |
| users | UNIQUE | phone | 电话查询、密码重置 |
| sessions | INDEX | userId | 用户会话查询 |
| sessions | UNIQUE | accessToken | JWT 验证 |
| password_reset_tokens | INDEX | userId | 用户令牌查询 |
| password_reset_tokens | INDEX | expiresAt | 过期扫描 |
| documents | INDEX | ownerId | 所有者文档查询 |
| documents | INDEX | parentFolderId | 文件夹内容查询 |
| documents | GIN | content (jsonb) | CRDT 内容全文搜索 |
| folders | INDEX | ownerId | 所有者文件夹查询 |
| folders | INDEX | parentFolderId | 子文件夹查询 |
| contacts | UNIQUE | (userId, contactUserId) | 联系人唯一性 |
| contacts | INDEX | userId | 用户联系人列表 |
| contact_invitations | INDEX | inviteeId, status | 待处理邀请查询 |
| contact_invitations | INDEX | expiresAt | 过期扫描 |
| permissions | UNIQUE | (documentId, userId) | 权限唯一性 |
| permissions | INDEX | userId | 用户权限列表 |
| notifications | INDEX | userId, read | 用户通知列表 |

---

## 数据库迁移策略

1. **初始迁移**：按依赖顺序创建表（User → Session → PasswordResetToken → Folder → Document → Contact → ContactInvitation → Permission → Notification）
2. **每次变更**：通过 Drizzle migration 系统生成迁移文件
3. **开发环境**：使用 Drizzle Kit push 模式直接同步 schema
4. **生产环境**：使用 migration 文件顺序执行
