# AI Study Helper V2 - Agent 配置

本项目包含两个专门的开发 Agent，分别负责前端和后端开发工作。

---

## 📦 Agent 列表

### 1. Frontend Agent
**文件**: `.trae/agents/frontend-agent.md`

**职责**:
- React + TypeScript + Vite 开发
- UI 组件设计与实现
- API 调用与状态管理
- 性能优化与调试

**适用场景**:
- 新增前端功能
- 修复前端 Bug
- 优化前端性能
- 重构前端代码

### 2. Backend Agent
**文件**: `.trae/agents/backend-agent.md`

**职责**:
- FastAPI + SQLAlchemy 开发
- API 设计与实现
- 数据库操作与优化
- AI 服务集成

**适用场景**:
- 新增后端 API
- 修复后端 Bug
- 优化数据库查询
- 集成第三方服务

---

## 🚀 使用方法

### 方式一：直接引用 Agent 文件
在对话开始时，告诉 AI：
```
请参考 .trae/agents/frontend-agent.md 中的规范，帮我实现 [功能描述]
```

### 方式二：指定 Agent 类型
```
我需要前端开发帮助，请按照 Frontend Agent 的规范工作
```

### 方式三：同时使用两个 Agent
```
我需要实现一个全栈功能，请分别参考：
- 前端：.trae/agents/frontend-agent.md
- 后端：.trae/agents/backend-agent.md
```

---

## 📋 Agent 核心规范

### Frontend Agent 核心规范
- 文件大小限制：组件 < 500 行，API < 300 行
- 使用 TypeScript 严格模式
- 遵循 React 最佳实践（Hooks、性能优化）
- 拖拽功能使用元素级事件绑定
- 批量操作先收集再更新

### Backend Agent 核心规范
- 文件大小限制：路由 < 400 行，服务 < 500 行
- 使用异步编程（async/await）
- 数据库会话使用依赖注入
- API 返回统一格式
- OCR 并行处理使用线程池 + 锁

---

## 🔧 自定义 Agent

如果需要修改 Agent 配置，直接编辑对应的 `.md` 文件即可。

### 添加新规范
在 Agent 文件中添加新的章节：
```markdown
## 新规范标题

### 规则 1
- 具体说明

### 规则 2
- 具体说明
```

### 更新现有规范
直接修改对应章节的内容。

---

## 📊 Agent 效果监控

建议定期检查 Agent 的效果：

| 检查项 | 频率 | 标准 |
|--------|------|------|
| 文件大小 | 每周 | 最大文件 < 500 行 |
| 代码重复 | 每周 | 重复代码 < 5% |
| Bug 数量 | 每月 | 新增 Bug < 2 个/功能 |
| 开发效率 | 每月 | 功能完成时间符合预期 |

---

## 💡 最佳实践

1. **明确需求**: 使用 Agent 前，先明确功能需求和范围
2. **分步实现**: 复杂功能分步实现，每步验证
3. **及时反馈**: 发现 Agent 输出不符合预期时，及时纠正
4. **持续优化**: 根据项目发展，更新 Agent 配置

---

## 📝 更新日志

### 2026-04-09
- 创建 Frontend Agent 配置
- 创建 Backend Agent 配置
- 创建 Agent 索引文档
