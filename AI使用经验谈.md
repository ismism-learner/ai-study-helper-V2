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

## 其他经验（待补充）

*在此处添加更多 AI 编码经验...*
