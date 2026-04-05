import React, { useState, useRef, useEffect, useCallback } from 'react';
import { X, Minimize2, Maximize2, Check, AlertCircle, Loader } from 'lucide-react';

interface ProgressItem {
  id: string;
  title: string;
  status: 'pending' | 'processing' | 'success' | 'error' | 'no_events';
  eventCount?: number;
  error?: string;
}

interface DraggableProgressWindowProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  items: ProgressItem[];
  currentProcessing: string | null;
  progress: { current: number; total: number };
  isProcessing: boolean;
  isPaused: boolean;
  onPause: () => void;
  onContinue: () => void;
  onStop: () => void;
}

const DraggableProgressWindow: React.FC<DraggableProgressWindowProps> = ({
  isOpen,
  onClose,
  title,
  items,
  currentProcessing,
  progress,
  isProcessing,
  isPaused,
  onPause,
  onContinue,
  onStop,
}) => {
  const [position, setPosition] = useState({ x: 20, y: 20 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [isMinimized, setIsMinimized] = useState(false);
  const windowRef = useRef<HTMLDivElement>(null);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('.window-controls')) {
      return;
    }
    setIsDragging(true);
    setDragOffset({
      x: e.clientX - position.x,
      y: e.clientY - position.y,
    });
  }, [position]);

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!isDragging) return;
    
    const newX = Math.max(0, Math.min(window.innerWidth - 320, e.clientX - dragOffset.x));
    const newY = Math.max(0, Math.min(window.innerHeight - 100, e.clientY - dragOffset.y));
    
    setPosition({ x: newX, y: newY });
  }, [isDragging, dragOffset]);

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
  }, []);

  useEffect(() => {
    if (isDragging) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
    }
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, handleMouseMove, handleMouseUp]);

  const successCount = items.filter(i => i.status === 'success').length;
  const errorCount = items.filter(i => i.status === 'error').length;
  const processingCount = items.filter(i => i.status === 'processing').length;
  const noEventsCount = items.filter(i => i.status === 'no_events').length;

  if (!isOpen) return null;

  return (
    <div
      ref={windowRef}
      style={{
        position: 'fixed',
        left: position.x,
        top: position.y,
        zIndex: 9999,
        background: 'var(--bg-elevated, #1e293b)',
        borderRadius: '12px',
        boxShadow: '0 8px 32px rgba(0, 0, 0, 0.4)',
        width: isMinimized ? '280px' : '380px',
        maxHeight: isMinimized ? 'auto' : '500px',
        overflow: 'hidden',
        cursor: isDragging ? 'grabbing' : 'default',
        transition: isDragging ? 'none' : 'width 0.2s ease',
        color: 'var(--text-primary, #e2e8f0)',
      }}
    >
      <div
        onMouseDown={handleMouseDown}
        style={{
          background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
          padding: '12px 16px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          cursor: isDragging ? 'grabbing' : 'grab',
          userSelect: 'none',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'white' }}>
          {isProcessing ? (
            <Loader size={16} className="spinning" />
          ) : (
            <Check size={16} />
          )}
          <span style={{ fontWeight: 600, fontSize: '14px' }}>{title}</span>
        </div>
        <div className="window-controls" style={{ display: 'flex', gap: '4px' }}>
          <button
            onClick={() => setIsMinimized(!isMinimized)}
            style={{
              background: 'rgba(255, 255, 255, 0.2)',
              border: 'none',
              borderRadius: '4px',
              padding: '4px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'white',
            }}
          >
            {isMinimized ? <Maximize2 size={14} /> : <Minimize2 size={14} />}
          </button>
          {!isProcessing && (
            <button
              onClick={onClose}
              style={{
                background: 'rgba(255, 255, 255, 0.2)',
                border: 'none',
                borderRadius: '4px',
                padding: '4px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'white',
              }}
            >
              <X size={14} />
            </button>
          )}
        </div>
      </div>

      {!isMinimized && (
        <>
          <div style={{ padding: '12px 16px', borderBottom: '1px solid #e5e7eb' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px', fontSize: '13px' }}>
              <span style={{ color: '#6b7280' }}>
                {isProcessing ? (
                  isPaused ? '已暂停' : `正在处理: ${currentProcessing || '...'}`
                ) : (
                  '处理完成'
                )}
              </span>
              <span style={{ fontWeight: 500 }}>{progress.current} / {progress.total}</span>
            </div>
            <div style={{ 
              height: '6px', 
              background: '#e5e7eb', 
              borderRadius: '3px',
              overflow: 'hidden' 
            }}>
              <div 
                style={{ 
                  height: '100%', 
                  background: 'linear-gradient(90deg, #667eea 0%, #764ba2 100%)',
                  width: `${(progress.current / progress.total) * 100}%`,
                  transition: 'width 0.3s ease',
                }} 
              />
            </div>
            <div style={{ display: 'flex', gap: '12px', marginTop: '8px', fontSize: '12px' }}>
              <span style={{ color: '#10b981', display: 'flex', alignItems: 'center', gap: '4px' }}>
                <Check size={12} /> 成功: {successCount}
              </span>
              {noEventsCount > 0 && (
                <span style={{ color: '#f59e0b', display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <AlertCircle size={12} /> 无事件: {noEventsCount}
                </span>
              )}
              <span style={{ color: '#ef4444', display: 'flex', alignItems: 'center', gap: '4px' }}>
                <AlertCircle size={12} /> 失败: {errorCount}
              </span>
              {processingCount > 0 && (
                <span style={{ color: '#3b82f6', display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <Loader size={12} className="spinning" /> 处理中: {processingCount}
                </span>
              )}
            </div>
          </div>

          <div style={{ 
            maxHeight: '200px', 
            overflowY: 'auto',
            padding: '8px',
          }}>
            {items.map(item => (
              <div 
                key={item.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '8px',
                  borderRadius: '6px',
                  marginBottom: '4px',
                  background: item.status === 'processing' ? '#eff6ff' 
                    : item.status === 'success' ? '#ecfdf5'
                    : item.status === 'error' ? '#fef2f2'
                    : item.status === 'no_events' ? '#fffbeb'
                    : '#f9fafb',
                  fontSize: '12px',
                }}
              >
                <div style={{
                  width: '18px',
                  height: '18px',
                  borderRadius: '50%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  background: item.status === 'processing' ? '#3b82f6'
                    : item.status === 'success' ? '#10b981'
                    : item.status === 'error' ? '#ef4444'
                    : item.status === 'no_events' ? '#f59e0b'
                    : '#e5e7eb',
                  color: 'white',
                  flexShrink: 0,
                }}>
                  {item.status === 'processing' && <Loader size={10} className="spinning" />}
                  {item.status === 'success' && <Check size={10} />}
                  {item.status === 'error' && <X size={10} />}
                  {item.status === 'no_events' && <AlertCircle size={10} />}
                </div>
                <div style={{ flex: 1, overflow: 'hidden' }}>
                  <div style={{ 
                    fontWeight: 500, 
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}>
                    {item.title}
                  </div>
                  {item.status === 'success' && item.eventCount !== undefined && (
                    <div style={{ color: '#10b981', fontSize: '11px' }}>
                      识别到 {item.eventCount} 个时间事件
                    </div>
                  )}
                  {item.status === 'no_events' && (
                    <div style={{ color: '#f59e0b', fontSize: '11px' }}>
                      未识别到时间事件
                    </div>
                  )}
                  {item.status === 'error' && item.error && (
                    <div style={{ color: '#ef4444', fontSize: '11px' }}>
                      {item.error}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>

          <div style={{ 
            padding: '12px 16px', 
            borderTop: '1px solid #e5e7eb',
            display: 'flex',
            gap: '8px',
            justifyContent: 'flex-end',
          }}>
            {isProcessing ? (
              <>
                {isPaused ? (
                  <button
                    onClick={onContinue}
                    style={{
                      padding: '6px 12px',
                      background: '#10b981',
                      color: 'white',
                      border: 'none',
                      borderRadius: '6px',
                      cursor: 'pointer',
                      fontSize: '12px',
                      fontWeight: 500,
                    }}
                  >
                    继续
                  </button>
                ) : (
                  <button
                    onClick={onPause}
                    style={{
                      padding: '6px 12px',
                      background: '#f59e0b',
                      color: 'white',
                      border: 'none',
                      borderRadius: '6px',
                      cursor: 'pointer',
                      fontSize: '12px',
                      fontWeight: 500,
                    }}
                  >
                    暂停
                  </button>
                )}
                <button
                  onClick={onStop}
                  style={{
                    padding: '6px 12px',
                    background: '#ef4444',
                    color: 'white',
                    border: 'none',
                    borderRadius: '6px',
                    cursor: 'pointer',
                    fontSize: '12px',
                    fontWeight: 500,
                  }}
                >
                  停止
                </button>
              </>
            ) : (
              <button
                onClick={onClose}
                style={{
                  padding: '6px 12px',
                  background: '#6b7280',
                  color: 'white',
                  border: 'none',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  fontSize: '12px',
                  fontWeight: 500,
                }}
              >
                关闭
              </button>
            )}
          </div>
        </>
      )}

      {isMinimized && (
        <div style={{ padding: '8px 16px', fontSize: '12px', color: '#6b7280' }}>
          <span>进度: {progress.current}/{progress.total}</span>
          <span style={{ marginLeft: '12px', color: '#10b981' }}>✓{successCount}</span>
          {noEventsCount > 0 && <span style={{ marginLeft: '8px', color: '#f59e0b' }}>○{noEventsCount}</span>}
          {errorCount > 0 && <span style={{ marginLeft: '8px', color: '#ef4444' }}>✗{errorCount}</span>}
        </div>
      )}

      <style>{`
        .spinning {
          animation: spin 1s linear infinite;
        }
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
};

export default DraggableProgressWindow;
