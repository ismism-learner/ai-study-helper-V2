import React, { useState } from 'react';
import { X, Zap, FileText, Calendar, Tag, Plus } from 'lucide-react';

interface AddNoteModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: {
    mode: 'quick' | 'standard';
    content: string;
    eventTitle?: string;
    eventDate?: string;
    tags?: string[];
  }) => Promise<void>;
  currentPage: number;
}

const AddNoteModal: React.FC<AddNoteModalProps> = ({
  isOpen,
  onClose,
  onSubmit,
  currentPage,
}) => {
  const [mode, setMode] = useState<'quick' | 'standard'>('quick');
  const [content, setContent] = useState('');
  const [eventTitle, setEventTitle] = useState('');
  const [eventDate, setEventDate] = useState('');
  const [tagInput, setTagInput] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!isOpen) return null;

  const handleAddTag = () => {
    if (tagInput.trim() && !tags.includes(tagInput.trim())) {
      setTags([...tags, tagInput.trim()]);
      setTagInput('');
    }
  };

  const handleRemoveTag = (tagToRemove: string) => {
    setTags(tags.filter(tag => tag !== tagToRemove));
  };

  const handleSubmit = async () => {
    if (!content.trim()) {
      alert('请输入笔记内容');
      return;
    }

    if (mode === 'standard' && eventDate && !eventTitle.trim()) {
      alert('填写了时间就必须填写事件标题');
      return;
    }

    setIsSubmitting(true);
    try {
      await onSubmit({
        mode,
        content: content.trim(),
        eventTitle: mode === 'standard' && eventDate ? eventTitle.trim() : undefined,
        eventDate: mode === 'standard' ? eventDate : undefined,
        tags: tags.length > 0 ? tags : undefined,
      });

      setContent('');
      setEventTitle('');
      setEventDate('');
      setTags([]);
      setTagInput('');
      onClose();
    } catch (error) {
      console.error('Failed to submit note:', error);
      alert('提交失败，请重试');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (tagInput) {
        handleAddTag();
      } else {
        handleSubmit();
      }
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="add-note-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3 className="modal-title">添加笔记</h3>
          <button className="modal-close-btn" onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        <div className="modal-body">
          <div className="mode-switcher">
            <button 
              className={`mode-btn ${mode === 'quick' ? 'active' : ''}`}
              onClick={() => setMode('quick')}
            >
              <Zap size={16} />
              快速笔记
            </button>
            <button 
              className={`mode-btn ${mode === 'standard' ? 'active' : ''}`}
              onClick={() => setMode('standard')}
            >
              <FileText size={16} />
              标准笔记
            </button>
          </div>

          <div className="form-group">
            <label className="form-label">
              {mode === 'quick' ? '笔记内容' : '笔记内容'}
            </label>
            <textarea
              className="form-textarea"
              value={content}
              onChange={(e) => setContent(e.target.value)}
              onKeyPress={handleKeyPress}
              placeholder={mode === 'quick' 
                ? `快速记录第${currentPage}页的内容...` 
                : '详细记录你的想法和笔记...'}
              rows={4}
              autoFocus
            />
          </div>

          {mode === 'standard' && (
            <>
              <div className="form-group">
                <label className="form-label">
                  <Calendar size={14} style={{ marginRight: 6 }} />
                  事件日期（可选）
                </label>
                <input
                  type="text"
                  className="form-input"
                  value={eventDate}
                  onChange={(e) => setEventDate(e.target.value)}
                  placeholder="例如：2024-01-15 或 2024年1月15日"
                />
                <p className="form-hint">
                  如果填写了日期，将创建历史事件并显示在时间轴中
                </p>
              </div>

              {eventDate && (
                <div className="form-group">
                  <label className="form-label">
                    事件标题
                  </label>
                  <input
                    type="text"
                    className="form-input"
                    value={eventTitle}
                    onChange={(e) => setEventTitle(e.target.value)}
                    placeholder="简短描述这个事件..."
                  />
                </div>
              )}

              <div className="form-group">
                <label className="form-label">
                  <Tag size={14} style={{ marginRight: 6 }} />
                  标签（可选）
                </label>
                <div className="tags-input-wrapper">
                  <input
                    type="text"
                    className="form-input"
                    value={tagInput}
                    onChange={(e) => setTagInput(e.target.value)}
                    onKeyPress={handleKeyPress}
                    placeholder="输入标签后按回车添加"
                  />
                  <button 
                    className="add-tag-btn"
                    onClick={handleAddTag}
                    disabled={!tagInput.trim()}
                  >
                    <Plus size={16} />
                  </button>
                </div>
                {tags.length > 0 && (
                  <div className="tags-list">
                    {tags.map((tag, index) => (
                      <span key={index} className="tag-item">
                        {tag}
                        <button 
                          className="remove-tag-btn"
                          onClick={() => handleRemoveTag(tag)}
                        >
                          <X size={12} />
                        </button>
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
        </div>

        <div className="modal-footer">
          <button className="cancel-btn" onClick={onClose}>
            取消
          </button>
          <button 
            className="submit-btn" 
            onClick={handleSubmit}
            disabled={isSubmitting || !content.trim()}
          >
            {isSubmitting ? '提交中...' : '提交'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default AddNoteModal;
