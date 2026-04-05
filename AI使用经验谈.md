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

## 其他经验（待补充）

*在此处添加更多 AI 编码经验...*
