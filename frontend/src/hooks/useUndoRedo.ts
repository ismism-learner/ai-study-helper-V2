import { useState, useCallback, useRef } from 'react';

/**
 * 通用 Undo/Redo Hook
 *
 * 维护一个状态快照栈，支持撤销/重做操作。
 * 设计原则：
 * - 每次 push 都记录当前状态快照
 * - undo 恢复到上一个快照，redo 恢复到下一个快照
 * - 新的 push 会清除 redo 栈（标准行为）
 * - 支持最大历史深度限制，防止内存泄漏
 *
 * @typeParam T - 状态类型（必须是可序列化的，建议用不可变数据）
 * @param initialState - 初始状态
 * @param options - 配置选项
 *
 * @example
 * ```tsx
 * const { state, push, undo, redo, canUndo, canRedo } = useUndoRedo('');
 *
 * // 编辑时 push 新状态
 * const handleChange = (newVal: string) => {
 *   push(newVal);  // 自动记录旧状态到历史栈
 * };
 *
 * // Ctrl+Z / Ctrl+Y
 * const handleKeyDown = (e: KeyboardEvent) => {
 *   if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
 *     e.preventDefault();
 *     if (e.shiftKey) redo(); else undo();
 *   }
 *   if ((e.ctrlKey || e.metaKey) && e.key === 'y') {
 *     e.preventDefault();
 *     redo();
 *   }
 * };
 * ```
 */
export interface UseUndoRedoOptions {
  /** 最大历史深度，默认 50 */
  maxDepth?: number;
}

export interface UseUndoRedoReturn<T> {
  /** 当前状态 */
  state: T;
  /** 推入新状态（会自动将当前状态存入历史栈） */
  push: (newState: T) => void;
  /** 撤销到上一个状态，返回 true 表示成功 */
  undo: () => boolean;
  /** 重做到下一个状态，返回 true 表示成功 */
  redo: () => boolean;
  /** 是否可以撤销 */
  canUndo: boolean;
  /** 是否可以重做 */
  canRedo: boolean;
  /** 清空历史栈，重置到指定状态 */
  reset: (newState: T) => void;
  /** 历史栈深度 */
  historySize: number;
}

export function useUndoRedo<T>(
  initialState: T,
  options: UseUndoRedoOptions = {}
): UseUndoRedoReturn<T> {
  const { maxDepth = 50 } = options;

  // 当前状态
  const [state, setState] = useState<T>(initialState);
  // 撤销栈（过去的状态）
  const undoStackRef = useRef<T[]>([]);
  // 重做栈（被撤销的状态）
  const redoStackRef = useRef<T[]>([]);
  // 触发重渲染的版本号
  const [version, setVersion] = useState(0);

  // 用 ref 保存最新 state，避免闭包问题
  const stateRef = useRef<T>(initialState);
  stateRef.current = state;

  const push = useCallback((newState: T) => {
    // 将当前状态压入撤销栈
    undoStackRef.current.push(stateRef.current);
    // 新的 push 清除重做栈
    redoStackRef.current = [];
    // 限制深度
    if (undoStackRef.current.length > maxDepth) {
      undoStackRef.current.shift();
    }
    stateRef.current = newState;
    setState(newState);
    setVersion(v => v + 1);
  }, [maxDepth]);

  const undo = useCallback((): boolean => {
    if (undoStackRef.current.length === 0) return false;
    // 当前状态压入重做栈
    redoStackRef.current.push(stateRef.current);
    // 从撤销栈弹出上一个状态
    const prevState = undoStackRef.current.pop()!;
    stateRef.current = prevState;
    setState(prevState);
    setVersion(v => v + 1);
    return true;
  }, []);

  const redo = useCallback((): boolean => {
    if (redoStackRef.current.length === 0) return false;
    // 当前状态压入撤销栈
    undoStackRef.current.push(stateRef.current);
    // 从重做栈弹出下一个状态
    const nextState = redoStackRef.current.pop()!;
    stateRef.current = nextState;
    setState(nextState);
    setVersion(v => v + 1);
    return true;
  }, []);

  const reset = useCallback((newState: T) => {
    undoStackRef.current = [];
    redoStackRef.current = [];
    stateRef.current = newState;
    setState(newState);
    setVersion(v => v + 1);
  }, []);

  const canUndo = undoStackRef.current.length > 0;
  const canRedo = redoStackRef.current.length > 0;
  const historySize = undoStackRef.current.length;

  // version 只用于触发重渲染，不直接使用
  void version;

  return {
    state,
    push,
    undo,
    redo,
    canUndo,
    canRedo,
    reset,
    historySize,
  };
}

/**
 * 创建 Ctrl+Z / Ctrl+Y / Ctrl+Shift+Z 键盘事件处理器
 * 可直接绑定到 onKeyDown
 */
export function createUndoRedoKeyHandler(
  undo: () => boolean,
  redo: () => boolean
) {
  return (e: React.KeyboardEvent | KeyboardEvent) => {
    if (!(e.ctrlKey || e.metaKey)) return;

    if (e.key === 'z' && !e.shiftKey) {
      e.preventDefault();
      undo();
    } else if ((e.key === 'z' && e.shiftKey) || e.key === 'y') {
      e.preventDefault();
      redo();
    }
  };
}
