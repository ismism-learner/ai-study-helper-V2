# CSS 变量系统使用指南

## 概述

本项目采用了一个强大的 CSS 变量系统,基于 HSL 颜色模式,提供了灵活的主题控制能力。这个系统分为三个层次:

1. **基础调色盘层** - 定义基础的颜色值
2. **语义化变量层** - 将基础色映射到具体用途
3. **应用层** - 在组件中使用语义化变量

## 核心优势

### 1. 主题色相控制

通过修改基础色相变量,可以轻松改变整个应用的色调:

```css
:root {
  --hue-primary: 217;      /* 主色调 - 蓝色 */
  --hue-accent: 258;       /* 强调色 - 紫色 */
  --hue-success: 142;      /* 成功色 - 绿色 */
  --hue-warning: 38;       /* 警告色 - 橙色 */
  --hue-danger: 0;         /* 危险色 - 红色 */
  --hue-neutral: 222;      /* 中性色 - 灰色 */
}
```

**示例**: 将主题从蓝色改为紫色
```css
:root {
  --hue-primary: 270;  /* 从 217 (蓝色) 改为 270 (紫色) */
}
```

### 2. 饱和度控制

可以调整颜色的饱和度来改变视觉效果:

```css
:root {
  --saturation-primary: 91%;   /* 高饱和度 - 鲜艳 */
  --saturation-neutral: 15%;   /* 低饱和度 - 柔和 */
}
```

### 3. 语义化命名

变量名称清晰表达用途,易于理解和维护:

```css
/* 背景层级 */
--bg-base          /* 最底层背景 */
--bg-surface       /* 表面背景 */
--bg-elevated      /* 提升层背景 */
--bg-hover         /* 悬停状态背景 */

/* 文本层级 */
--text-primary     /* 主要文本 */
--text-secondary   /* 次要文本 */
--text-muted       /* 弱化文本 */

/* 边框层级 */
--border-default   /* 默认边框 */
--border-subtle    /* 细微边框 */
--border-strong    /* 强调边框 */
```

## 变量分类

### 1. 颜色系统

#### Primary 色系 (蓝色)
```css
--primary-50   /* 最浅 */
--primary-100
--primary-200
--primary-300
--primary-400
--primary-500  /* 标准色 */
--primary-600
--primary-700
--primary-800
--primary-900  /* 最深 */
```

#### 语义色系
```css
/* 成功状态 */
--success-500
--success-600

/* 警告状态 */
--warning-500
--warning-600

/* 危险状态 */
--danger-500
--danger-600

/* 强调色 */
--accent-500
--accent-600
```

#### Neutral/Gray 色系
```css
--dark-50    /* 最浅灰 */
--dark-100
--dark-200
--dark-300
--dark-400
--dark-500
--dark-600
--dark-700
--dark-800
--dark-900
--dark-950   /* 最深灰 */
```

### 2. 背景系统

```css
--bg-base       /* 页面底层背景 */
--bg-surface    /* 卡片、面板背景 */
--bg-elevated   /* 弹出层、下拉菜单背景 */
--bg-muted      /* 禁用状态背景 */
--bg-hover      /* 悬停状态背景 */
--bg-active     /* 激活状态背景 */
```

### 3. 文本系统

```css
--text-primary    /* 主要文本 - 最高对比度 */
--text-secondary  /* 次要文本 - 中等对比度 */
--text-muted      /* 弱化文本 - 低对比度 */
--text-inverse    /* 反色文本 - 用于深色背景 */
```

### 4. 边框系统

```css
--border-default  /* 默认边框 */
--border-subtle   /* 细微边框 - 更浅 */
--border-strong   /* 强调边框 - 更深 */
--border-focus    /* 焦点边框 - 主题色 */
```

### 5. 设计令牌

#### 圆角系统
```css
--radius-sm    /* 6px - 小圆角 */
--radius-md    /* 8px - 中等圆角 */
--radius-lg    /* 12px - 大圆角 */
--radius-xl    /* 16px - 超大圆角 */
--radius-full  /* 9999px - 完全圆形 */
```

#### 阴影系统
```css
--shadow-sm    /* 小阴影 */
--shadow-md    /* 中等阴影 */
--shadow-lg    /* 大阴影 */
--shadow-xl    /* 超大阴影 */
--shadow-glow  /* 发光效果 */
```

#### 过渡系统
```css
--transition-fast    /* 0.1s - 快速过渡 */
--transition-normal  /* 0.2s - 正常过渡 */
--transition-slow    /* 0.3s - 慢速过渡 */
```

#### 间距系统
```css
--spacing-xs    /* 4px */
--spacing-sm    /* 8px */
--spacing-md    /* 16px */
--spacing-lg    /* 24px */
--spacing-xl    /* 32px */
--spacing-2xl   /* 48px */
```

#### Z-index 层级系统
```css
--z-dropdown        /* 100 */
--z-sticky          /* 200 */
--z-fixed           /* 300 */
--z-modal-backdrop  /* 400 */
--z-modal           /* 500 */
--z-popover         /* 600 */
--z-tooltip         /* 700 */
```

### 6. 特殊效果变量

#### 玻璃态效果
```css
--glass-bg      /* 玻璃态背景 */
--glass-border  /* 玻璃态边框 */
--glass-blur    /* 模糊程度 */
```

#### 渐变色
```css
--gradient-primary   /* 主色渐变 */
--gradient-success   /* 成功色渐变 */
```

#### 状态颜色
```css
--state-info      /* 信息状态 */
--state-success   /* 成功状态 */
--state-warning   /* 警告状态 */
--state-error     /* 错误状态 */
```

### 7. PDF 阅读器专用变量

```css
--pdf-bg-dark          /* PDF 深色背景 */
--pdf-bg-medium        /* PDF 中等背景 */
--pdf-bg-light         /* PDF 浅色背景 */
--pdf-bg-lighter       /* PDF 更浅背景 */
--pdf-border           /* PDF 边框 */
--pdf-text-primary     /* PDF 主要文本 */
--pdf-text-secondary   /* PDF 次要文本 */
--pdf-text-muted       /* PDF 弱化文本 */
```

## 使用最佳实践

### 1. 优先使用语义化变量

❌ **不推荐**:
```css
.my-component {
  background-color: #1e293b;
  color: #f1f5f9;
  border: 1px solid #334155;
}
```

✅ **推荐**:
```css
.my-component {
  background-color: var(--bg-surface);
  color: var(--text-primary);
  border: 1px solid var(--border-default);
}
```

### 2. 使用 HSL 变量创建变体

```css
.custom-button {
  background: hsl(var(--hue-primary), var(--saturation-primary), 60%);
}

.custom-button:hover {
  background: hsl(var(--hue-primary), var(--saturation-primary), 50%);
}

.custom-button:active {
  background: hsl(var(--hue-primary), var(--saturation-primary), 40%);
}
```

### 3. 使用透明度变体

```css
.overlay {
  background: hsla(var(--hue-primary), var(--saturation-primary), 60%, 0.15);
}

.tooltip {
  background: hsla(var(--hue-neutral), 17%, 23%, 0.95);
}
```

### 4. 组合使用设计令牌

```css
.card {
  background: var(--bg-surface);
  border: 1px solid var(--border-default);
  border-radius: var(--radius-lg);
  padding: var(--spacing-md);
  box-shadow: var(--shadow-md);
  transition: all var(--transition-normal);
}

.card:hover {
  box-shadow: var(--shadow-lg);
  transform: translateY(-2px);
}
```

### 5. 创建组件特定的变量

如果某个组件需要特定的颜色变体,可以在组件级别定义:

```css
.special-component {
  --component-bg: hsl(var(--hue-primary), var(--saturation-primary), 95%);
  --component-border: hsl(var(--hue-primary), var(--saturation-primary), 85%);
  
  background: var(--component-bg);
  border: 1px solid var(--component-border);
}
```

## 主题切换

### 深色/浅色主题

系统已经内置了深色主题支持:

```css
@media (prefers-color-scheme: dark) {
  :root {
    --bg-white: var(--dark-700);
    --bg-light: var(--dark-900);
    --text-primary: var(--dark-50);
    --text-secondary: var(--dark-300);
    --text-muted: var(--dark-400);
    --border-color: var(--dark-600);
  }
}
```

### 自定义主题

创建自定义主题只需覆盖基础变量:

```css
.theme-purple {
  --hue-primary: 270;
  --hue-accent: 320;
}

.theme-green {
  --hue-primary: 142;
  --hue-accent: 180;
}
```

## 迁移指南

### 从硬编码颜色迁移

1. **识别颜色用途**: 确定硬编码颜色的用途
2. **选择对应变量**: 找到对应的语义化变量
3. **替换颜色值**: 用变量替换硬编码值
4. **测试效果**: 确保视觉效果一致

**示例**:
```css
/* 之前 */
.button {
  background: #3b82f6;
  color: white;
}

.button:hover {
  background: #2563eb;
}

/* 之后 */
.button {
  background: var(--primary-500);
  color: var(--pdf-text-primary);
}

.button:hover {
  background: var(--primary-600);
}
```

## 常见问题

### Q: 什么时候使用 `--primary-500` vs `--primary-color`?

A: `--primary-500` 是基础调色盘中的固定色值,而 `--primary-color` 是语义化变量,可以在不同上下文中重新定义。通常建议使用 `--primary-color`。

### Q: 如何创建新的颜色变体?

A: 使用 HSL 函数和基础变量:
```css
--custom-color: hsl(var(--hue-primary), 50%, 75%);
```

### Q: 透明度如何处理?

A: 使用 `hsla` 函数:
```css
--transparent-bg: hsla(var(--hue-primary), var(--saturation-primary), 60%, 0.5);
```

### Q: 如何确保可访问性?

A: 使用语义化的文本和背景变量组合,它们已经过对比度优化:
```css
/* 好的组合 */
background: var(--bg-surface);
color: var(--text-primary);

/* 避免的组合 */
background: var(--bg-base);
color: var(--text-muted);  /* 对比度可能不足 */
```

## 工具和资源

### 颜色转换工具

可以使用在线工具将 HEX 颜色转换为 HSL:
- [CSS Colors](https://csscolors.org/)
- [HSL Color Picker](https://hslpicker.com/)

### 浏览器支持

CSS 变量在现代浏览器中得到广泛支持:
- Chrome 49+
- Firefox 31+
- Safari 9.1+
- Edge 15+

## 总结

这个 CSS 变量系统提供了:

1. ✅ **灵活性** - 通过修改基础变量轻松改变主题
2. ✅ **可维护性** - 语义化命名使代码更易理解
3. ✅ **一致性** - 统一的设计令牌确保视觉一致性
4. ✅ **可扩展性** - 易于添加新的变量和主题
5. ✅ **性能优化** - 减少重复代码,提高加载效率

遵循这些最佳实践,可以构建出易于维护、高度可定制的用户界面。
