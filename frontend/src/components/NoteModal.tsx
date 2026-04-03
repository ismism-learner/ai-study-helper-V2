import React, { useState, useEffect } from 'react';
import { X, Save, Calendar, Clock, Tag, BookOpen } from 'lucide-react';
import { CreateTimelineEventRequest } from '../types';
import { worldTimelineApi } from '../api';

interface NoteModalProps {
  isOpen: boolean;
  onClose: () => void;
  bookId: string;
  currentPage?: number;
  onNoteCreated?: () => void;
}

const NoteModal: React.FC<NoteModalProps> = ({
  isOpen,
  onClose,
  bookId,
  currentPage = 1,
  onNoteCreated,
}) => {
  const [formData, setFormData] = useState<CreateTimelineEventRequest>({
    event_date: new Date().toISOString().split('T')[0],
    event_date_display: '',
    page_number: currentPage,
    event_title: '',
    event_description: '',
    importance: 'normal',
    tags: [],
  });

  // 实时更新页码
  useEffect(() => {
    setFormData(prev => ({
      ...prev,
      page_number: currentPage
    }));
  }, [currentPage]);
  const [isSaving, setIsSaving] = useState(false);
  const [newTag, setNewTag] = useState('');
  const [tagHistory, setTagHistory] = useState<string[]>([]);

  useEffect(() => {
    loadTagHistory();
  }, []);

  const loadTagHistory = () => {
    const stored = localStorage.getItem('noteTagHistory');
    if (stored) {
      try {
        setTagHistory(JSON.parse(stored));
      } catch (e) {
        console.error('Failed to parse tag history:', e);
      }
    }
  };

  const saveTagToHistory = (tag: string) => {
    if (!tag.trim()) return;
    const updated = [tag, ...tagHistory.filter(t => t !== tag)].slice(0, 50);
    setTagHistory(updated);
    localStorage.setItem('noteTagHistory', JSON.stringify(updated));
  };

  const handleInputChange = (field: keyof CreateTimelineEventRequest, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleAddTag = () => {
    if (newTag.trim() && !formData.tags?.includes(newTag.trim())) {
      const updatedTags = [...(formData.tags || []), newTag.trim()];
      setFormData(prev => ({ ...prev, tags: updatedTags }));
      saveTagToHistory(newTag.trim());
      setNewTag('');
    }
  };

  const handleRemoveTag = (tag: string) => {
    const updatedTags = formData.tags?.filter(t => t !== tag) || [];
    setFormData(prev => ({ ...prev, tags: updatedTags }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    
    try {
      // 生成显示日期，格式如：2024年3月30日
      if (!formData.event_date_display) {
        const date = new Date(formData.event_date);
        const displayDate = `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日`;
        formData.event_date_display = displayDate;
      }

      await worldTimelineApi.createTimelineEvent(bookId, formData);
      onClose();
      if (onNoteCreated) {
        onNoteCreated();
      }
    } catch (error) {
      console.error('Failed to create note:', error);
      alert('创建笔记失败，请重试');
    } finally {
      setIsSaving(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="note-modal-overlay">
      <div className="note-modal-content">
        <div className="note-modal-header">
          <h3>创建笔记</h3>
          <button className="close-btn" onClick={onClose}>
            <X size={20} />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="note-modal-form">
          <div className="form-group">
            <label>
              <Calendar size={14} />
              日期
            </label>
            <input
              type="date"
              value={formData.event_date}
              onChange={(e) => handleInputChange('event_date', e.target.value)}
              required
            />
          </div>

          <div className="form-group">
            <label>
              <Clock size={14} />
              显示日期
            </label>
            <input
              type="text"
              value={formData.event_date_display}
              onChange={(e) => handleInputChange('event_date_display', e.target.value)}
              placeholder="如：2024年3月30日"
            />
          </div>

          <div className="form-group">
            <label>
              <BookOpen size={14} />
              页码
            </label>
            <input
              type="number"
              value={formData.page_number}
              onChange={(e) => handleInputChange('page_number', parseInt(e.target.value))}
              min={1}
              required
            />
          </div>

          <div className="form-group">
            <label>
              事件标题
            </label>
            <input
              type="text"
              value={formData.event_title}
              onChange={(e) => handleInputChange('event_title', e.target.value)}
              placeholder="如：王与马共天下"
              required
            />
          </div>

          <div className="form-group">
            <label>
              描述
            </label>
            <textarea
              value={formData.event_description || ''}
              onChange={(e) => handleInputChange('event_description', e.target.value)}
              placeholder="详细描述..."
              rows={4}
            />
          </div>

          <div className="form-group">
            <label>
              重要性
            </label>
            <select
              value={formData.importance}
              onChange={(e) => handleInputChange('importance', e.target.value as 'low' | 'normal' | 'high')}
            >
              <option value="low">低</option>
              <option value="normal">中</option>
              <option value="high">高</option>
            </select>
          </div>

          <div className="form-group">
            <label>
              <Tag size={14} />
              标签
            </label>
            <div className="tags-container">
              {(formData.tags || []).map((tag, index) => (
                <div key={index} className="tag-item">
                  <span>{tag}</span>
                  <button
                    type="button"
                    className="tag-remove"
                    onClick={() => handleRemoveTag(tag)}
                  >
                    <X size={12} />
                  </button>
                </div>
              ))}
            </div>
            <div className="tag-input-container">
              <input
                type="text"
                value={newTag}
                onChange={(e) => setNewTag(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && handleAddTag()}
                placeholder="输入标签并按回车添加"
              />
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={handleAddTag}
              >
                添加
              </button>
            </div>
            {tagHistory.length > 0 && (
              <div className="tag-history">
                <div className="tag-history-header">历史标签：</div>
                <div className="tag-history-list">
                  {tagHistory
                    .filter(tag => !(formData.tags || []).includes(tag))
                    .slice(0, 10)
                    .map((tag, index) => (
                      <button
                        key={index}
                        type="button"
                        className="tag-history-item"
                        onClick={() => {
                          const updatedTags = [...(formData.tags || []), tag];
                          setFormData(prev => ({ ...prev, tags: updatedTags }));
                        }}
                      >
                        + {tag}
                      </button>
                    ))}
                </div>
              </div>
            )}
          </div>

          <div className="note-modal-footer">
            <button
              type="button"
              className="btn btn-secondary"
              onClick={onClose}
              disabled={isSaving}
            >
              取消
            </button>
            <button
              type="submit"
              className="btn btn-primary"
              disabled={isSaving}
            >
              <Save size={16} />
              {isSaving ? '保存中...' : '保存'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default NoteModal;
