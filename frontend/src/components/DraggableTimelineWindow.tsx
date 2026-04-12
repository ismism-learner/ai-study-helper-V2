import React, { useState, useRef, useEffect, useCallback } from 'react';
import { 
  X, 
  Minimize2, 
  Maximize2, 
  Check, 
  Save, 
  Tag, 
  Plus, 
  Calendar,
  Sparkles,
  Loader,
  AlertCircle
} from 'lucide-react';
import { worldTimelineApi } from '../api';

interface TimelineNoteParseResult {
  event_date: string;
  event_date_display: string;
  event_title: string;
  event_description: string;
}

interface DraggableTimelineWindowProps {
  isOpen: boolean;
  onClose: () => void;
  documentId: string;
  documentTitle?: string;
  onSuccess: () => void;
}

const DraggableTimelineWindow: React.FC<DraggableTimelineWindowProps> = ({
  isOpen,
  onClose,
  documentId,
  documentTitle,
  onSuccess,
}) => {
  const [position, setPosition] = useState({ x: window.innerWidth - 420, y: 20 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [isMinimized, setIsMinimized] = useState(false);
  const windowRef = useRef<HTMLDivElement>(null);

  const [customPrompt, setCustomPrompt] = useState('');
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState('');
  const [historyTags, setHistoryTags] = useState<string[]>([]);
  const [historyTagDropdownOpen, setHistoryTagDropdownOpen] = useState(false);
  const historyTagDropdownRef = useRef<HTMLDivElement>(null);

  const [isGenerating, setIsGenerating] = useState(false);
  const [aiGeneratedEvents, setAiGeneratedEvents] = useState<TimelineNoteParseResult[]>([]);
  const [selectedEvents, setSelectedEvents] = useState<Set<number>>(new Set());
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastSelectedIndex, setLastSelectedIndex] = useState<number | null>(null);
  const [eventTags, setEventTags] = useState<Map<number, string[]>>(new Map());
  const [showTagPanel, setShowTagPanel] = useState(false);
  const [batchTagInput, setBatchTagInput] = useState('');
  const [tagFeedback, setTagFeedback] = useState<string | null>(null);
  const [noEventsFound, setNoEventsFound] = useState(false);

  useEffect(() => {
    if (isOpen) {
      loadHistoryTags();
      setAiGeneratedEvents([]);
      setSelectedEvents(new Set());
      setError(null);
      setNoEventsFound(false);
    }
  }, [isOpen]);

  const loadHistoryTags = async () => {
    try {
      const response = await worldTimelineApi.getTimelineTagsHistory();
      setHistoryTags(response.data.tags || []);
    } catch (error) {
      console.error('Failed to load history tags:', error);
    }
  };

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('.window-controls') || 
        (e.target as HTMLElement).closest('.window-content')) {
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
    
    const newX = Math.max(0, Math.min(window.innerWidth - 400, e.clientX - dragOffset.x));
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

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (historyTagDropdownRef.current && !historyTagDropdownRef.current.contains(event.target as Node)) {
        setHistoryTagDropdownOpen(false);
      }
    };

    if (historyTagDropdownOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [historyTagDropdownOpen]);

  const handleAddTag = () => {
    if (tagInput.trim() && !selectedTags.includes(tagInput.trim())) {
      setSelectedTags([...selectedTags, tagInput.trim()]);
      setTagInput('');
    }
  };

  const handleRemoveTag = (tag: string) => {
    setSelectedTags(selectedTags.filter(t => t !== tag));
  };

  const handleGenerate = async () => {
    if (!documentId) return;
    
    setIsGenerating(true);
    setAiGeneratedEvents([]);
    setError(null);
    setSelectedEvents(new Set());
    setEventTags(new Map());
    setNoEventsFound(false);
    
    try {
      const response = await worldTimelineApi.aiGenerateTimelineNotes(documentId, customPrompt);
      
      if (response.data.parsed_events && response.data.parsed_events.length > 0) {
        setAiGeneratedEvents(response.data.parsed_events);
        setSelectedEvents(new Set(response.data.parsed_events.map((_, i) => i)));
      } else {
        setNoEventsFound(true);
      }
    } catch (error) {
      console.error('Failed to generate timeline notes:', error);
      setError(error instanceof Error ? error.message : '生成失败');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleSaveSelected = async () => {
    if (aiGeneratedEvents.length === 0 || selectedEvents.size === 0) return;
    
    setIsSaving(true);
    setError(null);
    
    try {
      const selectedIndices = Array.from(selectedEvents).sort((a, b) => a - b);
      
      const eventsToSave = selectedIndices.map(originalIndex => {
        const event = aiGeneratedEvents[originalIndex];
        const individualTags = eventTags.get(originalIndex) || [];
        return {
          event_date: event.event_date,
          event_date_display: event.event_date_display,
          event_title: event.event_title,
          event_description: event.event_description,
          tags: individualTags.length > 0 ? individualTags : (selectedTags.length > 0 ? selectedTags : undefined)
        };
      });
      
      await worldTimelineApi.saveTimelineNotesBatch(documentId, eventsToSave, selectedTags);
      
      onSuccess();
      window.dispatchEvent(new CustomEvent('timeline-note-added'));
      onClose();
    } catch (error) {
      console.error('Failed to save timeline notes:', error);
      setError(error instanceof Error ? error.message : '保存失败');
    } finally {
      setIsSaving(false);
    }
  };

  const handleEventClick = (index: number, e: React.MouseEvent) => {
    if (e.shiftKey && lastSelectedIndex !== null) {
      const start = Math.min(lastSelectedIndex, index);
      const end = Math.max(lastSelectedIndex, index);
      const newSelected = new Set(selectedEvents);
      
      for (let i = start; i <= end; i++) {
        newSelected.add(i);
      }
      setSelectedEvents(newSelected);
    } else {
      toggleEventSelection(index);
    }
    setLastSelectedIndex(index);
  };

  const toggleEventSelection = (index: number) => {
    const newSelected = new Set(selectedEvents);
    if (newSelected.has(index)) {
      newSelected.delete(index);
    } else {
      newSelected.add(index);
    }
    setSelectedEvents(newSelected);
  };

  const toggleSelectAll = () => {
    if (selectedEvents.size === aiGeneratedEvents.length) {
      setSelectedEvents(new Set());
      setLastSelectedIndex(null);
    } else {
      setSelectedEvents(new Set(aiGeneratedEvents.map((_, i) => i)));
    }
  };

  const handleAddBatchTag = () => {
    if (!batchTagInput.trim()) return;
    
    const newTag = batchTagInput.trim();
    const newEventTags = new Map(eventTags);
    
    selectedEvents.forEach(index => {
      const currentTags = newEventTags.get(index) || [];
      if (!currentTags.includes(newTag)) {
        newEventTags.set(index, [...currentTags, newTag]);
      }
    });
    
    setEventTags(newEventTags);
    setBatchTagInput('');
    
    setTagFeedback(`已为 ${selectedEvents.size} 个事件添加标签 "${newTag}"`);
    setTimeout(() => setTagFeedback(null), 2000);
  };

  const handleAddHistoryTagToSelected = (tag: string) => {
    const newEventTags = new Map(eventTags);
    
    selectedEvents.forEach(index => {
      const currentTags = newEventTags.get(index) || [];
      if (!currentTags.includes(tag)) {
        newEventTags.set(index, [...currentTags, tag]);
      }
    });
    
    setEventTags(newEventTags);
    
    setTagFeedback(`已为 ${selectedEvents.size} 个事件添加标签 "${tag}"`);
    setTimeout(() => setTagFeedback(null), 2000);
  };

  if (!isOpen) return null;

  const isProcessing = isGenerating || isSaving;

  return (
    <div
      ref={windowRef}
      className="window-content"
      style={{
        position: 'fixed',
        left: position.x,
        top: position.y,
        zIndex: 9999,
        background: 'var(--bg-elevated, #1e293b)',
        borderRadius: '12px',
        boxShadow: '0 8px 32px rgba(0, 0, 0, 0.4)',
        width: isMinimized ? '320px' : '400px',
        maxHeight: isMinimized ? 'auto' : '600px',
        overflow: 'hidden',
        cursor: isDragging ? 'grabbing' : 'default',
        transition: isDragging ? 'none' : 'width 0.2s ease, max-height 0.2s ease',
        display: 'flex',
        flexDirection: 'column',
        color: 'var(--text-primary, #e2e8f0)',
      }}
    >
      <div
        onMouseDown={handleMouseDown}
        style={{
          background: 'linear-gradient(135deg, #8b5cf6 0%, #6366f1 100%)',
          padding: '12px 16px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          cursor: isDragging ? 'grabbing' : 'grab',
          userSelect: 'none',
          flexShrink: 0,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'white' }}>
          {isProcessing ? (
            <Loader size={16} className="spinning" />
          ) : (
            <Sparkles size={16} />
          )}
          <span style={{ fontWeight: 600, fontSize: '14px' }}>
            {documentTitle ? `时间笔记: ${documentTitle.slice(0, 20)}${documentTitle.length > 20 ? '...' : ''}` : 'AI生成时间笔记'}
          </span>
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
        </div>
      </div>

      {!isMinimized && (
        <div style={{ 
          flex: 1, 
          overflow: 'auto',
          padding: '12px',
          display: 'flex',
          flexDirection: 'column',
          gap: '12px'
        }}>
          {error && (
            <div style={{
              background: '#fef2f2',
              color: '#dc2626',
              padding: '8px 12px',
              borderRadius: '6px',
              fontSize: '12px',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
            }}>
              <AlertCircle size={14} />
              {error}
            </div>
          )}

          {tagFeedback && (
            <div style={{
              background: '#ecfdf5',
              color: '#059669',
              padding: '8px 12px',
              borderRadius: '6px',
              fontSize: '12px',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
            }}>
              <Check size={14} />
              {tagFeedback}
            </div>
          )}

          {aiGeneratedEvents.length === 0 && !isGenerating && !noEventsFound && (
            <>
              <div>
                <label style={{ display: 'block', marginBottom: '4px', fontWeight: 500, fontSize: '12px' }}>
                  自定义提示词（可选）
                </label>
                <textarea
                  value={customPrompt}
                  onChange={(e) => setCustomPrompt(e.target.value)}
                  placeholder="留空使用默认提示词"
                  rows={2}
                  style={{
                    width: '100%',
                    padding: '8px',
                    border: '1px solid #e5e7eb',
                    borderRadius: '6px',
                    fontSize: '12px',
                    resize: 'vertical',
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', marginBottom: '4px', fontWeight: 500, fontSize: '12px' }}>
                  默认标签
                </label>
                <div style={{ display: 'flex', gap: '6px', marginBottom: '6px' }}>
                  <input
                    type="text"
                    value={tagInput}
                    onChange={(e) => setTagInput(e.target.value)}
                    onKeyPress={(e) => e.key === 'Enter' && handleAddTag()}
                    placeholder="输入标签"
                    style={{
                      flex: 1,
                      padding: '6px 8px',
                      border: '1px solid #e5e7eb',
                      borderRadius: '4px',
                      fontSize: '12px',
                    }}
                  />
                  <button
                    onClick={handleAddTag}
                    style={{
                      padding: '6px 12px',
                      background: 'var(--primary-500)',
                      color: 'white',
                      border: 'none',
                      borderRadius: '4px',
                      cursor: 'pointer',
                      fontSize: '12px',
                    }}
                  >
                    添加
                  </button>
                </div>
                {selectedTags.length > 0 && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                    {selectedTags.map((tag, index) => (
                      <span key={index} style={{
                        background: '#e0e7ff',
                        padding: '2px 8px',
                        borderRadius: '10px',
                        fontSize: '11px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px',
                      }}>
                        {tag}
                        <button
                          onClick={() => handleRemoveTag(tag)}
                          style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '12px', padding: 0 }}
                        >
                          ×
                        </button>
                      </span>
                    ))}
                  </div>
                )}
              </div>

              <button
                onClick={handleGenerate}
                disabled={isGenerating}
                style={{
                  padding: '10px 16px',
                  background: isGenerating ? '#9ca3af' : 'var(--accent-500)',
                  color: 'white',
                  border: 'none',
                  borderRadius: '8px',
                  cursor: isGenerating ? 'not-allowed' : 'pointer',
                  fontSize: '13px',
                  fontWeight: 500,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '6px',
                  width: '100%',
                }}
              >
                <Sparkles size={16} />
                {isGenerating ? '正在生成...' : 'AI生成时间笔记'}
              </button>
            </>
          )}

          {isGenerating && (
            <div style={{ textAlign: 'center', padding: '20px' }}>
              <Loader size={32} className="spinning" style={{ margin: '0 auto 12px', color: 'var(--accent-500)' }} />
              <p style={{ color: 'var(--text-muted)', fontSize: '13px', margin: 0 }}>
                AI正在分析文档内容...
              </p>
            </div>
          )}

          {noEventsFound && !isGenerating && (
            <div style={{ textAlign: 'center', padding: '20px' }}>
              <AlertCircle size={32} style={{ margin: '0 auto 12px', color: '#f59e0b' }} />
              <p style={{ color: 'var(--text-secondary, #94a3b8)', fontSize: '13px', margin: '0 0 12px' }}>
                未识别到时间相关事件
              </p>
              <p style={{ color: 'var(--text-muted, #64748b)', fontSize: '11px', margin: 0 }}>
                该文档可能不包含历史时间信息
              </p>
              <button
                onClick={() => {
                  setNoEventsFound(false);
                  setAiGeneratedEvents([]);
                }}
                style={{
                  marginTop: '12px',
                  padding: '6px 12px',
                  background: 'var(--bg-surface, #334155)',
                  border: '1px solid var(--border-color, #475569)',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  fontSize: '12px',
                  color: 'var(--text-primary, #e2e8f0)',
                }}
              >
                重新生成
              </button>
            </div>
          )}

          {aiGeneratedEvents.length > 0 && !isGenerating && (
            <>
              <div style={{ 
                display: 'flex', 
                justifyContent: 'space-between', 
                alignItems: 'center',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ fontWeight: 500, fontSize: '13px' }}>
                    识别到 {aiGeneratedEvents.length} 个事件
                  </span>
                  {selectedEvents.size > 0 && (
                    <span style={{
                      background: 'var(--accent-500)',
                      color: 'white',
                      padding: '1px 6px',
                      borderRadius: '10px',
                      fontSize: '10px',
                    }}>
                      已选 {selectedEvents.size}
                    </span>
                  )}
                </div>
                <div style={{ display: 'flex', gap: '4px' }}>
                  {selectedEvents.size > 0 && (
                    <button
                      onClick={() => setShowTagPanel(!showTagPanel)}
                      style={{
                        padding: '4px 8px',
                        background: showTagPanel ? 'var(--accent-500)' : '#f3f4f6',
                        color: showTagPanel ? 'white' : '#374151',
                        border: 'none',
                        borderRadius: '4px',
                        cursor: 'pointer',
                        fontSize: '11px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px',
                      }}
                    >
                      <Tag size={12} />
                      标签
                    </button>
                  )}
                  <button
                    onClick={toggleSelectAll}
                    style={{
                      padding: '4px 8px',
                      background: selectedEvents.size === aiGeneratedEvents.length ? '#10b981' : '#f3f4f6',
                      color: selectedEvents.size === aiGeneratedEvents.length ? 'white' : '#374151',
                      border: 'none',
                      borderRadius: '4px',
                      cursor: 'pointer',
                      fontSize: '11px',
                    }}
                  >
                    {selectedEvents.size === aiGeneratedEvents.length ? '取消' : '全选'}
                  </button>
                </div>
              </div>

              {showTagPanel && selectedEvents.size > 0 && (
                <div style={{
                  background: '#f8fafc',
                  border: '1px solid #e5e7eb',
                  borderRadius: '6px',
                  padding: '8px',
                }}>
                  <div style={{ display: 'flex', gap: '6px', marginBottom: '6px' }}>
                    <input
                      type="text"
                      value={batchTagInput}
                      onChange={(e) => setBatchTagInput(e.target.value)}
                      onKeyPress={(e) => e.key === 'Enter' && handleAddBatchTag()}
                      placeholder="添加标签"
                      style={{
                        flex: 1,
                        padding: '6px',
                        border: '1px solid #e5e7eb',
                        borderRadius: '4px',
                        fontSize: '11px',
                      }}
                    />
                    <button
                      onClick={handleAddBatchTag}
                      disabled={!batchTagInput.trim()}
                      style={{
                        padding: '6px 10px',
                        background: batchTagInput.trim() ? 'var(--accent-500)' : '#9ca3af',
                        color: 'white',
                        border: 'none',
                        borderRadius: '4px',
                        cursor: batchTagInput.trim() ? 'pointer' : 'not-allowed',
                        fontSize: '11px',
                      }}
                    >
                      <Plus size={12} />
                    </button>
                  </div>
                  {historyTags.length > 0 && (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                      {historyTags.slice(0, 6).map((tag) => (
                        <button
                          key={tag}
                          onClick={() => handleAddHistoryTagToSelected(tag)}
                          style={{
                            background: 'var(--bg-surface, #334155)',
                            color: 'var(--text-primary, #e2e8f0)',
                            border: '1px solid var(--border-color, #475569)',
                            borderRadius: '10px',
                            padding: '1px 6px',
                            fontSize: '10px',
                            cursor: 'pointer',
                          }}
                        >
                          + {tag}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}

              <div style={{
                flex: 1,
                overflowY: 'auto',
                border: '1px solid var(--border-color, #334155)',
                borderRadius: '6px',
                maxHeight: '200px',
              }}>
                {aiGeneratedEvents.map((event, index) => {
                  const eventSpecificTags = eventTags.get(index) || [];
                  const isSelected = selectedEvents.has(index);
                  
                  return (
                    <div
                      key={index}
                      onClick={(e) => handleEventClick(index, e)}
                      style={{
                        padding: '8px',
                        background: isSelected ? 'var(--primary-light, rgba(139, 92, 246, 0.2))' : 'var(--bg-surface, #1e293b)',
                        borderBottom: '1px solid var(--border-subtle, #1e293b)',
                        cursor: 'pointer',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px' }}>
                        <div style={{
                          width: '14px',
                          height: '14px',
                          borderRadius: '3px',
                          border: isSelected ? '2px solid var(--accent-500)' : '2px solid #d1d5db',
                          background: isSelected ? 'var(--accent-500)' : 'transparent',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          flexShrink: 0,
                        }}>
                          {isSelected && <Check size={10} style={{ color: 'white' }} />}
                        </div>
                        <span style={{ fontWeight: 500, fontSize: '12px', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {event.event_title}
                        </span>
                      </div>
                      <div style={{ fontSize: '11px', color: 'var(--text-secondary, #94a3b8)', marginLeft: '20px', marginBottom: '4px' }}>
                        {event.event_description.slice(0, 60)}{event.event_description.length > 60 ? '...' : ''}
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginLeft: '20px' }}>
                        <span style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '10px', color: 'var(--text-muted, #64748b)' }}>
                          <Calendar size={10} />
                          {event.event_date_display}
                        </span>
                        {eventSpecificTags.length > 0 && (
                          <div style={{ display: 'flex', gap: '2px' }}>
                            {eventSpecificTags.slice(0, 2).map((tag, tagIndex) => (
                              <span
                                key={tagIndex}
                                style={{
                                  fontSize: '9px',
                                  padding: '1px 4px',
                                  background: 'var(--accent-500)',
                                  color: 'white',
                                  borderRadius: '6px',
                                }}
                              >
                                {tag}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              <button
                onClick={handleSaveSelected}
                disabled={selectedEvents.size === 0 || isSaving}
                style={{
                  padding: '10px 16px',
                  background: selectedEvents.size === 0 || isSaving ? '#9ca3af' : '#10b981',
                  color: 'white',
                  border: 'none',
                  borderRadius: '8px',
                  cursor: selectedEvents.size === 0 || isSaving ? 'not-allowed' : 'pointer',
                  fontSize: '13px',
                  fontWeight: 500,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '6px',
                  width: '100%',
                }}
              >
                <Save size={16} />
                {isSaving ? '保存中...' : `保存选中的 ${selectedEvents.size} 个事件`}
              </button>
            </>
          )}
        </div>
      )}

      {isMinimized && (
        <div style={{ padding: '8px 12px', fontSize: '12px', color: 'var(--text-muted)' }}>
          {isGenerating ? (
            <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Loader size={12} className="spinning" />
              生成中...
            </span>
          ) : aiGeneratedEvents.length > 0 ? (
            <span>识别到 {aiGeneratedEvents.length} 个事件，已选 {selectedEvents.size} 个</span>
          ) : noEventsFound ? (
            <span style={{ color: '#f59e0b' }}>未识别到时间事件</span>
          ) : (
            <span>点击开始生成</span>
          )}
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

export default DraggableTimelineWindow;
