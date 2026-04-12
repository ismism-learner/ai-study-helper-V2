# 未使用API分析报告

## 后端API端点 (185个)

### 已被前端使用的API

| API路径 | 前端模块 | 使用位置 |
|---------|----------|----------|
| `/api/settings` | SettingsModal.tsx | 设置面板 |
| `/api/settings/models` | SettingsModal.tsx | 模型列表 |
| `/api/documents` | documents.ts | 文档列表 |
| `/api/documents/{id}` | documents.ts | 文档详情 |
| `/api/documents/upload` | documents.ts | 上传文档 |
| `/api/documents/upload-batch` | documents.ts | 批量上传 |
| `/api/documents/{id}/generate-framework` | documents.ts | 生成框架 |
| `/api/documents/{id}/generate-framework-stream` | documents.ts | 流式生成框架 |
| `/api/books` | library.ts | 书籍列表 |
| `/api/books/{id}` | library.ts | 书籍详情 |
| `/api/books/upload` | library.ts | 上传书籍 |
| `/api/countries` | library.ts | 国家列表 |
| `/api/categories` | library.ts | 分类列表 |
| `/api/time-periods` | library.ts | 时间段列表 |
| `/api/tags` | library.ts | 标签列表 |
| `/api/reading-stats` | library.ts | 阅读统计 |
| `/api/scan-folder` | FolderScanner.tsx | 扫描文件夹 |
| `/api/batch-import` | FolderScanner.tsx | 批量导入 |
| `/api/folders` | folders.ts | 文件夹列表 |
| `/api/tasks` | tasks.ts | 任务列表 |
| `/api/quick-notes` | quickNotes.ts | 快速笔记 |
| `/api/chapter-notes` | chapterNotes.ts | 章节笔记 |
| `/api/backup/list` | backup.ts | 备份列表 |
| `/api/dashboard/overview` | dashboard.ts | 仪表盘 |
| `/api/quark/config` | external.ts | 夸克配置 |
| `/api/duplicates/groups` | duplicate.ts | 重复检测 |
| `/api/visualization-nodes` | visualizationNodes.ts | 可视化节点 |

### 可能未使用的API

| API路径 | 用途 | 风险等级 |
|---------|------|----------|
| `POST /api/sync-existing` | 同步现有文件 | ⚠️ 中 - 可能是遗留功能 |
| `POST /api/normalize` | 文本标准化 | ⚠️ 中 - 可能被其他端点替代 |
| `GET /api/library/timeline-events/all` | 所有时间轴事件 | ⚠️ 中 - 可能被其他端点替代 |
| `GET /api/library/timeline-events/search` | 搜索时间轴事件 | ⚠️ 中 - 可能被其他端点替代 |
| `GET /api/library/timeline-summary` | 时间轴摘要 | ⚠️ 中 - 可能被其他端点替代 |

### OCR相关API（可能未完全使用）

| API路径 | 用途 |
|---------|------|
| `POST /api/pdf-ocr/paddle/load-model` | 加载OCR模型 |
| `POST /api/pdf-ocr/paddle/clear-cache` | 清除OCR缓存 |
| `GET /api/pdf-ocr/paddle/gpu-status` | GPU状态 |
| `POST /api/pdf-ocr/paddle/smart-process` | 智能处理 |
| `GET /api/pdf-ocr/check-ocrmypdf` | 检查OCRmyPDF |

### 备份相关API（可能未完全使用）

| API路径 | 用途 |
|---------|------|
| `POST /api/backup/start-scheduled` | 启动定时备份 |
| `POST /api/backup/stop-scheduled` | 停止定时备份 |
| `POST /api/backup/emergency-recovery` | 紧急恢复 |

## 建议

1. **确认未使用的API** - 需要在代码中搜索具体调用
2. **考虑移除或标记** - 如果确实未使用，可以移除或添加注释标记
3. **文档更新** - 更新API文档说明哪些是内部使用

## 下一步

需要进一步验证的API：
- `/api/sync-existing` - 检查是否有组件调用
- `/api/normalize` - 检查是否被其他端点内部调用
- `/api/library/timeline-*` - 检查时间轴相关功能
