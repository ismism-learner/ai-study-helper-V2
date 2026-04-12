import React from 'react';
import { Sparkles, Clock } from 'lucide-react';
import { PDFNote, NewNoteState } from './types';

interface NoteEditorProps {
  editingNote: PDFNote | null;
  newNote: NewNoteState;
  setNewNote: React.Dispatch<React.SetStateAction<NewNoteState>>;
  setEditingNote: React.Dispatch<React.SetStateAction<PDFNote | null>>;
  currentPage: number;
  isGenerating: boolean;
  generateError: string | null;
  showTimeInput: boolean;
  setShowTimeInput: (show: boolean) => void;
  onGenerate: () => void;
  onSave: () => void;
  onCancel: () => void;
  parseTimeInput: (inputStr: string) => { event_date: string; display: string } | null;
}

export const NoteEditor: React.FC<NoteEditorProps> = ({
  editingNote,
  newNote,
  setNewNote,
  setEditingNote,
  currentPage,
  isGenerating,
  generateError,
  showTimeInput,
  setShowTimeInput,
  onGenerate,
  onSave,
  onCancel,
  parseTimeInput,
}) => {
  return (
    <div className="add-note-form">
      <h4>{editingNote ? '编辑笔记' : '添加笔记'}</h4>
      <div className="form-group">
        <label>标题</label>
        <input
          type="text"
          className="input"
          value={editingNote ? editingNote.title : newNote.title}
          onChange={(e) => editingNote
            ? setEditingNote({ ...editingNote, title: e.target.value })
            : setNewNote({ ...newNote, title: e.target.value })
          }
          placeholder="输入笔记标题"
        />
      </div>
      <div className="form-group">
        <label>关联页码</label>
        <input
          type="number"
          className="input"
          value={editingNote ? editingNote.page_number : newNote.page_number}
          onChange={(e) => editingNote
            ? setEditingNote({ ...editingNote, page_number: parseInt(e.target.value) || currentPage })
            : setNewNote({ ...newNote, page_number: parseInt(e.target.value) || currentPage })
          }
          placeholder="输入页码"
          min="1"
        />
      </div>
      <div className="form-group">
        <label>内容</label>
        <textarea
          className="input textarea"
          value={editingNote ? editingNote.content : newNote.content}
          onChange={(e) => editingNote
            ? setEditingNote({ ...editingNote, content: e.target.value })
            : setNewNote({ ...newNote, content: e.target.value })
          }
          placeholder="输入笔记内容（可使用语音输入）"
          rows={3}
        />
        <button
          type="button"
          className="ai-generate-btn"
          onClick={onGenerate}
          disabled={isGenerating || !(editingNote ? editingNote.content : newNote.content)}
        >
          <Sparkles size={14} />
          {isGenerating ? 'AI 生成中...' : 'AI 一键生成'}
        </button>
        {generateError && (
          <div className="generate-error">
            {generateError}
          </div>
        )}
      </div>
      <div className="form-group">
        <label>标签</label>
        <input
          type="text"
          className="input"
          value={editingNote ? editingNote.tags.join(', ') : newNote.tags.join(', ')}
          onChange={(e) => {
            const tags = e.target.value.split(',').map(tag => tag.trim()).filter(Boolean);
            editingNote
              ? setEditingNote({ ...editingNote, tags })
              : setNewNote({ ...newNote, tags });
          }}
          placeholder="输入标签，用逗号分隔"
        />
      </div>
      
      <div className="form-group time-attribute-section">
        <div className="time-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}>
            <Clock size={14} />
            <span>时间属性</span>
            <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 'normal' }}>
              (可选，用于时间轴)
            </span>
          </label>
          <button
            type="button"
            onClick={() => setShowTimeInput(!showTimeInput)}
            style={{
              background: 'transparent',
              border: '1px solid var(--border-color)',
              borderRadius: '4px',
              padding: '2px 8px',
              fontSize: '11px',
              cursor: 'pointer',
              color: showTimeInput ? 'var(--primary-color)' : 'var(--text-secondary)',
            }}
          >
            {showTimeInput ? '收起' : '展开'}
          </button>
        </div>
        
        {showTimeInput && (
          <div className="time-input-block" style={{ 
            background: 'rgba(99, 102, 241, 0.05)', 
            borderRadius: '8px', 
            padding: '12px',
            border: '1px solid rgba(99, 102, 241, 0.2)'
          }}>
            <div className="form-row" style={{ display: 'flex', gap: '12px', marginBottom: '8px' }}>
              <div style={{ flex: 1 }}>
                <label style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '4px', display: 'block' }}>
                  时间节点
                </label>
                <input
                  type="text"
                  className="input"
                  value={editingNote ? editingNote.event_date || '' : newNote.event_date}
                  onChange={(e) => {
                    const parsed = parseTimeInput(e.target.value);
                    if (editingNote) {
                      setEditingNote({ 
                        ...editingNote, 
                        event_date: parsed?.event_date || e.target.value,
                        event_date_display: parsed?.display || ''
                      });
                    } else {
                      setNewNote({ 
                        ...newNote, 
                        event_date: parsed?.event_date || e.target.value,
                        event_date_display: parsed?.display || ''
                      });
                    }
                  }}
                  placeholder="如: 1960, -0221, 1960-3-15"
                  style={{ fontSize: '13px' }}
                />
              </div>
              {(editingNote ? editingNote.event_date_display : newNote.event_date_display) && (
                <div style={{ 
                  display: 'flex', 
                  alignItems: 'center', 
                  gap: '4px',
                  padding: '6px 10px',
                  background: 'rgba(99, 102, 241, 0.1)',
                  borderRadius: '4px',
                  fontSize: '12px',
                  color: 'var(--primary-color)',
                  alignSelf: 'flex-end'
                }}>
                  <Clock size={12} />
                  {editingNote ? editingNote.event_date_display : newNote.event_date_display}
                </div>
              )}
            </div>
            
            <div className="form-row" style={{ display: 'flex', gap: '12px', marginBottom: '8px' }}>
              <div style={{ flex: 1 }}>
                <label style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '4px', display: 'block' }}>
                  时间范围（可选）
                </label>
                <input
                  type="text"
                  className="input"
                  value={editingNote ? editingNote.event_date_end || '' : newNote.event_date_end}
                  onChange={(e) => {
                    const parsed = parseTimeInput(e.target.value);
                    if (editingNote) {
                      setEditingNote({ 
                        ...editingNote, 
                        event_date_end: e.target.value,
                        event_date_end_display: parsed?.display || '',
                        is_time_range: !!parsed
                      });
                    } else {
                      setNewNote({ 
                        ...newNote, 
                        event_date_end: e.target.value,
                        event_date_end_display: parsed?.display || '',
                        is_time_range: !!parsed
                      });
                    }
                  }}
                  placeholder="如: 1968 (表示 1960~1968)"
                  style={{ fontSize: '13px' }}
                />
              </div>
              {(editingNote ? editingNote.event_date_end_display : newNote.event_date_end_display) && (
                <div style={{ 
                  display: 'flex', 
                  alignItems: 'center', 
                  gap: '4px',
                  padding: '6px 10px',
                  background: 'rgba(99, 102, 241, 0.1)',
                  borderRadius: '4px',
                  fontSize: '12px',
                  color: 'var(--primary-color)',
                  alignSelf: 'flex-end'
                }}>
                  → {editingNote ? editingNote.event_date_end_display : newNote.event_date_end_display}
                </div>
              )}
            </div>
            
            <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '8px' }}>
              <div>支持格式：年份(1960) | 年月(1960-3) | 完整日期(1960-3-15) | 公元前(-0221)</div>
              <div>时间范围：起始时间~结束时间 (如: 1960~1968)</div>
            </div>
          </div>
        )}
      </div>
      <div className="form-actions">
        <button className="btn btn-secondary" onClick={onCancel}>
          取消
        </button>
        <button className="btn btn-primary" onClick={onSave}>
          {editingNote ? '更新' : '保存'}
        </button>
      </div>
    </div>
  );
};
