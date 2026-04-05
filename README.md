# AI Study Helper V2 - 智能学习助手

## 这个项目有什么用？

AI Study Helper V2 是一个**智能文档管理与学习辅助系统**，帮助你：

- 📚 **管理海量学习资料**：PDF书籍、文本文档统一管理
- 🤖 **AI辅助学习**：自动提取框架、解释术语、优化表达
- 📝 **高效笔记系统**：时间轴笔记、高亮标注、快速笔记
- ☁️ **夸克网盘集成**：支持从夸克网盘下载书籍

---

## 核心功能

### 1. 智能文档管理
- 创建、编辑、上传文档（支持批量）
- 文件夹层级管理
- 标签分类系统
- 文档源自动同步

### 2. AI智能分析
- **框架自动生成**：一键提取文档结构、专业术语、核心概念
- **术语解释**：选中关键词，AI自动生成上下文解释
- **段落优化**：口语化表达 → 书面化表达
- **自定义提示词**：支持个性化AI模板

### 3. 书籍管理系统
- PDF书籍上传与管理
- 自动提取封面、元数据
- 内置PDF阅读器（支持拖拽笔记面板）
- 支持批量导入本地PDF

### 4. 夸克网盘集成
- 配置夸克网盘Cookie即可使用
- 浏览网盘文件夹
- 一键下载书籍到本地
- Cookie本地存储，安全不上传

### 5. 时间轴系统
- 为书籍创建历史时间节点
- 可视化时间线展示
- 重要性等级标记
- 支持拖拽排序

### 6. OCR服务
- PDF文字提取
- 多引擎支持（PaddleOCR、PyMuPDF）
- 结果缓存加速

### 7. 数据安全
- 自动备份（每6小时）
- 数据完整性检查
- 紧急恢复机制

---

## 解决了什么痛点？

### 痛点1：学习资料分散难管理
**解决方案**：统一管理PDF书籍、文本文档，支持文件夹、标签、时间多维度分类

### 痛点2：文档理解耗时费力
**解决方案**：AI自动提取框架、术语解释，快速把握文档核心内容

### 痛点3：知识点关联困难
**解决方案**：时间轴系统串联历史事件，构建知识脉络

### 痛点4：笔记整理效率低
**解决方案**：高亮标注、时间轴笔记、快速笔记，多种方式记录学习心得

### 痛点5：数据安全无保障
**解决方案**：自动备份、完整性检查、紧急恢复，数据安全有保障

### 痛点6：网盘资源下载麻烦
**解决方案**：集成夸克网盘，直接浏览下载，无需手动操作

---

## 未来计划

### 近期计划（1-2个月）
- [ ] 添加用户认证系统，支持多用户
- [ ] 引入全文搜索引擎，提升搜索性能
- [ ] 优化大文件处理性能

### 中期计划（3-6个月）
- [ ] 移动端适配
- [ ] 协作功能（文档共享、协作编辑）
- [ ] 知识图谱可视化

### 长期计划
- [ ] 支持更多文档格式（Word、PPT、图片）
- [ ] AI问答系统
- [ ] 学习路径推荐

---

## 快速部署

### 环境要求
- Python 3.11+
- Node.js 18+

### 方式一：一键启动（推荐）

#### 步骤1：首次安装
双击运行 `首次安装.bat`，自动安装所有依赖

#### 步骤2：配置API
编辑 `backend\.env` 文件：
```env
OPENAI_API_KEY=your_api_key_here
OPENAI_API_BASE=https://api.openai.com/v1
MODEL_NAME=gpt-4
```

#### 步骤3：启动服务
双击运行 `一键启动.bat`

#### 步骤4：访问系统
- 前端界面：http://localhost:3001
- 后端API：http://localhost:8000
- API文档：http://localhost:8000/docs

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

#### 访问系统
- 前端：http://localhost:3001
- 后端：http://localhost:8000

---

### 可选：安装OCR增强引擎

如需更好的PDF解析效果：
```bash
pip install paddleocr
```

---

### 可选：配置夸克网盘

1. 登录夸克网盘网页版
2. 按 F12 打开开发者工具
3. 切换到 Network 标签
4. 刷新页面，复制任意请求的 Cookie 值
5. 在系统设置页面粘贴并保存

> 注意：Cookie 仅保存在本地，不会上传到任何地方

---

## 项目结构

```
ai study helper V2/
├── backend/                # 后端服务
│   ├── app/
│   │   ├── main.py        # 应用入口
│   │   ├── config.py      # 配置管理
│   │   ├── models.py      # 数据模型
│   │   ├── routers/       # API路由
│   │   └── services/      # 业务服务
│   ├── uploads/           # 上传文件
│   ├── quark_config/      # 夸克网盘配置（不上传）
│   └── requirements.txt   # Python依赖
├── frontend/              # 前端服务
│   ├── src/
│   │   ├── components/    # React组件
│   │   ├── api.ts         # API调用
│   │   └── types.ts       # TypeScript类型
│   └── package.json       # Node.js依赖
├── 一键启动.bat            # 一键启动脚本
├── 首次安装.bat            # 首次安装脚本
├── AI使用经验谈.md         # AI编码经验记录
└── README.md
```

---

## 常见问题

### Q: AI功能无法使用？
**A:** 检查 `backend\.env` 文件中的 `OPENAI_API_KEY` 和 `OPENAI_API_BASE` 是否正确配置

### Q: PDF上传失败？
**A:** 检查 `backend\uploads\books` 目录是否有写入权限

### Q: 端口被占用？
**A:** 修改 `一键启动.bat` 中的端口号，或关闭占用端口的进程

### Q: 夸克网盘连接失败？
**A:** Cookie 可能已过期，重新获取并保存即可

---

## 许可证

本项目仅供学习和研究使用。

## 贡献

欢迎提交 Issue 和 Pull Request！

## 联系方式

如有问题或建议，请通过 Issue 联系。
