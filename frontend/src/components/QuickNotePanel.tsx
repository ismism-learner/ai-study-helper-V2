import React, { useState, useCallback, useEffect } from 'react';
import { useUndoRedo, createUndoRedoKeyHandler } from '../hooks/useUndoRedo';
import {
  Zap, Send, Check, FileText, Clock, CheckSquare, Square,
  Sparkles, Trash2, FolderOpen, X, Edit3, Tag, ChevronUp, ChevronDown
} from 'lucide-react';
import { quickNoteApi, QuickNote, QuickNoteAIResult } from '../api';
import LoadingBook from './LoadingBook';

interface QuickNoteInputProps {
  sourceDocumentId?: string;
  sourcePage?: number;
  onNoteCreated?: (note: QuickNote) => void;
  onNotesChange?: () => void;
}

export const QuickNoteInput: React.FC<QuickNoteInputProps> = ({
  sourceDocumentId,
  sourcePage,
  onNoteCreated,
  onNotesChange,
}) => {
  const { state: content, push: pushContent, reset: resetContent, undo, redo } = useUndoRedo('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);

  const handleSubmit = async () => {
    if (!content.trim()) return;

    setIsSubmitting(true);
    try {
      const response = await quickNoteApi.create({
        content: content.trim(),
        source_document_id: sourceDocumentId,
        source_page: sourcePage,
        source_type: sourceDocumentId ? 'pdf' : 'quick',
      });
      
      resetContent('');
      setShowSuccess(true);
      setTimeout(() => setShowSuccess(false), 2000);
      
      onNoteCreated?.(response.data);
      onNotesChange?.();
    } catch (error) {
      console.error('Failed to create quick note:', error);
      alert('创建笔记失败');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      handleSubmit();
      return;
    }
    createUndoRedoKeyHandler(undo, redo)(e);
  };

  return (
    <div className="quick-note-input">
      <div className="input-header">
        <Zap size={16} className="icon-flash" />
        <span>快速记录</span>
        <span className="hint">Ctrl+Enter 保存</span>
      </div>
      <div className="input-body">
        <textarea
          value={content}
          onChange={(e) => pushContent(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="输入笔记内容，无需标题即可保存..."
          rows={3}
          autoFocus
        />
        <div className="input-actions">
          <button
            className="btn btn-primary"
            onClick={handleSubmit}
            disabled={!content.trim() || isSubmitting}
          >
            {isSubmitting ? (
              <>
                <LoadingBook size={14} />
                保存中...
              </>
            ) : showSuccess ? (
              <>
                <Check size={14} />
                已保存
              </>
            ) : (
              <>
                <Send size={14} />
                保存
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

interface QuickNoteManagerProps {
  sourceDocumentId?: string;
  onClose?: () => void;
}

export const QuickNoteManager: React.FC<QuickNoteManagerProps> = ({
  sourceDocumentId,
  onClose,
}) => {
  const [notes, setNotes] = useState<QuickNote[]>([]);
  const [groups, setGroups] = useState<Array<{ id: string; name: string; count: number }>>([]);
  const [stats, setStats] = useState({ total: 0, unprocessed: 0, processed: 0 });
  const [isLoading, setIsLoading] = useState(true);
  const [selectedNotes, setSelectedNotes] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState<'all' | 'unprocessed' | 'processed'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingResults, setProcessingResults] = useState<QuickNoteAIResult[] | null>(null);
  const [editingNote, setEditingNote] = useState<QuickNote | null>(null);
  const [showCreateGroup, setShowCreateGroup] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());

  const loadData = useCallback(async () => {
    setIsLoading(true);
    try {
      const [notesRes, groupsRes, statsRes] = await Promise.all([
        quickNoteApi.list({
          source_document_id: sourceDocumentId,
          is_processed: filter === 'all' ? undefined : filter === 'processed' ? 1 : 0,
          search: searchQuery || undefined,
        }),
        quickNoteApi.getGroups(),
        quickNoteApi.getStats(),
      ]);

      setNotes(notesRes.data);
      setGroups(groupsRes.data.groups);
      setStats(statsRes.data);
    } catch (error) {
      console.error('Failed to load quick notes:', error);
    } finally {
      setIsLoading(false);
    }
  }, [sourceDocumentId, filter, searchQuery]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleSelectNote = (noteId: string) => {
    setSelectedNotes(prev => {
      const newSet = new Set(prev);
      if (newSet.has(noteId)) {
        newSet.delete(noteId);
      } else {
        newSet.add(noteId);
      }
      return newSet;
    });
  };

  const handleBatchProcess = async () => {
    if (selectedNotes.size === 0) return;

    setIsProcessing(true);
    try {
      const response = await quickNoteApi.batchProcess(Array.from(selectedNotes));
      setProcessingResults(response.data.results);
      loadData();
    } catch (error) {
      console.error('Failed to process notes:', error);
      alert('批量处理失败');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleBatchDelete = async () => {
    if (selectedNotes.size === 0) return;
    if (!confirm(`确定要删除 ${selectedNotes.size} 条笔记吗？`)) return;

    try {
      await quickNoteApi.batchDelete(Array.from(selectedNotes));
      setSelectedNotes(new Set());
      loadData();
    } catch (error) {
      console.error('Failed to delete notes:', error);
      alert('删除失败');
    }
  };

  const handleConvertToDocument = async (noteId: string) => {
    try {
      await quickNoteApi.convertToDocument(noteId);
      loadData();
    } catch (error) {
      console.error('Failed to convert note:', error);
      alert('转换失败');
    }
  };

  const handleCreateGroup = async () => {
    if (!newGroupName.trim()) return;

    try {
      const noteIds = selectedNotes.size > 0 ? Array.from(selectedNotes) : undefined;
      await quickNoteApi.createGroup(newGroupName.trim(), noteIds);
      setNewGroupName('');
      setShowCreateGroup(false);
      setSelectedNotes(new Set());
      loadData();
    } catch (error) {
      console.error('Failed to create group:', error);
      alert('创建分组失败');
    }
  };

  const handleUpdateNote = async (note: QuickNote) => {
    try {
      await quickNoteApi.update(note.id, {
        title: note.title,
        content: note.content,
        tags: note.tags,
      });
      setEditingNote(null);
      loadData();
    } catch (error) {
      console.error('Failed to update note:', error);
      alert('更新失败');
    }
  };

  const toggleGroup = (groupId: string) => {
    setExpandedGroups(prev => {
      const newSet = new Set(prev);
      if (newSet.has(groupId)) {
        newSet.delete(groupId);
      } else {
        newSet.add(groupId);
      }
      return newSet;
    });
  };

  const groupedNotes = notes.reduce((acc, note) => {
    const key = note.group_id || 'ungrouped';
    if (!acc[key]) {
      acc[key] = [];
    }
    acc[key].push(note);
    return acc;
  }, {} as Record<string, QuickNote[]>);

  return (
    <div className="quick-note-manager">
      <div className="manager-header">
        <div className="header-title">
          <FileText size={20} />
          <h3>快速笔记管理</h3>
        </div>
        <div className="header-stats">
          <span className="stat">
            <Clock size={14} />
            待处理: {stats.unprocessed}
          </span>
          <span className="stat">
            <Check size={14} />
            已处理: {stats.processed}
          </span>
        </div>
        {onClose && (
          <button className="close-btn" onClick={onClose}>
            <X size={18} />
          </button>
        )}
      </div>

      <div className="manager-toolbar">
        <div className="toolbar-left">
          <button
            className={`btn btn-sm ${filter === 'all' ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setFilter('all')}
          >
            全部
          </button>
          <button
            className={`btn btn-sm ${filter === 'unprocessed' ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setFilter('unprocessed')}
          >
            待处理
          </button>
          <button
            className={`btn btn-sm ${filter === 'processed' ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setFilter('processed')}
          >
            已处理
          </button>
        </div>
        <div className="toolbar-right">
          <input
            type="text"
            className="search-input"
            placeholder="搜索笔记..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
      </div>

      {selectedNotes.size > 0 && (
        <div className="batch-actions">
          <span className="selection-count">已选择 {selectedNotes.size} 条</span>
          <button
            className="btn btn-primary btn-sm"
            onClick={handleBatchProcess}
            disabled={isProcessing}
          >
            <Sparkles size={14} />
            {isProcessing ? 'AI处理中...' : 'AI批量处理'}
          </button>
          <button
            className="btn btn-secondary btn-sm"
            onClick={() => setShowCreateGroup(true)}
          >
            <FolderOpen size={14} />
            创建分组
          </button>
          <button
            className="btn btn-danger btn-sm"
            onClick={handleBatchDelete}
          >
            <Trash2 size={14} />
            删除
          </button>
        </div>
      )}

      {processingResults && (
        <div className="processing-results">
          <div className="results-header">
            <h4>AI处理结果</h4>
            <button
              className="btn btn-sm btn-secondary"
              onClick={() => setProcessingResults(null)}
            >
              <X size={14} />
              关闭
            </button>
          </div>
          <div className="results-list">
            {processingResults.map((result) => (
              <div key={result.note_id} className="result-item">
                <div className="result-original">
                  <span className="label">原始内容:</span>
                  <p>{result.original_content}</p>
                </div>
                <div className="result-generated">
                  <span className="label">生成标题:</span>
                  <p className="title">{result.generated_title}</p>
                  <span className="label">优化内容:</span>
                  <p>{result.optimized_content}</p>
                  <span className="label">建议标签:</span>
                  <div className="tags">
                    {result.suggested_tags.map((tag, i) => (
                      <span key={i} className="tag">{tag}</span>
                    ))}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {showCreateGroup && (
        <div className="create-group-modal">
          <div className="modal-content">
            <h4>创建新分组</h4>
            <input
              type="text"
              className="input"
              placeholder="输入分组名称..."
              value={newGroupName}
              onChange={(e) => setNewGroupName(e.target.value)}
              autoFocus
            />
            <div className="modal-actions">
              <button
                className="btn btn-secondary"
                onClick={() => {
                  setShowCreateGroup(false);
                  setNewGroupName('');
                }}
              >
                取消
              </button>
              <button
                className="btn btn-primary"
                onClick={handleCreateGroup}
                disabled={!newGroupName.trim()}
              >
                创建
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="notes-list">
        {isLoading ? (
          <div className="loading">加载中...</div>
        ) : notes.length === 0 ? (
          <div className="empty-state">
            <FileText size={48} strokeWidth={1} />
            <p>暂无笔记</p>
            <p className="hint">使用快速记录功能创建笔记</p>
          </div>
        ) : (
          Object.entries(groupedNotes).map(([groupId, groupNotes]) => {
            const group = groups.find(g => g.id === groupId);
            const isExpanded = expandedGroups.has(groupId) || groupId === 'ungrouped';

            return (
              <div key={groupId} className="note-group">
                {groupId !== 'ungrouped' && (
                  <div
                    className="group-header"
                    onClick={() => toggleGroup(groupId)}
                  >
                    <FolderOpen size={16} />
                    <span className="group-name">{group?.name || '未分组'}</span>
                    <span className="group-count">{groupNotes.length}</span>
                    {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                  </div>
                )}

                {isExpanded && groupNotes.map((note) => (
                  <div
                    key={note.id}
                    className={`note-card ${selectedNotes.has(note.id) ? 'selected' : ''} ${note.is_processed ? 'processed' : ''}`}
                  >
                    <div className="note-checkbox">
                      <button
                        className="checkbox-btn"
                        onClick={() => handleSelectNote(note.id)}
                      >
                        {selectedNotes.has(note.id) ? (
                          <CheckSquare size={18} />
                        ) : (
                          <Square size={18} />
                        )}
                      </button>
                    </div>

                    <div className="note-content">
                      {editingNote?.id === note.id ? (
                        <div className="edit-form">
                          <input
                            type="text"
                            className="input"
                            value={editingNote.title || ''}
                            onChange={(e) => setEditingNote({ ...editingNote, title: e.target.value })}
                            placeholder="标题（可选）"
                          />
                          <textarea
                            className="input textarea"
                            value={editingNote.content}
                            onChange={(e) => setEditingNote({ ...editingNote, content: e.target.value })}
                            rows={3}
                          />
                          <input
                            type="text"
                            className="input"
                            value={editingNote.tags?.join(', ') || ''}
                            onChange={(e) => setEditingNote({
                              ...editingNote,
                              tags: e.target.value.split(',').map(t => t.trim()).filter(Boolean)
                            })}
                            placeholder="标签（逗号分隔）"
                          />
                          <div className="edit-actions">
                            <button
                              className="btn btn-secondary btn-sm"
                              onClick={() => setEditingNote(null)}
                            >
                              取消
                            </button>
                            <button
                              className="btn btn-primary btn-sm"
                              onClick={() => handleUpdateNote(editingNote)}
                            >
                              保存
                            </button>
                          </div>
                        </div>
                      ) : (
                        <>
                          {note.title && <h4 className="note-title">{note.title}</h4>}
                          <p className="note-text">{note.content}</p>
                          {note.tags && note.tags.length > 0 && (
                            <div className="note-tags">
                              {note.tags.map((tag, i) => (
                                <span key={i} className="tag">
                                  <Tag size={10} />
                                  {tag}
                                </span>
                              ))}
                            </div>
                          )}
                          <div className="note-meta">
                            <span className="time">
                              <Clock size={12} />
                              {new Date(note.created_at).toLocaleString()}
                            </span>
                            {note.source_page && (
                              <span className="page">第 {note.source_page} 页</span>
                            )}
                            {note.is_processed && (
                              <span className="processed-badge">
                                <Check size={12} />
                                已处理
                              </span>
                            )}
                          </div>
                        </>
                      )}
                    </div>

                    {!editingNote && (
                      <div className="note-actions">
                        <button
                          className="action-btn"
                          onClick={() => setEditingNote(note)}
                          title="编辑"
                        >
                          <Edit3 size={14} />
                        </button>
                        {!note.is_processed && (
                          <button
                            className="action-btn"
                            onClick={() => handleConvertToDocument(note.id)}
                            title="转为标准笔记"
                          >
                            <FileText size={14} />
                          </button>
                        )}
                        <button
                          className="action-btn delete"
                          onClick={async () => {
                            if (confirm('确定删除此笔记？')) {
                              await quickNoteApi.delete(note.id);
                              loadData();
                            }
                          }}
                          title="删除"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};

export default QuickNoteManager;
