# AI 使用经验谈

本文档记录在使用 AI 进行编码时，如何通过更好的提示来避免常见问题。

---

## 拖拽功能实现

### 问题描述

在实现可拖拽的模态窗口/面板时，如果父组件使用了 `setPointerCapture` 或 `stopPropagation`，全局事件监听器可能无法接收到 `pointermove`/`mousemove` 事件，导致拖拽功能失效。

### 推荐的 AI 提示

```
实现一个可拖拽的模态窗口/面板，要求：
1. 使用 React 合成事件（onMouseDown/onMouseMove/onMouseUp）直接绑定到元素上
2. 不要依赖 document.addEventListener 全局监听，因为父组件可能阻止事件传播
3. 同时监听 pointer 和 mouse 事件作为备选
4. 在拖拽区域添加 touch-action: none 和 user-select: none 防止浏览器默认行为
5. 检查点击目标是否是按钮/输入框，避免误触发拖拽
```

### 关键技术点

1. **优先使用元素级事件绑定**
   - 将事件处理程序直接绑定到目标元素上，而非使用 `document.addEventListener`
   - 这样可以确保事件在元素内部被捕获，不受父组件影响

2. **同时支持多种事件系统**
   - `pointer` 事件和 `mouse` 事件都要监听
   - 某些库可能只阻止其中一种事件

3. **CSS 样式配合**
   ```css
   .draggable-header {
     touch-action: none;
     user-select: none;
     -webkit-user-select: none;
   }
   ```

4. **排除交互元素**
   ```typescript
   const target = e.target as HTMLElement;
   const isButton = target.tagName === 'BUTTON' || !!target.closest('button');
   const isInput = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA';
   if (isButton || isInput) return;
   ```

### 问题根因分析

当 PDF 阅读器（如 react-pdf）或其他复杂组件使用 `setPointerCapture` 时，指针事件会被重定向到特定元素，导致全局监听器无法接收。解决方案是在面板元素上直接处理事件。

---

## 滚动容器引用问题

### 问题描述

在实现"跟随页面"功能时，滚动事件监听器绑定到了错误的 DOM 元素，导致功能失效。具体表现为：OCR 面板打开时功能正常，关闭时失效。

### 问题根因

CSS 样式决定了实际滚动的容器：
- OCR 面板关闭时：`.reader-content` 有 `overflow-y: auto`，是实际滚动容器
- OCR 面板打开时：`.pdf-viewer-container` 有 `overflow: auto`，是实际滚动容器

但代码中的 ref 引用没有正确区分这两种情况。

### 推荐的 AI 提示

```
实现滚动监听功能时，请确保：
1. 检查 CSS 样式，确定哪个元素是实际的滚动容器（有 overflow: auto/scroll 的元素）
2. 使用多个 ref 分别引用不同的滚动容器
3. 根据条件（如面板开关状态）动态选择正确的滚动容器
4. 在 useEffect 中正确处理 ref 的切换和事件监听器的移除/添加
```

### 关键技术点

```typescript
// 使用多个 ref
const readerContentRef = useRef<HTMLDivElement>(null);
const pdfScrollRef = useRef<HTMLDivElement>(null);

// 根据条件选择正确的容器
const scrollContainer = showOCRPanel ? pdfScrollRef.current : readerContentRef.current;

// 绑定滚动事件
scrollContainer?.addEventListener('scroll', handleScroll, { passive: true });
```

---

## 数据存储位置不一致问题

### 问题描述

时间笔记保存到了 `quick_notes` 表，但年表浏览显示的是 `WorldTimelineEvent` 表，导致数据无法在正确的界面显示。

### 推荐的 AI 提示

```
在实现数据保存功能前，请先确认：
1. 数据应该保存到哪个数据库表？
2. 哪个界面/组件会读取这些数据？
3. 保存的数据格式是否与读取端期望的格式一致？
4. 是否需要在多个地方保存数据以实现联动？
```

### 解决方案

```typescript
// 同时保存到两个地方
// 1. 保存为标准笔记（显示在 PDF 笔记列表）
const newNote: PDFNote = { ... };
saveNotes([...notes, newNote]);

// 2. 保存到年表事件（显示在年表浏览）
await worldTimelineApi.createTimelineEvent(bookId, timelineData);
```

---

## 批量操作中的状态更新问题

### 问题描述

在循环中多次调用 `saveNotes`，每次都使用同一个 `notes` 数组，导致只有最后一个笔记被保存。

### 错误示例

```typescript
for (const event of events) {
  const newNote = { ... };
  const updatedNotes = [...notes, newNote]; // 每次都从原始 notes 开始
  saveNotes(updatedNotes);
}
```

### 正确做法

```typescript
const newNotesToAdd: PDFNote[] = [];

for (const event of events) {
  const newNote = { ... };
  newNotesToAdd.push(newNote); // 先收集
}

// 最后一次性保存
if (newNotesToAdd.length > 0) {
  const updatedNotes = [...notes, ...newNotesToAdd];
  saveNotes(updatedNotes);
}
```

### 推荐的 AI 提示

```
在批量操作中更新状态时，请确保：
1. 不要在循环中直接调用 setState
2. 先收集所有需要添加/更新的数据
3. 最后一次性更新状态
4. React 状态更新是异步的，循环中读取的状态可能是旧值
```

---

## 删除联动问题

### 问题描述

删除 PDF 笔记时，关联的年表事件没有被删除，导致数据不一致。

### 推荐的 AI 提示

```
实现删除功能时，请考虑：
1. 被删除的数据是否有关联数据需要同步删除？
2. 是否需要调用多个 API 来完成完整的删除操作？
3. 删除失败时如何处理部分删除的情况？
```

### 解决方案

```typescript
const handleConfirmDelete = async () => {
  const noteToDelete = notes.find(note => note.id === deleteConfirm.noteId);
  
  // 1. 删除关联的年表事件（通过 ID）
  if (noteToDelete?.timeline_event_id) {
    await worldTimelineApi.deleteTimelineEvent(noteToDelete.timeline_event_id);
  }
  
  // 2. 删除匹配的年表事件（通过标题和时间）
  if (noteToDelete?.event_date && bookId) {
    const events = await worldTimelineApi.getBookTimelineEvents(bookId);
    const matchingEvent = events.data.find(e => 
      e.event_title === noteToDelete.title && 
      e.event_date === noteToDelete.event_date
    );
    if (matchingEvent) {
      await worldTimelineApi.deleteTimelineEvent(matchingEvent.id);
    }
  }
  
  // 3. 删除本地笔记
  const updatedNotes = notes.filter(note => note.id !== deleteConfirm.noteId);
  saveNotes(updatedNotes);
};
```

---

## 多数据源同步问题

### 问题描述

年表事件存储在数据库中，PDF 笔记存储在 localStorage 中，两个系统独立运行，导致数据不同步。

### 推荐的 AI 提示

```
当数据存在于多个存储位置时，请确保：
1. 加载数据时从所有数据源获取数据
2. 合并数据时避免重复（使用唯一标识符）
3. 删除时同步删除所有数据源中的数据
4. 考虑是否需要定期同步机制
```

### 解决方案

```typescript
const loadNotes = async () => {
  // 1. 从 localStorage 加载本地笔记
  let localNotes = JSON.parse(localStorage.getItem(`pdf_notes_${documentId}`) || '[]');
  
  // 2. 从年表事件加载笔记
  if (bookId) {
    const eventsResponse = await worldTimelineApi.getBookTimelineEvents(bookId);
    const timelineNotes = eventsResponse.data.map(event => ({
      id: `timeline-${event.id}`,
      title: event.event_title,
      // ...
      timeline_event_id: event.id,
    }));
    
    // 3. 合并，避免重复
    const localNoteIds = new Set(localNotes.map(n => n.id));
    const newTimelineNotes = timelineNotes.filter(tn => !localNoteIds.has(tn.id));
    localNotes = [...localNotes, ...newTimelineNotes];
  }
  
  setNotes(localNotes);
};
```

---

## Props 传递问题

### 问题描述

需要在子组件中使用父组件的数据（如书籍标签），但没有正确传递 props。

### 推荐的 AI 提示

```
在实现功能时，请检查：
1. 组件需要哪些数据？这些数据来自哪里？
2. 是否需要在接口中添加新的 props？
3. 父组件调用时是否传递了所有必要的 props？
4. TypeScript 类型定义是否需要更新？
```

### 关键技术点

```typescript
// 1. 更新接口定义
interface PDFNotesPanelProps {
  documentId: string;
  bookId?: string;
  bookTags?: string[];  // 新增
  currentPage: number;
  // ...
}

// 2. 组件中接收 props
const PDFNotesPanel: React.FC<PDFNotesPanelProps> = ({
  documentId,
  bookId,
  bookTags,  // 新增
  // ...
}) => { ... };

// 3. 父组件传递 props
<PDFNotesPanel
  documentId={book.id}
  bookId={book.id}
  bookTags={book.tags || undefined}  // 新增
  currentPage={currentPage}
/>
```

---

## 项目初期架构规划（避免后期耦合问题）

### 问题背景

在 AI 编程过程中，如果没有在项目初期做好架构规划，后期会面临以下问题：
- 单个文件超过 1000 行，难以维护
- 功能耦合严重，修改一处影响多处
- AI 难以理解整体架构，生成代码质量下降
- 新功能开发效率越来越低

### 🎯 项目启动前的准备工作

#### 1. 明确项目边界和模块划分

**在开始编码前，向 AI 提供以下信息：**

```
我要开发一个 [项目名称]，主要功能包括：
1. [功能模块A] - 负责 xxx
2. [功能模块B] - 负责 xxx
3. [功能模块C] - 负责 xxx

请帮我设计：
1. 目录结构
2. 模块之间的依赖关系
3. 数据流向
4. 接口定义

要求：
- 每个模块职责单一
- 模块之间低耦合
- 便于后期扩展
```

#### 2. 制定文件大小限制

**推荐规则：**
- 前端组件文件：不超过 500 行
- 后端路由文件：不超过 400 行
- API 定义文件：按模块拆分，每个不超过 300 行
- 工具函数文件：不超过 200 行

**向 AI 提示：**
```
在编写代码时，请遵循以下规则：
1. 单个文件不超过 500 行
2. 如果功能复杂，主动拆分为多个文件
3. 每个文件只负责一个核心功能
4. 当文件接近限制时，提醒我进行重构
```

#### 3. 设计数据模型和存储方案

**在实现功能前，先确认：**

```
在实现 [功能名称] 前，请先帮我确认：
1. 需要哪些数据表/模型？
2. 数据之间的关系是什么？
3. 数据存储在哪里？（数据库/localStorage/状态管理）
4. 哪些组件需要访问这些数据？
5. 数据更新时如何通知相关组件？
```

### 📐 推荐的项目结构

#### 前端结构

```
src/
├── components/          # UI 组件
│   ├── common/         # 通用组件（Button, Modal, Input 等）
│   ├── features/       # 功能组件（按功能模块分组）
│   │   ├── notes/      # 笔记相关组件
│   │   ├── timeline/   # 年表相关组件
│   │   └── ocr/        # OCR 相关组件
│   └── layout/         # 布局组件
├── hooks/              # 自定义 Hooks
│   ├── useNotes.ts
│   ├── useTimeline.ts
│   └── useOCR.ts
├── services/           # 业务逻辑层
│   ├── noteService.ts
│   └── timelineService.ts
├── api/                # API 调用（按模块拆分）
│   ├── index.ts
│   ├── documents.ts
│   ├── notes.ts
│   └── timeline.ts
├── types/              # 类型定义
├── utils/              # 工具函数
└── styles/             # 样式文件
```

#### 后端结构

```
app/
├── routers/            # 路由（按功能模块拆分）
│   ├── documents/
│   │   ├── __init__.py
│   │   ├── crud.py     # CRUD 操作
│   │   ├── ai.py       # AI 相关接口
│   │   └── export.py   # 导出相关接口
│   ├── notes/
│   └── timeline/
├── services/           # 业务逻辑层
├── models/             # 数据模型
├── schemas/            # Pydantic 模型
└── utils/              # 工具函数
```

### ⚠️ 警告信号（需要重构的迹象）

当出现以下情况时，应该立即重构：

1. **文件超过 500 行** - AI 理解困难，维护成本高
2. **一个组件有超过 10 个 useState** - 状态管理混乱，应拆分或使用状态管理库
3. **useCallback 超过 20 个** - 逻辑过于复杂，应拆分为多个组件或 hooks
4. **修改一个功能需要改动多个文件** - 耦合度高，应重新设计接口
5. **AI 生成的代码经常出错** - 架构不清晰，AI 难以理解

### 🔄 重构策略

#### 当发现文件臃肿时

**向 AI 提示：**

```
我发现 [文件名] 已经有 [行数] 行，需要重构。请帮我：

1. 分析这个文件包含哪些功能
2. 建议如何拆分为多个文件
3. 设计拆分后的接口和依赖关系
4. 提供重构步骤（保证功能不变）

要求：
- 每个新文件不超过 300 行
- 明确每个文件的职责
- 保持向后兼容
```

#### 重构优先级

1. **高优先级**：当前正在频繁修改的文件
2. **中优先级**：功能复杂但稳定的文件
3. **低优先级**：影响范围大的核心文件（如 api.ts）

### 💡 与 AI 协作的最佳实践

#### 1. 分阶段开发

```
不要一次性让 AI 实现所有功能，而是：
1. 先实现核心功能
2. 确认架构合理后再扩展
3. 每完成一个模块就进行代码审查
```

#### 2. 定期审查

```
每完成一个功能模块，请 AI 帮我审查：
1. 代码结构是否合理
2. 是否有重复代码
3. 是否需要提取公共组件
4. 文件大小是否超标
```

#### 3. 保持上下文清晰

```
在开始新功能开发时，先向 AI 说明：
1. 当前项目的整体架构
2. 新功能属于哪个模块
3. 需要与哪些现有模块交互
4. 是否需要新建文件或修改现有文件
```

### 📝 检查清单

在项目初期，确保完成以下工作：

- [ ] 明确项目功能模块划分
- [ ] 设计目录结构
- [ ] 定义数据模型和存储方案
- [ ] 制定文件大小限制
- [ ] 设计模块间接口
- [ ] 确定状态管理方案
- [ ] 规划 API 结构

---

## 🚀 AI 编程初期工作指南（新手必读）

### 核心问题：为什么后期会面临巨大的耦合性问题？

**根本原因：初期没有给 AI 足够的架构约束，导致 AI "自由发挥"地堆砌代码。**

AI 的特点是：
- 倾向于在现有文件中添加代码，而不是创建新文件
- 不会主动提醒你"这个文件太大了"
- 每次对话都是"增量式"的，不会回顾整体架构
- 只要功能能实现，就不会考虑代码质量

### 🎯 初期必须做的 5 件事

#### 第一步：建立项目骨架（最重要！）

**在写第一行代码前，先让 AI 帮你建立项目骨架：**

```
我要开发一个 [项目名称]，请先帮我：

1. 设计目录结构（按功能模块划分）
2. 创建空的文件框架（只写注释和接口定义）
3. 定义数据模型和类型

要求：
- 每个功能模块有独立的目录
- 每个文件不超过 300 行
- 先不要实现具体功能，只搭建骨架
```

**这样做的好处：**
- AI 后续会在已有的框架内填充代码
- 不会出现"所有代码都在一个文件"的情况
- 后期维护成本低

#### 第二步：定义数据流和存储方案

**明确告诉 AI 数据怎么存、存在哪：**

```
在实现功能前，请先确认数据存储方案：

1. 哪些数据存数据库？表结构是什么？
2. 哪些数据存 localStorage？key 是什么？
3. 哪些数据存状态管理？用什么库？
4. 数据之间有什么关联？
5. 删除数据时是否需要同步删除关联数据？

请输出一份《数据存储方案文档》，我确认后再开始编码。
```

**常见问题：**
- 同一份数据存了多个地方，不同步
- 删除时没有清理关联数据
- 数据格式不一致，导致显示错误

#### 第三步：设置文件大小预警

**在项目规则文件中添加（如 .trae/rules/project_rules.md）：**

```markdown
## 代码规范

### 文件大小限制
- 前端组件文件：不超过 500 行
- 后端路由文件：不超过 400 行
- API 定义文件：不超过 300 行

### 当文件接近限制时
1. 提醒用户进行重构
2. 建议拆分方案
3. 不要继续往大文件中添加代码
```

**这样 AI 每次编码时都会看到这个规则，主动提醒你。**

#### 第四步：分模块开发，逐步迭代

**不要一次性让 AI 实现所有功能：**

```
❌ 错误做法：
"帮我实现用户登录、注册、个人中心、消息通知、好友系统..."

✅ 正确做法：
第一阶段：实现用户登录和注册
第二阶段：实现个人中心
第三阶段：实现消息通知
第四阶段：实现好友系统

每完成一个阶段，先测试、审查代码，再进入下一阶段。
```

#### 第五步：定期让 AI 审查代码

**每完成一个功能模块，让 AI 帮你审查：**

```
请帮我审查 [模块名称] 的代码：

1. 文件大小是否超标？
2. 是否有重复代码可以提取？
3. 组件是否过于复杂需要拆分？
4. 数据流是否清晰？
5. 是否有潜在的性能问题？

请给出具体的改进建议。
```

### ⚡ 快速参考：初期对话模板

**项目启动时：**
```
我要开发 [项目描述]，请帮我：
1. 设计项目结构
2. 定义数据模型
3. 列出主要功能模块
4. 说明模块之间的依赖关系

先不要写具体代码，只输出设计文档。
```

**开始实现功能时：**
```
现在开始实现 [功能名称]：
1. 这个功能属于哪个模块？
2. 需要创建哪些新文件？
3. 需要修改哪些现有文件？
4. 数据存哪里？
5. 与哪些其他模块交互？

请先说明以上内容，确认后再开始编码。
```

**发现文件变大时：**
```
[文件名] 已经有 [行数] 行了，请帮我：
1. 分析这个文件包含哪些功能
2. 建议如何拆分
3. 拆分后如何保持功能不变

不要继续往这个文件添加代码。
```

### 📊 项目健康度自检

**每周检查一次：**

| 检查项 | 健康标准 | 警告信号 |
|--------|----------|----------|
| 最大文件行数 | < 500 行 | > 800 行 |
| 组件 useState 数量 | < 10 个 | > 15 个 |
| 单个函数行数 | < 50 行 | > 100 行 |
| 修改影响范围 | 单个模块 | 多个模块 |
| AI 理解准确率 | > 80% | < 50% |

### 💡 总结：避免耦合性问题的关键

1. **先设计，后编码** - 让 AI 先输出设计文档，确认后再写代码
2. **骨架先行** - 建立清晰的目录结构，AI 会在框架内工作
3. **小步迭代** - 分模块开发，每完成一个模块就审查
4. **设置约束** - 在项目规则中明确文件大小限制
5. **定期审查** - 不要等问题积累，发现苗头就处理

**记住：AI 是你的助手，不是你的架构师。你需要主动提供架构约束，AI 才能写出高质量的代码。**

---

## PaddleOCR 并行处理优化实践

### 问题背景

在实现 PDF OCR 功能时，希望利用多核 CPU 和 GPU 进行并行处理，提高处理速度。但遇到了以下问题：

1. **原始架构**：使用 `asyncio.gather` + 共享单例 OCR 实例
2. **问题表现**：并发处理时，OCR 结果与页码不匹配（第1页收到了第3页的内容）
3. **用户需求**：希望启用前端UI中的"并行数量"选择器（1-5）

### 尝试方案对比

#### 方案A：多进程 + 批量推理

```python
# 每个 Worker 进程独立初始化 OCR 实例
with ProcessPoolExecutor(max_workers=4) as executor:
    futures = [executor.submit(process_page, idx, path) for idx, path in pages]
```

**测试结果**：
```
单进程处理 (顺序): 0.11秒
多进程处理 (2 Workers): 28.18秒  ← 启动开销太大！
```

**失败原因**：
- Windows 只能用 `spawn` 启动方式（不能用 `fork`）
- 每个进程都要完整初始化 PaddleOCR（约 30 秒）
- 启动开销远大于推理收益

#### 方案B：PaddleOCR 批量推理 API

```python
# 尝试批量传入图片列表
result = ocr.ocr([image1, image2, image3], cls=True)
```

**测试结果**：
```
[ppocr ERROR: When input a list of images, det must be false
```

**失败原因**：
- PaddleOCR 批量模式不支持 `det=True`
- 如果关闭检测（det=False），只能做纯识别，不适合扫描版 PDF

#### 方案C：单进程 + 线程池 + 加锁保护（最终方案）

```python
class PaddleOCRService:
    def __init__(self):
        self.ocr = None  # 单例 OCR 实例
        self._thread_pool = ThreadPoolExecutor(max_workers=4)
        self._ocr_lock = threading.Lock()  # 关键：加锁保护
    
    def _process_single_image_sync(self, image_path: str):
        with self._ocr_lock:  # 加锁，避免多线程竞争
            result = self.ocr.ocr(image_path, cls=True)
        # ... 处理结果
```

**测试结果**：
```
✅ 所有测试通过
✅ 顺序正确性：100%
✅ 启动时间：1-2秒（vs 多进程30秒）
```

### 为什么选择方案C？

| 指标 | 多进程方案 | 批量推理 | 单进程+线程池+加锁 |
|------|-----------|----------|-------------------|
| 启动时间 | 30秒+ | N/A | **1-2秒** |
| 顺序正确性 | 需额外处理 | N/A | **100%正确** |
| 显存占用 | N×模型 | N/A | **1×模型** |
| 代码复杂度 | 高 | N/A | **低** |
| 稳定性 | 中等 | 不支持 | **高** |

### 关键技术点

#### 1. 为什么需要加锁？

PaddleOCR 的 `ocr()` 方法内部不是线程安全的。当多个线程同时调用时：

```
线程A: self.ocr.ocr(image_page_1) ────> 返回结果?
线程B: self.ocr.ocr(image_page_2) ────> 返回结果?
                                    ↑ 可能收到对方的结果！
```

加锁后，同一时刻只有一个线程能调用 OCR：

```python
with self._ocr_lock:
    result = self.ocr.ocr(image_path, cls=True)
```

#### 2. 为什么不用多进程？

在 Windows 环境下：
- `multiprocessing` 只能用 `spawn` 模式
- 每个进程会重新导入所有模块、重新初始化模型
- PaddleOCR 初始化约需 30 秒

```
时间线（多进程）：
────────────────────────────────────────────────────────
进程1启动: ████████████████████████████████ (30秒初始化)
进程2启动: ████████████████████████████████ (30秒初始化)
实际推理: ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░ (0.1秒)
────────────────────────────────────────────────────────
总耗时: 30+ 秒
```

#### 3. 线程池的作用

虽然 OCR 调用是串行的（因为加锁），但线程池可以：
- 并发读取图片文件
- 并发进行图片预处理
- 让 CPU 和 GPU 有一定程度的流水线并行

### 推荐的 AI 提示

```
在实现 OCR 并行处理时，请考虑：

1. PaddleOCR 的 ocr() 方法不是线程安全的，需要加锁保护
2. Windows 下多进程启动开销很大（每个进程都要初始化模型）
3. PaddleOCR 批量模式不支持 det=True，无法用于扫描版 PDF
4. 推荐方案：单进程 + 线程池 + 加锁保护

测试验证：
- 顺序正确性：确保第N页的内容确实是第N页
- 启动时间：应该在 1-5 秒内
- 显存占用：应该只有一份模型
```

### 验证流程

```python
# 1. 创建带页码标识的测试 PDF
for page_num in range(1, 6):
    text = f"PAGE_{page_num:03d}"
    draw.text((100, 130), text, fill='black', font=font)

# 2. 执行 OCR
result = await paddleocr_service.extract_text_from_pdf(pdf_path)

# 3. 验证顺序
for page in result['pages']:
    expected = f"PAGE_{page['page_number']:03d}"
    assert expected in page['text'], f"顺序错误！期望 {expected}"
```

### 最终架构

```
┌─────────────────────────────────────────────────────┐
│  PaddleOCRService (单例)                            │
│  ├── self.ocr (单个 OCR 实例)                       │
│  ├── self._thread_pool (线程池，并发预处理)         │
│  └── self._ocr_lock (锁，保护 OCR 调用)             │
│                                                     │
│  处理流程：                                         │
│  1. 线程池并发读取图片                              │
│  2. 加锁调用 OCR（串行）                            │
│  3. 按 page_idx 排序返回结果                        │
└─────────────────────────────────────────────────────┘
```

### 性能建议

| PDF 页数 | 建议配置 |
|----------|----------|
| < 10 页 | 默认配置即可 |
| 10-50 页 | 默认配置 |
| 50-100 页 | 默认配置 |
| > 100 页 | 默认配置 |

**注意**：当前架构下，`concurrency` 参数只影响预处理线程数，不影响 OCR 推理速度。因此前端 UI 中的"并行数量"选择器暂时只保留 1 可用。

---

## 其他经验（待补充）

*在此处添加更多 AI 编码经验...*
