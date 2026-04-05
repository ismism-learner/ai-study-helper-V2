import React, { useState, useCallback, useRef, useEffect } from 'react';
import { Check, X, RefreshCw, Play, Pause, SkipForward } from 'lucide-react';

interface BatchOptimizePanelProps {
  paragraphs: string[];
  onOptimize: (paragraph: string) => Promise<string>;
  onConfirm: (index: number, newText: string) => void;
  onClose: () => void;
}

interface ParagraphState {
  originalText: string;
  optimizedText: string | null;
  isProcessing: boolean;
  isCompleted: boolean;
  selectedVersion: 'original' | 'optimized';
  editedOriginal: string;
  editedOptimized: string;
}

const BatchOptimizePanel: React.FC<BatchOptimizePanelProps> = ({
  paragraphs,
  onOptimize,
  onConfirm,
  onClose,
}) => {
  const [states, setStates] = useState<ParagraphState[]>(() =>
    paragraphs.map(p => ({
      originalText: p,
      optimizedText: null,
      isProcessing: false,
      isCompleted: false,
      selectedVersion: 'original' as const,
      editedOriginal: p,
      editedOptimized: '',
    }))
  );
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isRunning, setIsRunning] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const processTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (processTimeoutRef.current) {
        clearTimeout(processTimeoutRef.current);
      }
    };
  }, []);

  const processNext = useCallback(async (startIndex: number) => {
    if (startIndex >= paragraphs.length) {
      setIsRunning(false);
      return;
    }

    const state = states[startIndex];
    if (state.isCompleted) {
      processNext(startIndex + 1);
      return;
    }

    setStates(prev => prev.map((s, i) => 
      i === startIndex ? { ...s, isProcessing: true } : s
    ));

    try {
      const optimized = await onOptimize(state.originalText);
      setStates(prev => prev.map((s, i) => 
        i === startIndex ? { 
          ...s, 
          optimizedText: optimized,
          editedOptimized: optimized,
          isProcessing: false,
          isCompleted: true,
          selectedVersion: 'optimized',
        } : s
      ));

      if (!isPaused && startIndex + 1 < paragraphs.length) {
        setCurrentIndex(startIndex + 1);
        if (processTimeoutRef.current) {
          clearTimeout(processTimeoutRef.current);
        }
        processTimeoutRef.current = setTimeout(() => processNext(startIndex + 1), 500);
      }
    } catch (error) {
      console.error('Optimization failed:', error);
      setStates(prev => prev.map((s, i) => 
        i === startIndex ? { ...s, isProcessing: false } : s
      ));
      setIsRunning(false);
    }
  }, [paragraphs, onOptimize, isPaused, states]);

  const handleStart = () => {
    setIsRunning(true);
    setIsPaused(false);
    processNext(currentIndex);
  };

  const handlePause = () => {
    setIsPaused(true);
  };

  const handleContinue = () => {
    setIsPaused(false);
    const nextUncompleted = states.findIndex((s, i) => i >= currentIndex && !s.isCompleted);
    if (nextUncompleted !== -1) {
      processNext(nextUncompleted);
    }
  };

  const handleSkip = () => {
    const nextIndex = states.findIndex((s, i) => i > currentIndex && !s.isCompleted);
    if (nextIndex !== -1) {
      setCurrentIndex(nextIndex);
    }
  };

  const handleSelectVersion = (index: number, version: 'original' | 'optimized') => {
    setStates(prev => prev.map((s, i) => 
      i === index ? { ...s, selectedVersion: version } : s
    ));
  };

  const handleEditOriginal = (index: number, text: string) => {
    setStates(prev => prev.map((s, i) => 
      i === index ? { ...s, editedOriginal: text } : s
    ));
  };

  const handleEditOptimized = (index: number, text: string) => {
    setStates(prev => prev.map((s, i) => 
      i === index ? { ...s, editedOptimized: text } : s
    ));
  };

  const handleConfirmOne = (index: number) => {
    const state = states[index];
    const finalText = state.selectedVersion === 'original' 
      ? state.editedOriginal 
      : state.editedOptimized;
    onConfirm(index, finalText);
  };

  const handleConfirmAll = () => {
    states.forEach((state, index) => {
      const finalText = state.selectedVersion === 'original' 
        ? state.editedOriginal 
        : state.editedOptimized || state.editedOriginal;
      onConfirm(index, finalText);
    });
    onClose();
  };

  const completedCount = states.filter(s => s.isCompleted).length;

  return (
    <div className="batch-optimize-panel">
      <div className="batch-optimize-header">
        <h3>批量AI删改</h3>
        <div className="batch-progress">
          <span>{completedCount} / {paragraphs.length} 已完成</span>
          <div className="progress-bar">
            <div 
              className="progress-fill" 
              style={{ width: `${(completedCount / paragraphs.length) * 100}%` }}
            />
          </div>
        </div>
      </div>

      <div className="batch-optimize-controls">
        {!isRunning ? (
          <button className="btn btn-primary" onClick={handleStart}>
            <Play size={16} /> 开始处理
          </button>
        ) : isPaused ? (
          <button className="btn btn-primary" onClick={handleContinue}>
            <Play size={16} /> 继续
          </button>
        ) : (
          <button className="btn btn-secondary" onClick={handlePause}>
            <Pause size={16} /> 暂停
          </button>
        )}
        <button className="btn btn-secondary" onClick={handleSkip} disabled={!isRunning}>
          <SkipForward size={16} /> 跳过
        </button>
        <button className="btn btn-primary" onClick={handleConfirmAll}>
          确认全部修改
        </button>
        <button className="btn btn-secondary" onClick={onClose}>
          取消
        </button>
      </div>

      <div className="batch-optimize-list">
        {states.map((state, index) => (
          <div 
            key={index} 
            className={`batch-item ${currentIndex === index ? 'active' : ''} ${state.isCompleted ? 'completed' : ''}`}
          >
            <div className="batch-item-header">
              <span className="batch-item-number">段落 {index + 1}</span>
              {state.isProcessing && (
                <span className="processing-badge">
                  <RefreshCw size={12} className="spinning" /> 处理中...
                </span>
              )}
              {state.isCompleted && (
                <span className="completed-badge">
                  <Check size={12} /> 已完成
                </span>
              )}
            </div>

            {state.isCompleted && state.optimizedText ? (
              <div className="batch-comparison">
                <div className={`comparison-panel ${state.selectedVersion === 'original' ? 'selected' : ''}`}>
                  <div className="panel-header">
                    <span className="panel-label">原文</span>
                    <button
                      className={`select-btn ${state.selectedVersion === 'original' ? 'active' : ''}`}
                      onClick={() => handleSelectVersion(index, 'original')}
                    >
                      {state.selectedVersion === 'original' ? <Check size={12} /> : <X size={12} />}
                      {state.selectedVersion === 'original' ? '已选择' : '选择'}
                    </button>
                  </div>
                  <textarea
                    className="panel-textarea"
                    value={state.editedOriginal}
                    onChange={(e) => handleEditOriginal(index, e.target.value)}
                  />
                </div>

                <div className={`comparison-panel ${state.selectedVersion === 'optimized' ? 'selected' : ''}`}>
                  <div className="panel-header">
                    <span className="panel-label">AI优化</span>
                    <button
                      className={`select-btn ${state.selectedVersion === 'optimized' ? 'active' : ''}`}
                      onClick={() => handleSelectVersion(index, 'optimized')}
                    >
                      {state.selectedVersion === 'optimized' ? <Check size={12} /> : <X size={12} />}
                      {state.selectedVersion === 'optimized' ? '已选择' : '选择'}
                    </button>
                  </div>
                  <textarea
                    className="panel-textarea"
                    value={state.editedOptimized}
                    onChange={(e) => handleEditOptimized(index, e.target.value)}
                  />
                </div>
              </div>
            ) : (
              <div className="batch-item-preview">
                {state.originalText.substring(0, 150)}
                {state.originalText.length > 150 ? '...' : ''}
              </div>
            )}

            {state.isCompleted && (
              <div className="batch-item-actions">
                <button className="btn btn-secondary btn-sm" onClick={() => handleConfirmOne(index)}>
                  确认此段落
                </button>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};

export default BatchOptimizePanel;
