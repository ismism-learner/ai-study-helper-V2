import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Sparkles, Calendar, Check, Save, X, Tag, Plus, ChevronDown, ChevronUp, Search } from 'lucide-react';
import { worldTimelineApi } from '../api';

interface TimelineNoteParseResult {
  event_date: string;
  event_date_display: string;
  event_title: string;
  event_description: string;
}

interface AITimelineNotesModalProps {
  isOpen: boolean;
  onClose: () => void;
  documentId: string;
  onSuccess: () => void;
}

const AITimelineNotesModal: React.FC<AITimelineNotesModalProps> = ({
  isOpen,
  onClose,
  documentId,
  onSuccess,
}) => {
  const [customPrompt, setCustomPrompt] = useState('');
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState('');
  const [historyTags, setHistoryTags] = useState<string[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [aiGeneratedEvents, setAiGeneratedEvents] = useState<TimelineNoteParseResult[]>([]);
  const [selectedEvents, setSelectedEvents] = useState<Set<number>>(new Set());
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [lastSelectedIndex, setLastSelectedIndex] = useState<number | null>(null);
  const [eventTags, setEventTags] = useState<Map<number, string[]>>(new Map());
  const [showTagPanel, setShowTagPanel] = useState(false);
  const [batchTagInput, setBatchTagInput] = useState('');
  const [tagFeedback, setTagFeedback] = useState<string | null>(null);
  const eventListRef = useRef<HTMLDivElement>(null);
  const [historyTagDropdownOpen, setHistoryTagDropdownOpen] = useState(false);
  const [historyTagSearchQuery, setHistoryTagSearchQuery] = useState('');
  const historyTagDropdownRef = useRef<HTMLDivElement>(null);
  const tagFeedbackTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (tagFeedbackTimeoutRef.current) {
        clearTimeout(tagFeedbackTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (isOpen) {
      loadHistoryTags();
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

  const filteredHistoryTags = useMemo(() => {
    if (!historyTagSearchQuery.trim()) {
      return historyTags;
    }
    const query = historyTagSearchQuery.toLowerCase();
    return historyTags.filter(tag => tag.toLowerCase().includes(query));
  }, [historyTags, historyTagSearchQuery]);

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
    setSaveError(null);
    setSelectedEvents(new Set());
    setEventTags(new Map());
    
    try {
      const response = await worldTimelineApi.aiGenerateTimelineNotes(documentId, customPrompt);
      
      setAiGeneratedEvents(response.data.parsed_events);
    } catch (error) {
      console.error('Failed to generate timeline notes:', error);
      setSaveError(error instanceof Error ? error.message : '生成失败');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleSaveSelected = async () => {
    if (aiGeneratedEvents.length === 0) return;
    
    setIsSaving(true);
    setSaveError(null);
    
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
    } catch (error) {
      console.error('Failed to save timeline notes:', error);
      setSaveError(error instanceof Error ? error.message : '保存失败');
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
    if (tagFeedbackTimeoutRef.current) {
      clearTimeout(tagFeedbackTimeoutRef.current);
    }
    tagFeedbackTimeoutRef.current = setTimeout(() => setTagFeedback(null), 2000);
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
    if (tagFeedbackTimeoutRef.current) {
      clearTimeout(tagFeedbackTimeoutRef.current);
    }
    tagFeedbackTimeoutRef.current = setTimeout(() => setTagFeedback(null), 2000);
  };

  const removeEventTag = (eventIndex: number, tag: string) => {
    const newEventTags = new Map(eventTags);
    const currentTags = newEventTags.get(eventIndex) || [];
    newEventTags.set(eventIndex, currentTags.filter(t => t !== tag));
    setEventTags(newEventTags);
  };

  if (!isOpen) return null;

  return (
    <div className="ai-timeline-notes-modal-overlay" style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      background: 'rgba(0, 0, 0, 0.5)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 1000,
    }}>
      <div className="ai-timeline-notes-modal" style={{
        background: 'var(--bg-elevated, #1e293b)',
        borderRadius: '12px',
        width: '90%',
        maxWidth: '900px',
        maxHeight: '90vh',
        display: 'flex',
        flexDirection: 'column',
        boxShadow: '0 4px 20px rgba(0, 0, 0, 0.4)',
        color: 'var(--text-primary, #e2e8f0)',
      }}>
        <div className="modal-header" style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '16px 20px',
          borderBottom: '1px solid var(--border-color, #334155)',
        }}>
          <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text-primary, #e2e8f0)' }}>
            <Sparkles size={20} style={{ color: 'var(--accent-500)' }} />
            AI生成时间笔记
          </h3>
          <button 
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              padding: '4px',
              borderRadius: '4px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--text-muted, #94a3b8)',
            }}
          >
            <X size={20} />
          </button>
        </div>

        {saveError && (
          <div style={{
            background: '#fef2f2',
            color: '#dc2626',
            padding: '12px 16px',
            borderRadius: '8px',
            margin: '0 20px 16px',
            fontSize: '14px',
          }}>
            {saveError}
          </div>
        )}

        {tagFeedback && (
          <div style={{
            background: '#ecfdf5',
            color: '#059669',
            padding: '12px 16px',
            borderRadius: '8px',
            margin: '0 20px 16px',
            fontSize: '14px',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
          }}>
            <Check size={16} />
            {tagFeedback}
          </div>
        )}

        <div className="modal-body" style={{ flex: 1, overflow: 'auto', padding: '0 20px' }}>
          <div className="prompt-section" style={{ marginBottom: '20px' }}>
            <label style={{ display: 'block', marginBottom: '8px', fontWeight: 500, fontSize: '14px' }}>
              自定义提示词（可选）
            </label>
            <textarea
              value={customPrompt}
              onChange={(e) => setCustomPrompt(e.target.value)}
              placeholder="留空使用默认提示词"
              rows={3}
              style={{
                width: '100%',
                padding: '10px',
                border: '1px solid #e5e7eb',
                borderRadius: '6px',
                fontSize: '14px',
                resize: 'vertical',
              }}
            />
          </div>

          <div className="tags-section" style={{ marginBottom: '20px' }}>
            <label style={{ display: 'block', marginBottom: '8px', fontWeight: 500, fontSize: '14px' }}>
              默认标签（保存时添加到所有事件）
            </label>
            <div style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
              <input
                type="text"
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && handleAddTag()}
                placeholder="输入标签后按回车添加"
                style={{
                  flex: 1,
                  padding: '8px',
                  border: '1px solid #e5e7eb',
                  borderRadius: '4px',
                  fontSize: '14px',
                }}
              />
              <button
                onClick={handleAddTag}
                style={{
                  padding: '8px 16px',
                  background: 'var(--primary-500)',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  fontSize: '14px',
                }}
              >
                添加
              </button>
            </div>
            {selectedTags.length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                {selectedTags.map((tag, index) => (
                  <span key={index} style={{
                    background: '#e0e7ff',
                    padding: '4px 10px',
                    borderRadius: '12px',
                    fontSize: '13px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                  }}>
                    {tag}
                    <button
                      onClick={() => handleRemoveTag(tag)}
                      style={{
                        background: 'none',
                        border: 'none',
                        cursor: 'pointer',
                        fontSize: '14px',
                        lineHeight: '1',
                        padding: '0 2px',
                      }}
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
            )}
            {historyTags.length > 0 && (
              <div style={{ marginTop: '12px' }} ref={historyTagDropdownRef}>
                <label style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '6px', display: 'block' }}>
                  历史标签（点击快速添加）
                </label>
                <div style={{ position: 'relative' }}>
                  <button
                    onClick={() => setHistoryTagDropdownOpen(!historyTagDropdownOpen)}
                    style={{
                      width: '100%',
                      padding: '10px 14px',
                      background: historyTagDropdownOpen ? '#f8fafc' : 'white',
                      border: '1px solid #e5e7eb',
                      borderRadius: '6px',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      fontSize: '13px',
                      color: '#374151',
                      transition: 'all 0.2s ease'
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <Tag size={14} style={{ color: 'var(--accent-500)' }} />
                      <span>全部历史标签 ({historyTags.length})</span>
                    </div>
                    {historyTagDropdownOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                  </button>

                  {historyTagDropdownOpen && (
                    <div style={{
                      position: 'absolute',
                      top: '100%',
                      left: 0,
                      right: 0,
                      marginTop: '4px',
                      background: 'var(--bg-elevated, #1e293b)',
                      border: '1px solid var(--border-color, #334155)',
                      borderRadius: '8px',
                      boxShadow: '0 4px 12px rgba(0, 0, 0, 0.3)',
                      zIndex: 100,
                      maxHeight: '300px',
                      display: 'flex',
                      flexDirection: 'column'
                    }}>
                      <div style={{
                        padding: '10px 12px',
                        borderBottom: '1px solid var(--border-color, #334155)',
                        position: 'sticky',
                        top: 0,
                        background: 'var(--bg-elevated, #1e293b)',
                        borderRadius: '8px 8px 0 0'
                      }}>
                        <div style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '8px',
                          padding: '8px 12px',
                          background: 'var(--bg-surface, #0f172a)',
                          borderRadius: '6px'
                        }}>
                          <Search size={14} style={{ color: 'var(--text-muted, #94a3b8)' }} />
                          <input
                            type="text"
                            placeholder="搜索历史标签..."
                            value={historyTagSearchQuery}
                            onChange={(e) => setHistoryTagSearchQuery(e.target.value)}
                            style={{
                              border: 'none',
                              background: 'transparent',
                              outline: 'none',
                              flex: 1,
                              fontSize: '13px',
                              color: 'var(--text-primary, #e2e8f0)'
                            }}
                          />
                          {historyTagSearchQuery && (
<button
                               onClick={() => setHistoryTagSearchQuery('')}
                               style={{
                                 background: 'none',
                                 border: 'none',
                                 padding: 0,
                                 cursor: 'pointer',
                                 color: 'var(--text-muted)'
                               }}
                             >
                              <X size={14} />
                            </button>
                          )}
                        </div>
                      </div>

                      <div style={{
                        flex: 1,
                        overflowY: 'auto',
                        padding: '8px'
                      }}>
                        {filteredHistoryTags.length === 0 ? (
<div style={{
                             textAlign: 'center',
                             padding: '20px',
                             color: 'var(--text-muted)',
                             fontSize: '13px'
                           }}>
                            {historyTagSearchQuery ? '没有找到匹配的标签' : '暂无历史标签'}
                          </div>
                        ) : (
                          <div style={{
                            display: 'grid',
                            gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))',
                            gap: '6px'
                          }}>
                            {filteredHistoryTags.map(tag => {
                              const isSelected = selectedTags.includes(tag);
                              return (
                                <button
                                  key={tag}
                                  onClick={() => {
                                    if (!isSelected) {
                                      setSelectedTags([...selectedTags, tag]);
                                    }
                                  }}
                                  style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '6px',
                                    padding: '8px 10px',
                                    background: isSelected ? 'var(--accent-500)' : 'white',
                                    border: '1px solid ' + (isSelected ? 'var(--accent-600)' : '#e5e7eb'),
                                    borderRadius: '6px',
                                    cursor: isSelected ? 'default' : 'pointer',
                                    fontSize: '12px',
                                    color: isSelected ? 'white' : '#374151',
                                    transition: 'all 0.15s ease',
                                    whiteSpace: 'nowrap',
                                    overflow: 'hidden',
                                    textOverflow: 'ellipsis'
                                  }}
                                >
                                  <Tag size={12} />
                                  <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis' }}>{tag}</span>
                                  {isSelected && (
                                    <span style={{ fontSize: '10px' }}>✓</span>
                                  )}
                                </button>
                              );
                            })}
                          </div>
                        )}
                      </div>

                      {selectedTags.length > 0 && (
                        <div style={{
                          padding: '10px 12px',
                          borderTop: '1px solid #e5e7eb',
                          background: '#f8fafc',
                          borderRadius: '0 0 8px 8px'
                        }}>
                          <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '6px' }}>
                            已选择的标签:
                          </div>
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                            {selectedTags.map(tag => (
                              <span
                                key={tag}
                                style={{
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '4px',
                                  padding: '3px 8px',
                                  background: 'var(--accent-500)',
                                  color: 'white',
                                  borderRadius: '12px',
                                  fontSize: '11px'
                                }}
                              >
                                {tag}
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleRemoveTag(tag);
                                  }}
                                  style={{
                                    background: 'none',
                                    border: 'none',
                                    padding: 0,
                                    cursor: 'pointer',
                                    color: 'white',
                                    display: 'flex',
                                    alignItems: 'center'
                                  }}
                                >
                                  <X size={10} />
                                </button>
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          <div className="generate-section" style={{ marginBottom: '20px' }}>
            <button
              onClick={handleGenerate}
              disabled={isGenerating}
              style={{
                padding: '12px 24px',
                background: isGenerating ? 'var(--text-muted)' : 'var(--accent-500)',
                color: 'white',
                border: 'none',
                borderRadius: '8px',
                cursor: isGenerating ? 'not-allowed' : 'pointer',
                fontSize: '15px',
                fontWeight: 500,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
                width: '100%',
              }}
            >
              <Sparkles size={18} />
              {isGenerating ? '正在生成时间笔记...' : 'AI生成时间笔记'}
            </button>
          </div>

          {isGenerating && (
            <div style={{ textAlign: 'center', padding: '20px' }}>
              <div style={{
                width: '40px',
                height: '40px',
                border: '3px solid var(--border-default)',
                borderTopColor: 'var(--accent-500)',
                borderRadius: '50%',
                animation: 'spin 1s linear infinite',
                margin: '0 auto 12px',
              }} />
              <p style={{ color: 'var(--text-muted)', fontSize: '14px', margin: 0 }}>
                AI正在分析文档内容，提取时间事件...
              </p>
              <p style={{ color: 'var(--text-muted)', fontSize: '12px', margin: '4px 0 0 0' }}>
                这可能需要几秒钟到一分钟
              </p>
            </div>
          )}

          {!isGenerating && aiGeneratedEvents.length > 0 && (
            <div className="results-section">
              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: '16px',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <h4 style={{ margin: 0, fontSize: '15px', fontWeight: 600 }}>
                    识别到 {aiGeneratedEvents.length} 个时间事件
                  </h4>
                  {selectedEvents.size > 0 && (
                    <span style={{
                      background: 'var(--accent-500)',
                      color: 'white',
                      padding: '2px 8px',
                      borderRadius: '12px',
                      fontSize: '12px',
                    }}>
                      已选 {selectedEvents.size} 个
                    </span>
                  )}
                </div>
                <div style={{ display: 'flex', gap: '8px' }}>
                  {selectedEvents.size > 0 && (
                    <button
                      onClick={() => setShowTagPanel(!showTagPanel)}
                      style={{
                        padding: '6px 12px',
                        background: showTagPanel ? 'var(--accent-500)' : 'var(--bg-hover)',
                        color: showTagPanel ? 'white' : '#374151',
                        border: 'none',
                        borderRadius: '4px',
                        cursor: 'pointer',
                        fontSize: '13px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px',
                      }}
                    >
                      <Tag size={14} />
                      批量标签
                    </button>
                  )}
                  <button
                    onClick={toggleSelectAll}
                    style={{
                      padding: '6px 12px',
                      background: selectedEvents.size === aiGeneratedEvents.length ? 'var(--success-500)' : 'var(--bg-hover)',
                      color: selectedEvents.size === aiGeneratedEvents.length ? 'white' : '#374151',
                      border: 'none',
                      borderRadius: '4px',
                      cursor: 'pointer',
                      fontSize: '13px',
                    }}
                  >
                    {selectedEvents.size === aiGeneratedEvents.length ? '取消全选' : '全选'}
                  </button>
                </div>
              </div>

              <div style={{ marginBottom: '8px', fontSize: '12px', color: 'var(--text-muted)' }}>
                提示：按住 Shift 键点击可选择多个连续事件
              </div>

              {showTagPanel && selectedEvents.size > 0 && (
                <div style={{
                  background: '#f8fafc',
                  border: '1px solid #e5e7eb',
                  borderRadius: '8px',
                  padding: '12px',
                  marginBottom: '12px',
                }}>
                  <div style={{ 
                    fontWeight: 500, 
                    fontSize: '13px', 
                    marginBottom: '8px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                  }}>
                    <Tag size={14} />
                    为选中的 {selectedEvents.size} 个事件添加标签
                  </div>
                  <div style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
                    <input
                      type="text"
                      value={batchTagInput}
                      onChange={(e) => setBatchTagInput(e.target.value)}
                      onKeyPress={(e) => e.key === 'Enter' && handleAddBatchTag()}
                      placeholder="输入标签后按回车或点击添加"
                      style={{
                        flex: 1,
                        padding: '8px',
                        border: '1px solid #e5e7eb',
                        borderRadius: '4px',
                        fontSize: '14px',
                      }}
                    />
                    <button
                      onClick={handleAddBatchTag}
                      disabled={!batchTagInput.trim()}
                      style={{
                        padding: '8px 16px',
                        background: batchTagInput.trim() ? 'var(--accent-500)' : 'var(--text-muted)',
                        color: 'white',
                        border: 'none',
                        borderRadius: '4px',
                        cursor: batchTagInput.trim() ? 'pointer' : 'not-allowed',
                        fontSize: '14px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px',
                      }}
                    >
                      <Plus size={14} />
                      添加
                    </button>
                  </div>
                  {historyTags.length > 0 && (
                    <div>
                      <label style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '4px', display: 'block' }}>
                        快速选择历史标签：
                      </label>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                        {historyTags.slice(0, 8).map((tag) => (
                          <button
                            key={tag}
                            onClick={() => handleAddHistoryTagToSelected(tag)}
                            style={{
                              background: '#fff',
                              color: '#374151',
                              border: '1px solid #d1d5db',
                              borderRadius: '12px',
                              padding: '2px 8px',
                              fontSize: '11px',
                              cursor: 'pointer',
                            }}
                          >
                            + {tag}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              <div 
                ref={eventListRef}
                className="events-list" 
                style={{
                  maxHeight: '350px',
                  overflowY: 'auto',
                  border: '1px solid #e5e7eb',
                  borderRadius: '8px',
                }}
              >
                {aiGeneratedEvents.map((event, index) => {
                  const eventSpecificTags = eventTags.get(index) || [];
                  const isSelected = selectedEvents.has(index);
                  
                  return (
                    <div
                      key={index}
                      onClick={(e) => handleEventClick(index, e)}
                      style={{
                        padding: '12px',
                        background: isSelected ? 'var(--bg-hover)' : 'var(--bg-surface)',
                        border: isSelected ? '2px solid var(--accent-500)' : '1px solid transparent',
                        borderBottom: '1px solid var(--border-subtle)',
                        cursor: 'pointer',
                        transition: 'all 0.15s ease',
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '4px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: 1 }}>
<div style={{
                             width: '18px',
                             height: '18px',
                             borderRadius: '4px',
                             border: isSelected ? '2px solid var(--accent-500)' : '2px solid var(--border-default)',
                             background: isSelected ? 'var(--accent-500)' : 'transparent',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            flexShrink: 0,
                          }}>
                            {isSelected && <Check size={12} style={{ color: 'white' }} />}
                          </div>
                          <span style={{ fontWeight: 500, fontSize: '14px', color: isSelected ? 'var(--text-primary)' : 'var(--text-secondary)' }}>
                            {event.event_title}
                          </span>
                        </div>
                      </div>
                      <div style={{ fontSize: '13px', color: 'var(--text-muted)', marginBottom: '6px', marginLeft: '26px' }}>
                        {event.event_description}
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginLeft: '26px' }}>
                        <span style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '12px', color: 'var(--text-muted)' }}>
                          <Calendar size={12} />
                          {event.event_date_display}
                        </span>
                        {(eventSpecificTags.length > 0 || (selectedTags.length > 0 && eventSpecificTags.length === 0)) && (
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                            {(eventSpecificTags.length > 0 ? eventSpecificTags : selectedTags).map((tag, tagIndex) => (
                              <span 
                                key={tagIndex} 
                                style={{
                                  fontSize: '10px',
                                  padding: '1px 6px',
                                  background: eventSpecificTags.length > 0 ? 'var(--accent-500)' : 'var(--border-subtle)',
                                  color: eventSpecificTags.length > 0 ? 'white' : 'var(--text-secondary)',
                                  borderRadius: '8px',
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: '2px',
                                }}
                              >
                                <Tag size={8} />
                                {tag}
                                {eventSpecificTags.length > 0 && (
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      removeEventTag(index, tag);
                                    }}
                                    style={{
                                      background: 'none',
                                      border: 'none',
                                      color: 'white',
                                      cursor: 'pointer',
                                      padding: '0 0 0 2px',
                                      fontSize: '10px',
                                      lineHeight: '1',
                                    }}
                                  >
                                    ×
                                  </button>
                                )}
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
                  padding: '12px 24px',
                  background: selectedEvents.size === 0 || isSaving ? 'var(--text-muted)' : 'var(--success-500)',
                  color: 'white',
                  border: 'none',
                  borderRadius: '8px',
                  cursor: selectedEvents.size === 0 || isSaving ? 'not-allowed' : 'pointer',
                  fontSize: '15px',
                  fontWeight: 500,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px',
                  width: '100%',
                  marginTop: '16px',
                }}
              >
                <Save size={18} />
                {isSaving ? '保存中...' : `保存选中的 ${selectedEvents.size} 个事件`}
              </button>
            </div>
          )}
        </div>

        <div className="modal-footer" style={{
          display: 'flex',
          justifyContent: 'flex-end',
          gap: '12px',
          padding: '16px 20px',
          borderTop: '1px solid #e5e7eb',
        }}>
          <button
            onClick={onClose}
            style={{
              padding: '10px 20px',
              background: '#f3f4f6',
              color: '#374151',
              border: '1px solid #d1d5db',
              borderRadius: '6px',
              cursor: 'pointer',
              fontSize: '14px',
            }}
          >
            取消
          </button>
        </div>
      </div>
    </div>
  );
};

export default AITimelineNotesModal;
