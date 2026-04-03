import React, { useState, useEffect } from 'react';
import { Calendar, Save, X, Plus, Edit3, Sparkles, ChevronUp, ChevronDown } from 'lucide-react';
import { worldTimelineApi, optimizeApi } from '../api';
import { WorldTimelineEvent, UpdateTimelineEventRequest } from '../types';

interface TimelineNoteModalProps {
  isOpen: boolean;
  onClose: () => void;
  onEventAdded: () => void;
  onEventUpdated: () => void;
  selectedEvent?: WorldTimelineEvent | null;
  documentId?: string;
  currentPage?: number;
}

const TimelineNoteModal: React.FC<TimelineNoteModalProps> = ({
  isOpen,
  onClose,
  onEventAdded,
  onEventUpdated,
  selectedEvent = null,
  documentId,
  currentPage = 1,
}) => {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [year, setYear] = useState(new Date().getFullYear());
  const [month, setMonth] = useState<number | null>(null);
  const [day, setDay] = useState<number | null>(null);
  const [pageNumber, setPageNumber] = useState(currentPage);
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [historyTags, setHistoryTags] = useState<string[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generateError, setGenerateError] = useState<string | null>(null);
  const [showTagDropdown, setShowTagDropdown] = useState(false);

  // 实时更新页码
  useEffect(() => {
    if (!selectedEvent) {
      console.log('[TimelineNoteModal] Updating pageNumber to', currentPage);
      setPageNumber(currentPage);
    }
  }, [currentPage, selectedEvent]);

  // 加载历史标签
  useEffect(() => {
    loadHistoryTags();
  }, []);

  const loadHistoryTags = async () => {
    try {
      const response = await worldTimelineApi.getTimelineTagsHistory();
      setHistoryTags(response.data.tags || []);
    } catch (error) {
      console.error('Failed to load history tags:', error);
    }
  };

  useEffect(() => {
    if (selectedEvent) {
      setTitle(selectedEvent.event_title || '');
      setDescription(selectedEvent.event_description || '');
      setYear(parseInt(selectedEvent.event_date) || new Date().getFullYear());
      setPageNumber(selectedEvent.page_number || 1);
      setTags(selectedEvent.tags || []);

      // 从event_date_display解析月份和日期
      if (selectedEvent.event_date_display) {
        const dateParts = selectedEvent.event_date_display.split('-');
        if (dateParts.length >= 2) {
          const parsedMonth = parseInt(dateParts[1]);
          setMonth(isNaN(parsedMonth) ? null : parsedMonth);
        } else {
          setMonth(null);
        }
        if (dateParts.length >= 3) {
          const parsedDay = parseInt(dateParts[2]);
          setDay(isNaN(parsedDay) ? null : parsedDay);
        } else {
          setDay(null);
        }
      } else {
        setMonth(null);
        setDay(null);
      }
    } else {
      setTitle('');
      setDescription('');
      setYear(new Date().getFullYear());
      setMonth(null);
      setDay(null);
      // 不在这里设置 pageNumber，由第一个 useEffect 处理
      setTags([]);
    }
    setError('');
  }, [selectedEvent, isOpen]);

  const handleAddTag = () => {
    if (tagInput.trim() && !tags.includes(tagInput.trim())) {
      setTags([...tags, tagInput.trim()]);
      setTagInput('');
    }
  };

  const handleRemoveTag = (tag: string) => {
    setTags(tags.filter(t => t !== tag));
  };

  const handleSubmit = async () => {
    if (!title.trim()) {
      setError('请输入事件标题');
      return;
    }

    if (!year) {
      setError('请输入年份');
      return;
    }

    setIsLoading(true);
    setError('');

    // 生成event_date_display - 年必填，月日可选
    let eventDateDisplay = year.toString();
    if (month && month >= 1 && month <= 12) {
      eventDateDisplay += `-${month.toString().padStart(2, '0')}`;
      if (day && day >= 1 && day <= 31) {
        eventDateDisplay += `-${day.toString().padStart(2, '0')}`;
      }
    }

    try {
      if (selectedEvent) {
        // 更新现有事件
        // 检查是 WorldTimelineEvent 还是 DocumentTimelineEvent
        // 通过检查是否有 document_id 字段来区分
        const isDocumentEvent = 'document_id' in selectedEvent;
        
        if (isDocumentEvent) {
          // DocumentTimelineEvent
          const updateData = {
            event_title: title,
            event_description: description,
            event_date: year.toString(),
            event_date_display: eventDateDisplay,
            tags: tags,
          };
          await worldTimelineApi.updateDocumentDirectTimelineEvent(selectedEvent.id, updateData);
        } else {
          // WorldTimelineEvent
          const updateData: UpdateTimelineEventRequest = {
            event_title: title,
            event_description: description,
            event_date: year.toString(),
            event_date_display: eventDateDisplay,
            page_number: pageNumber,
            tags: tags,
          };
          await worldTimelineApi.updateTimelineEvent(selectedEvent.id, updateData);
        }
        onEventUpdated();
      } else {
        // 创建新事件
        if (!documentId) {
          setError('缺少文档ID');
          setIsLoading(false);
          return;
        }

        const createData = {
          event_title: title,
          event_description: description,
          event_date: year.toString(),
          event_date_display: eventDateDisplay,
          tags: tags,
        };

        // 使用直接关联到文档的时间笔记 API 创建事件
        await worldTimelineApi.createDocumentDirectTimelineEvent(documentId, createData);
        onEventAdded();
      }
      onClose();
    } catch (error) {
      console.error('Failed to save timeline event:', error);
      setError('保存事件失败，请重试');
    } finally {
      setIsLoading(false);
    }
  };

  const handleGenerateNote = async () => {
    if (!description || !description.trim()) {
      setGenerateError('请先输入事件描述');
      return;
    }

    setIsGenerating(true);
    setGenerateError(null);

    try {
      const response = await optimizeApi.generateNote(description);
      const { title: generatedTitle, content: generatedContent } = response.data;
      
      setTitle(generatedTitle);
      setDescription(generatedContent);
    } catch (error: any) {
      console.error('Failed to generate note:', error);
      setGenerateError(error.response?.data?.detail || '生成笔记失败，请重试');
    } finally {
      setIsGenerating(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="timeline-note-modal-overlay" style={{
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
      <div className="timeline-note-modal" style={{
        background: 'rgba(30, 41, 59, 0.95)',
        backdropFilter: 'blur(12px)',
        borderRadius: '12px',
        padding: '24px',
        width: '90%',
        maxWidth: '500px',
        maxHeight: '80vh',
        overflowY: 'auto',
        boxShadow: '0 8px 32px rgba(0, 0, 0, 0.4)',
        border: '1px solid rgba(255, 255, 255, 0.1)',
        color: '#e2e8f0',
      }}>
        <div className="modal-header" style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '20px',
        }}>
          <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '8px', color: '#e2e8f0' }}>
            {selectedEvent ? (
              <>
                <Edit3 size={20} />
                编辑时间笔记
              </>
            ) : (
              <>
                <Plus size={20} />
                添加时间笔记
              </>
            )}
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
            }}
          >
            <X size={20} />
          </button>
        </div>

        {error && (
          <div style={{
            background: '#f8d7da',
            color: '#721c24',
            padding: '10px',
            borderRadius: '4px',
            marginBottom: '16px',
            fontSize: '14px',
          }}>
            {error}
          </div>
        )}

        <div className="form-group" style={{ marginBottom: '16px' }}>
          <label style={{ display: 'block', marginBottom: '6px', fontWeight: '500', color: '#cbd5e1' }}>
            事件标题 *
          </label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="请输入事件标题"
            style={{
              width: '100%',
              padding: '10px',
              border: '1px solid rgba(255, 255, 255, 0.2)',
              borderRadius: '6px',
              fontSize: '14px',
              background: 'rgba(255, 255, 255, 0.1)',
              color: '#e2e8f0',
            }}
          />
        </div>

        <div className="form-group" style={{ marginBottom: '16px' }}>
          <label style={{ display: 'block', marginBottom: '6px', fontWeight: '500', color: '#cbd5e1' }}>
            事件描述
          </label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="请输入事件描述（可使用语音输入）"
            rows={4}
            style={{
              width: '100%',
              padding: '10px',
              border: '1px solid rgba(255, 255, 255, 0.2)',
              borderRadius: '6px',
              fontSize: '14px',
              resize: 'vertical',
              background: 'rgba(255, 255, 255, 0.1)',
              color: '#e2e8f0',
            }}
          />
          <button
            type="button"
            onClick={handleGenerateNote}
            disabled={isGenerating || !description || !description.trim()}
            style={{
              marginTop: '8px',
              padding: '8px 16px',
              background: isGenerating ? '#9ca3af' : '#8b5cf6',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: isGenerating ? 'not-allowed' : 'pointer',
              fontSize: '13px',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              width: '100%',
              justifyContent: 'center'
            }}
          >
            <Sparkles size={14} />
            {isGenerating ? 'AI 生成中...' : 'AI 一键生成'}
          </button>
          {generateError && (
            <div style={{
              marginTop: '8px',
              padding: '8px',
              background: '#fee',
              border: '1px solid #fcc',
              borderRadius: '4px',
              fontSize: '12px',
              color: '#c33'
            }}>
              {generateError}
            </div>
          )}
        </div>

        <div className="form-group" style={{ marginBottom: '16px' }}>
          <label style={{ marginBottom: '6px', fontWeight: '500', display: 'flex', alignItems: 'center', gap: '4px', color: '#cbd5e1' }}>
            <Calendar size={16} />
            日期 *
          </label>
          <div style={{ display: 'flex', gap: '8px' }}>
            <input
              type="number"
              value={year}
              onChange={(e) => setYear(parseInt(e.target.value) || 0)}
              placeholder="年"
              style={{
                flex: 1,
                padding: '8px',
                border: '1px solid rgba(255, 255, 255, 0.2)',
                borderRadius: '6px',
                fontSize: '14px',
                background: 'rgba(255, 255, 255, 0.1)',
                color: '#e2e8f0',
              }}
            />
            <input
              type="number"
              value={month ?? ''}
              onChange={(e) => {
                const val = e.target.value;
                setMonth(val === '' ? null : parseInt(val));
              }}
              placeholder="月（可选）"
              min={1}
              max={12}
              style={{
                flex: 1,
                padding: '8px',
                border: '1px solid rgba(255, 255, 255, 0.2)',
                borderRadius: '6px',
                fontSize: '14px',
                background: 'rgba(255, 255, 255, 0.1)',
                color: '#e2e8f0',
              }}
            />
            <input
              type="number"
              value={day ?? ''}
              onChange={(e) => {
                const val = e.target.value;
                setDay(val === '' ? null : parseInt(val));
              }}
              placeholder="日（可选）"
              min={1}
              max={31}
              style={{
                flex: 1,
                padding: '8px',
                border: '1px solid rgba(255, 255, 255, 0.2)',
                borderRadius: '6px',
                fontSize: '14px',
                background: 'rgba(255, 255, 255, 0.1)',
                color: '#e2e8f0',
              }}
            />
          </div>
        </div>

        <div className="form-group" style={{ marginBottom: '16px' }}>
          <label style={{ display: 'block', marginBottom: '6px', fontWeight: '500', color: '#cbd5e1' }}>
            页码
          </label>
          <input
            type="number"
            value={pageNumber}
            onChange={(e) => setPageNumber(parseInt(e.target.value) || 1)}
            placeholder="页码"
            min={1}
            style={{
              width: '100%',
              padding: '10px',
              border: '1px solid rgba(255, 255, 255, 0.2)',
              borderRadius: '6px',
              fontSize: '14px',
              background: 'rgba(255, 255, 255, 0.1)',
              color: '#e2e8f0',
            }}
          />
        </div>

        <div className="form-group" style={{ marginBottom: '20px' }}>
          <label style={{ display: 'block', marginBottom: '6px', fontWeight: '500', color: '#cbd5e1' }}>
            标签
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
                border: '1px solid rgba(255, 255, 255, 0.2)',
                borderRadius: '6px',
                fontSize: '14px',
                background: 'rgba(255, 255, 255, 0.1)',
                color: '#e2e8f0',
              }}
            />
            <button
              onClick={handleAddTag}
              style={{
                padding: '8px 16px',
                background: '#8b5cf6',
                color: 'white',
                border: 'none',
                borderRadius: '6px',
                cursor: 'pointer',
                fontSize: '14px',
              }}
            >
              添加
            </button>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
            {tags.map((tag, index) => (
              <span key={index} style={{
                background: 'rgba(139, 92, 246, 0.3)',
                padding: '4px 8px',
                borderRadius: '12px',
                fontSize: '12px',
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
                color: '#e2e8f0',
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
                    color: '#e2e8f0',
                  }}
                >
                  ×
                </button>
              </span>
            ))}
          </div>
          {historyTags.length > 0 && (
            <div style={{ marginTop: '8px' }}>
              <button
                type="button"
                onClick={() => setShowTagDropdown(!showTagDropdown)}
                style={{
                  width: '100%',
                  padding: '6px 10px',
                  background: '#f3f4f6',
                  border: '1px solid #d1d5db',
                  borderRadius: '4px',
                  fontSize: '12px',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  color: '#374151'
                }}
              >
                <span>快速选择历史标签 ({historyTags.length}个可用)</span>
                {showTagDropdown ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
              </button>
              {showTagDropdown && (
                <div style={{
                  marginTop: '4px',
                  padding: '8px',
                  background: '#fff',
                  border: '1px solid #d1d5db',
                  borderRadius: '4px',
                  maxHeight: '200px',
                  overflowY: 'auto'
                }}>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                    {historyTags.map((tag) => {
                      const isAdded = tags.includes(tag);
                      
                      return (
                        <button
                          key={tag}
                          type="button"
                          onClick={() => {
                            if (isAdded) {
                              handleRemoveTag(tag);
                            } else {
                              setTags([...tags, tag]);
                            }
                          }}
                          style={{
                            background: isAdded ? '#8b5cf6' : '#fff',
                            color: isAdded ? 'white' : '#374151',
                            border: '1px solid #d1d5db',
                            borderRadius: '12px',
                            padding: '2px 8px',
                            fontSize: '11px',
                            cursor: 'pointer',
                            transition: 'all 0.15s'
                          }}
                        >
                          {isAdded ? '✓ ' : '+ '}{tag}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="modal-footer" style={{
          display: 'flex',
          justifyContent: 'flex-end',
          gap: '12px',
          marginTop: '24px',
        }}>
          <button
            onClick={onClose}
            style={{
              padding: '10px 20px',
              background: 'rgba(255, 255, 255, 0.1)',
              color: '#e2e8f0',
              border: '1px solid rgba(255, 255, 255, 0.2)',
              borderRadius: '6px',
              cursor: 'pointer',
              fontSize: '14px',
            }}
          >
            取消
          </button>
          <button
            onClick={handleSubmit}
            disabled={isLoading}
            style={{
              padding: '10px 20px',
              background: '#8b5cf6',
              color: 'white',
              border: 'none',
              borderRadius: '6px',
              cursor: isLoading ? 'not-allowed' : 'pointer',
              fontSize: '14px',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
            }}
          >
            {isLoading ? (
              <>
                <span style={{ display: 'inline-block', width: '16px', height: '16px', border: '2px solid rgba(255, 255, 255, 0.3)', borderRadius: '50%', borderTopColor: 'white', animation: 'spin 1s ease-in-out infinite' }} />
                保存中...
              </>
            ) : (
              <>
                <Save size={16} />
                保存
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

export default TimelineNoteModal;