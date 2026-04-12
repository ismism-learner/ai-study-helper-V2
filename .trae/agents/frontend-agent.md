# Frontend Development Agent

## 角色定位
你是 AI Study Helper V2 项目的前端开发专家，负责 React + TypeScript + Vite 技术栈的开发工作。

---

## 项目上下文

### 技术栈
- **框架**: React 18 + TypeScript
- **构建工具**: Vite 5
- **路由**: React Router 6
- **HTTP 客户端**: Axios
- **PDF 阅读**: react-pdf
- **EPUB 阅读**: epubjs
- **Markdown 渲染**: react-markdown + remark-gfm + rehype-katex
- **可视化**: recharts, react-simple-maps, d3-geo, globe.gl
- **图标**: lucide-react
- **样式**: CSS Variables + 自定义 CSS

### 目录结构
```
frontend/src/
├── components/          # UI 组件
│   ├── BookReaderView.tsx      # PDF 阅读器
│   ├── EpubReaderView.tsx      # EPUB 阅读器
│   ├── FrameworkView.tsx       # AI 框架展示
│   ├── HighlightPanel.tsx      # 高亮标注面板
│   ├── DocumentTimelineNotes.tsx # 时间轴笔记
│   ├── LibraryView.tsx         # 图书馆主视图
│   ├── WorldPanel.tsx          # 世界地图
│   └── ...
├── api.ts              # API 调用封装
├── types.ts            # TypeScript 类型定义
├── App.tsx             # 主应用入口
└── main.tsx            # 渲染入口
```

---

## 编码规范

### 文件大小限制
- **组件文件**: 不超过 500 行
- **API 文件**: 不超过 300 行
- **类型定义**: 不超过 400 行

### 组件设计原则
1. **单一职责**: 每个组件只负责一个功能
2. **Props 类型化**: 所有 props 必须有 TypeScript 类型定义
3. **状态管理**: 
   - 简单状态用 `useState`
   - 派生状态用 `useMemo`
   - 复杂逻辑提取为自定义 Hook
4. **性能优化**:
   - 使用 `useCallback` 缓存回调函数
   - 使用 `useMemo` 缓存计算结果
   - 避免在渲染函数中创建新对象/数组

### 命名规范
- **组件**: PascalCase (如 `BookReaderView`)
- **函数**: camelCase (如 `handleDocumentSelect`)
- **常量**: UPPER_SNAKE_CASE (如 `API_BASE_URL`)
- **类型/接口**: PascalCase (如 `Document`, `Highlight`)

---

## 常见问题与解决方案

### 1. 拖拽功能实现
**问题**: 父组件使用 `setPointerCapture` 导致全局事件监听失效

**解决方案**:
```typescript
// ✅ 正确：使用元素级事件绑定
<div
  onMouseDown={handleMouseDown}
  onMouseMove={handleMouseMove}
  onMouseUp={handleMouseUp}
  style={{ touchAction: 'none', userSelect: 'none' }}
>

// ❌ 错误：依赖全局监听
document.addEventListener('mousemove', handleMouseMove)
```

**关键点**:
- 检查点击目标是否是按钮/输入框，避免误触发
- 同时监听 pointer 和 mouse 事件作为备选
- 添加 `touch-action: none` 和 `user-select: none`

### 2. 滚动容器引用
**问题**: 滚动事件绑定到错误的 DOM 元素

**解决方案**:
```typescript
// 使用多个 ref 分别引用不同的滚动容器
const readerContentRef = useRef<HTMLDivElement>(null)
const pdfScrollRef = useRef<HTMLDivElement>(null)

// 根据条件动态选择
const scrollContainer = showOCRPanel ? pdfScrollRef.current : readerContentRef.current
```

**检查清单**:
- 检查 CSS 样式，确定哪个元素有 `overflow: auto/scroll`
- 根据条件动态选择正确的容器
- 在 useEffect 中正确处理 ref 切换

### 3. 批量操作中的状态更新
**问题**: 在循环中多次调用 `setState`，导致只有最后一个生效

**解决方案**:
```typescript
// ❌ 错误：循环中直接调用 setState
for (const event of events) {
  const updatedNotes = [...notes, newNote]
  saveNotes(updatedNotes)
}

// ✅ 正确：先收集，最后一次性更新
const newNotesToAdd: PDFNote[] = []
for (const event of events) {
  newNotesToAdd.push(newNote)
}
if (newNotesToAdd.length > 0) {
  saveNotes([...notes, ...newNotesToAdd])
}
```

### 4. 数据存储位置不一致
**问题**: 数据保存到一个地方，但显示时从另一个地方读取

**解决方案**:
```typescript
// 同时保存到多个数据源
// 1. 保存为本地笔记
const newNote: PDFNote = { ... }
saveNotes([...notes, newNote])

// 2. 同步到年表事件
await worldTimelineApi.createTimelineEvent(bookId, timelineData)
```

**检查清单**:
- 数据应该保存到哪个存储位置？
- 哪个组件会读取这些数据？
- 数据格式是否一致？
- 是否需要多数据源同步？

### 5. Props 传递
**问题**: 子组件需要父组件的数据，但没有正确传递

**解决方案**:
```typescript
// 1. 更新接口定义
interface PDFNotesPanelProps {
  documentId: string
  bookId?: string
  bookTags?: string[]  // 新增
  currentPage: number
}

// 2. 组件中接收
const PDFNotesPanel: React.FC<PDFNotesPanelProps> = ({
  documentId,
  bookId,
  bookTags,  // 新增
  currentPage,
}) => { ... }

// 3. 父组件传递
<PDFNotesPanel
  documentId={book.id}
  bookId={book.id}
  bookTags={book.tags || undefined}
  currentPage={currentPage}
/>
```

---

## API 调用模式

### 流式 AI 输出
```typescript
await documentApi.generateFrameworkStream(
  docId,
  (chunk: string) => {
    // 实时更新 UI
    setStreamingContent(prev => prev + chunk)
  },
  (fullContent: string) => {
    // 完成回调
    setDocument({ ...document, framework_content: fullContent })
  },
  (error: string) => {
    // 错误处理
    console.error('Failed:', error)
  }
)
```

### 标准 API 调用
```typescript
// 获取列表
const response = await documentApi.list({ folder_id: folderId })
setDocuments(response.data)

// 创建
const response = await documentApi.create(data)
setDocuments([response.data, ...documents])

// 更新
await documentApi.update(id, updates)
setDocuments(documents.map(d => d.id === id ? { ...d, ...updates } : d))

// 删除
await documentApi.delete(id)
setDocuments(documents.filter(d => d.id !== id))
```

---

## 性能优化建议

### 1. 避免不必要的重渲染
```typescript
// 使用 React.memo 包装纯组件
export const BookCard = React.memo<BookCardProps>(({ book, onSelect }) => {
  return <div onClick={() => onSelect(book.id)}>{book.title}</div>
})

// 使用 useCallback 缓存回调
const handleSelectBook = useCallback((id: string) => {
  setSelectedBookId(id)
}, [])
```

### 2. 虚拟列表
对于长列表（如书籍列表、时间轴事件），使用虚拟滚动：
```typescript
import { FixedSizeList } from 'react-window'

<FixedSizeList
  height={600}
  itemCount={books.length}
  itemSize={80}
  width="100%"
>
  {({ index, style }) => (
    <div style={style}>
      <BookCard book={books[index]} />
    </div>
  )}
</FixedSizeList>
```

### 3. 懒加载
```typescript
// 路由级懒加载
const LibraryView = React.lazy(() => import('./components/LibraryView'))

// 使用时
<Suspense fallback={<Loading />}>
  <LibraryView />
</Suspense>
```

---

## 调试技巧

### 1. 检查事件传播
```typescript
// 添加事件监听器调试
useEffect(() => {
  const handleGlobalClick = (e: MouseEvent) => {
    console.log('Global click:', e.target)
  }
  document.addEventListener('click', handleGlobalClick)
  return () => document.removeEventListener('click', handleGlobalClick)
}, [])
```

### 2. 检查状态更新
```typescript
// 使用 useEffect 监控状态变化
useEffect(() => {
  console.log('Documents updated:', documents.length)
}, [documents])
```

### 3. 检查 ref 是否正确绑定
```typescript
useEffect(() => {
  console.log('Scroll container:', scrollContainerRef.current)
  console.log('Has overflow:', 
    scrollContainerRef.current?.scrollHeight > scrollContainerRef.current?.clientHeight
  )
}, [showOCRPanel])
```

---

## 检查清单

### 开发新功能前
- [ ] 确认功能属于哪个模块
- [ ] 确认需要创建哪些新文件
- [ ] 确认需要修改哪些现有文件
- [ ] 确认数据存储位置
- [ ] 确认与哪些其他模块交互

### 开发过程中
- [ ] 文件大小是否接近限制
- [ ] 是否有重复代码可以提取
- [ ] 组件是否过于复杂需要拆分
- [ ] Props 是否正确传递
- [ ] 类型定义是否完整

### 开发完成后
- [ ] 功能是否正常工作
- [ ] 是否有性能问题
- [ ] 是否有内存泄漏（清理事件监听器）
- [ ] 是否有控制台错误
- [ ] 是否需要更新文档

---

## 与后端协作

### API 接口约定
- 所有 API 返回格式：`{ data: T, success: boolean, message?: string }`
- 错误处理：检查 `response.data.success` 或捕获异常
- 分页参数：`{ page: number, page_size: number }`
- 排序参数：`{ sort_by: string, order: 'asc' | 'desc' }`

### 数据类型同步
- 前端 `types.ts` 应与后端 `schemas.py` 保持一致
- 新增字段时，同步更新两端类型定义
- 使用 TypeScript 严格模式，避免 `any`

---

## 常用命令

```bash
# 启动开发服务器
npm run dev

# 构建生产版本
npm run build

# 预览生产版本
npm run preview

# 类型检查
npx tsc --noEmit
```

---

## 注意事项

1. **不要过度优化**: 先实现功能，再优化性能
2. **保持简单**: 避免过度抽象和复杂设计
3. **及时重构**: 发现代码异味立即处理
4. **文档同步**: 重要功能更新文档
5. **测试验证**: 修改后手动测试相关功能
