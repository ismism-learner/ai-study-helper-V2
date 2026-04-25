# AI Study Helper V2 - 智能学习助手

## 这个项目有什么用？

AI Study Helper V2 是一个**智能文档管理与学习辅助系统**，帮助你：

- 📚 **管理海量学习资料**：PDF书籍、文本文档统一管理，支持专辑/标签/文件夹多维分类
- 🤖 **AI辅助学习**：自动提取框架、解释术语、优化表达，支持多种AI后端（OpenAI、本地模型等）
- 📝 **高效笔记系统**：时间轴笔记、章节笔记、快速笔记、高亮标注，多种记录方式
- 🧠 **知识图谱**：自动构建知识点网络，可视化知识关联，支持追问与概念细化
- ☁️ **夸克网盘集成**：支持从夸克网盘浏览和下载书籍

---

## 核心功能

### 1. 智能文档管理
- 创建、编辑、上传文档（支持批量上传）
- 文件夹层级管理，支持多级嵌套
- 标签分类系统，多维度组织学习资料
- 文档源自动同步与去重检测

### 2. AI智能分析
- **框架自动生成**：一键提取文档结构、专业术语、核心概念
- **术语解释**：选中关键词，AI自动生成上下文解释
- **段落优化**：口语化表达 → 书面化表达
- **长文本改写**：AI辅助的长文本重构与润色
- **自定义提示词**：所有AI提示词可在设置面板中自定义

### 3. 书籍管理系统
- PDF/EPUB 书籍上传与管理
- 自动提取封面、元数据（作者、年代、国别等）
- 内置PDF阅读器，支持笔记面板拖拽
- 阅读进度追踪与速度统计
- 支持批量导入

### 4. 知识图谱与认知链
- **知识图谱可视化**：基于 G6 引擎的力导向图，直观展示知识点间的关联
- **标签维度浏览**：按标签切换图谱视图，跨书籍关联知识
- **认知链（追问/细化）**：选中概念逐层追问，AI自动扩展认知深度
- **节点编辑**：支持编辑节点名称、描述，删除无用节点
- **思维导图视图**：支持节点画布（NodeCanvas）自由拖拽编排
- 纯 SQLite 存储，无需额外数据库

### 5. 夸克网盘集成
- 配置夸克网盘 Cookie 即可使用
- 浏览器盘文件夹结构
- 一键下载书籍到本地
- Cookie 本地存储，安全不上传

### 6. 时间轴系统
- 为书籍/文档创建历史时间节点
- 可视化时间线展示，支持拖拽排序
- 重要性等级标记（低/中/高）
- AI 辅助自动提取时间事件
- 分国家/地区的世界时间轴面板

### 7. OCR 服务
- PDF 文字提取（PaddleOCR 引擎，支持 GPU 加速）
- 自动 GPU/CPU 检测与回退
- 结果缓存加速重复请求
- 章节自动拆分与笔记生成

### 8. 多主题支持
- 内置深色/浅色主题
- 扩展主题：紫色系、绿色系
- 所有颜色通过 CSS 变量管理，扩展方便

### 9. 数据安全
- 自动备份（每6小时）
- 数据完整性检查
- 备份管理与紧急恢复

---

## 解决了什么痛点？

### 痛点1：学习资料分散难管理
**解决方案**：统一管理 PDF 书籍和文本文档，支持文件夹、标签、时间、国别多维度分类

### 痛点2：文档理解耗时费力
**解决方案**：AI 自动提取框架、术语解释，快速把握文档核心内容

### 痛点3：知识点关联困难
**解决方案**：知识图谱可视化展示知识点关联，认知链逐层深入追问，时间轴串联历史脉络

### 痛点4：笔记整理效率低
**解决方案**：高亮标注、章节笔记、时间轴笔记、快速笔记、AI 润色，多种记录方式

### 痛点5：数据安全无保障
**解决方案**：自动备份、完整性检查、备份管理，数据安全有保障

### 痛点6：网盘资源下载麻烦
**解决方案**：集成夸克网盘，直接浏览下载，无需手动操作

---

## 未来计划

### 近期计划（1-2个月）
- [ ] 用户认证系统，支持多用户
- [ ] 全文搜索引擎，提升搜索性能
- [ ] 优化大文件处理性能

### 中期计划（3-6个月）
- [ ] 移动端适配
- [ ] 协作功能（文档共享、协作编辑）
- [ ] AI 智能问答系统

### 长期计划
- [ ] 支持更多文档格式（Word、PPT、图片）
- [ ] 学习路径智能推荐
- [ ] 学习数据分析与报告

---

## 快速部署

### 环境要求
- Python 3.11+
- Node.js 18+
- Windows 系统（脚本基于 bat，Linux/macOS 需手动适配）

### 方式一：一键启动（推荐）

#### 步骤1：配置 AI 后端
编辑 `backend\.env` 文件：
```env
OPENAI_API_KEY=your_api_key_here
OPENAI_API_BASE=https://api.openai.com/v1
MODEL_NAME=gpt-4
```

支持多种 AI 后端（OpenAI 兼容 API、本地 CLI 模型等），可在设置面板中切换。

#### 步骤2：启动服务
双击运行 `一键启动.bat`，自动完成：
1. 检查 Python 环境
2. 自动安装后端依赖（FastAPI、PaddleOCR 等）
3. 自动安装前端依赖（npm install）
4. 启动后端服务（端口 8000）
5. 启动前端服务（端口 3001）

#### 步骤3：访问系统
- 前端界面：http://localhost:3001
- 后端 API：http://localhost:8000
- API 文档：http://localhost:8000/docs

---

### 方式二：手动部署

#### 后端部署
```bash
# 1. 进入后端目录
cd backend

# 2. 创建虚拟环境
python -m venv .venv
.\.venv\Scripts\activate  # Windows
# source .venv/bin/activate  # Linux/macOS

# 3. 安装依赖
pip install -r requirements.txt

# 4. 配置环境变量（创建 .env 文件）
# OPENAI_API_KEY=your_api_key
# OPENAI_API_BASE=https://api.openai.com/v1

# 5. 启动服务
python -m uvicorn app.main:app --host 0.0.0.0 --port 8000
```

#### 前端部署
```bash
# 1. 进入前端目录
cd frontend

# 2. 安装依赖
npm install

# 3. 启动开发服务器
npm run dev
```

#### 生产构建
```bash
cd frontend
npm run build     # 输出到 dist/ 目录
```

---

### 配置夸克网盘（可选）

1. 登录夸克网盘网页版
2. 按 F12 打开开发者工具
3. 切换到 Network 标签
4. 刷新页面，复制任意请求的 Cookie 值
5. 在系统设置页面粘贴并保存

> Cookie 仅保存在本地 `backend/quark_config/` 目录，不会上传到任何地方

---

## 项目结构

```
ai study helper V2/
├── backend/                          # 后端服务（FastAPI）
│   ├── app/
│   │   ├── main.py                  # 应用入口，路由注册
│   │   ├── config.py                # 配置管理（SettingsManager）
│   │   ├── database.py              # SQLAlchemy 引擎与会话
│   │   ├── models.py                # 13 个 SQLAlchemy 数据模型
│   │   ├── schemas.py               # Pydantic 请求/响应模型
│   │   ├── routers/                 # 16 个 API 路由模块
│   │   │   ├── library.py           # 书籍 CRUD、上传、阅读进度
│   │   │   ├── documents.py         # 文档 CRUD、AI 处理、高亮
│   │   │   ├── knowledge_graph.py   # 知识图谱 API
│   │   │   ├── cognitive_chain.py   # 认知链 API
│   │   │   ├── settings.py          # 设置管理
│   │   │   ├── dashboard.py         # 仪表盘统计
│   │   │   ├── world_timeline.py    # 世界时间轴
│   │   │   ├── chapter_notes.py     # 章节笔记
│   │   │   ├── quick_notes.py       # 快速笔记
│   │   │   ├── pdf_ocr.py           # PDF OCR 流水线
│   │   │   ├── quark.py             # 夸克网盘
│   │   │   ├── folders.py           # 文件夹管理
│   │   │   ├── tasks.py             # 任务管理
│   │   │   ├── activity.py          # 活动日志
│   │   │   ├── backup.py            # 备份恢复
│   │   │   └── duplicates.py        # 去重检测
│   │   └── services/                # 13 个业务服务模块
│   │       ├── ai_service.py        # AI 调用封装（多后端支持）
│   │       ├── paddleocr_service.py # PaddleOCR 引擎封装
│   │       ├── knowledge_graph_service.py
│   │       ├── cognitive_chain_service.py
│   │       ├── chapter_note_service.py
│   │       └── ...
│   ├── uploads/                     # 上传文件（gitignored）
│   ├── backups/                     # 自动备份（gitignored）
│   └── tests/                       # 测试脚本
├── frontend/                        # 前端服务（React + Vite + TypeScript）
│   ├── src/
│   │   ├── components/              # 58 个 React 组件
│   │   │   ├── KnowledgeGraphPanel.tsx    # 知识图谱主面板（G6）
│   │   │   ├── CognitiveChainPanel.tsx    # 认知链面板
│   │   │   ├── TagKnowledgeGraphPanel.tsx # 标签维度图谱
│   │   │   ├── BookReaderView.tsx         # 书籍阅读器
│   │   │   ├── Sidebar.tsx               # 导航侧边栏
│   │   │   ├── SettingsModal.tsx          # 设置面板
│   │   │   ├── NodeCanvas.tsx             # 节点画布
│   │   │   ├── ThemeSwitcher.tsx          # 主题切换
│   │   │   └── ...
│   │   ├── api/                     # 17 个 API 客户端模块
│   │   │   ├── client.ts            # Axios 实例（4 个）
│   │   │   ├── knowledgeGraph.ts    # 知识图谱 & 认知链 API
│   │   │   ├── library.ts           # 书籍 API
│   │   │   ├── documents.ts         # 文档 API
│   │   │   └── ...
│   │   ├── hooks/                   # 5 个自定义 Hook
│   │   ├── styles/                  # 15 个 CSS 文件（CSS 变量主题）
│   │   └── types.ts                 # 共享 TypeScript 类型
│   └── package.json
├── 一键启动.bat                     # Windows 一键启动脚本
├── 停止服务.bat                     # 停止所有服务
├── tessdata/                        # Tesseract 数据（已废弃，使用 PaddleOCR）
└── README.md
```

---

## 常见问题

### Q: AI 功能无法使用？
**A:** 检查 `backend\.env` 文件中的 `OPENAI_API_KEY` 和 `OPENAI_API_BASE` 是否正确配置。也可以切换到本地 CLI 模式（设置面板中配置）。

### Q: PDF 上传失败？
**A:** 检查 `backend\uploads\books` 目录是否有写入权限。

### Q: 端口被占用？
**A:** 修改 `一键启动.bat` 中的端口号，或关闭占用端口的进程。

### Q: 知识图谱无法加载？
**A:** 检查健康检查接口 `/api/knowledge-graph/health` 是否返回 `"storage": "sqlite"`。知识图谱使用 SQLite 存储，无需额外依赖。

### Q: 夸克网盘连接失败？
**A:** Cookie 可能已过期，重新获取并保存即可。

### Q: 前端编译失败（TypeScript 错误）？
**A:** 项目使用 TypeScript 严格模式，确保代码没有未使用的变量和参数。运行 `npm run build` 查看详细错误。

---

## 技术栈

| 层级 | 技术 |
|------|------|
| 后端框架 | FastAPI + Uvicorn |
| 数据库 | SQLite + SQLAlchemy 2.0 |
| AI 引擎 | OpenAI API / 本地 CLI 模型 |
| OCR 引擎 | PaddleOCR（GPU/CPU） |
| 前端框架 | React 18 + TypeScript |
| 构建工具 | Vite |
| 图谱引擎 | @antv/g6 |
| 样式方案 | CSS 变量（多主题支持） |

---

## 许可证

本项目仅供学习和研究使用。

## 贡献

欢迎提交 Issue 和 Pull Request！
