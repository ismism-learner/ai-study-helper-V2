import React, { useState, useEffect } from 'react';
import { WorldTimelineEvent } from '../types';
import { worldTimelineApi } from '../api';
import { Calendar, Clock, Tag, Trash2, Edit3, Plus, ChevronUp, ChevronDown, Check } from 'lucide-react';
import TimelineNoteModal from './TimelineNoteModal';
import ConfirmDialog from './ConfirmDialog';
import DraggableTimelineWindow from './DraggableTimelineWindow';

interface DocumentTimelineNotesProps {
  documentId: string;
  onNoteClick?: (note: WorldTimelineEvent) => void;
  currentPage?: number;
}

const DocumentTimelineNotes: React.FC<DocumentTimelineNotesProps> = ({
  documentId,
  onNoteClick: _onNoteClick,
  currentPage = 1,
}) => {
  const [notes, setNotes] = useState<WorldTimelineEvent[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedNote, setSelectedNote] = useState<WorldTimelineEvent | null>(null);
  const [expandedYears, setExpandedYears] = useState<Set<number>>(new Set());
  const [deleteConfirm, setDeleteConfirm] = useState<{
    isOpen: boolean;
    noteId: string;
    noteTitle: string;
  }>({
    isOpen: false,
    noteId: '',
    noteTitle: '',
  });
  const [isAIModalOpen, setIsAIModalOpen] = useState(false);
  const [selectedNotes, setSelectedNotes] = useState<Set<string>>(new Set());
  const [lastSelectedId, setLastSelectedId] = useState<string | null>(null);
  const [showTagEditor, setShowTagEditor] = useState(false);
  const [tagInput, setTagInput] = useState('');
  const [historyTags, setHistoryTags] = useState<string[]>([]);
  const [tagFeedback, setTagFeedback] = useState<string | null>(null);
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  const [editingTags, setEditingTags] = useState<string[]>([]);

  useEffect(() => {
    loadNotes();
  }, [documentId]);

  useEffect(() => {
    const handleNoteAdded = () => loadNotes();
    const handleNoteUpdated = () => loadNotes();

    window.addEventListener('timeline-note-added', handleNoteAdded);
    window.addEventListener('timeline-note-updated', handleNoteUpdated);

    return () => {
      window.removeEventListener('timeline-note-added', handleNoteAdded);
      window.removeEventListener('timeline-note-updated', handleNoteUpdated);
    };
  }, [documentId]);

  const loadNotes = async () => {
    if (!documentId) return;
    setIsLoading(true);
    try {
      const response = await worldTimelineApi.getDocumentDirectTimelineEvents(documentId, 'event_date', 'asc');
      setNotes(response.data);

      const years = new Set(response.data.map(note => {
        const year = parseInt(note.event_date);
        return isNaN(year) ? 0 : year;
      }));
      setExpandedYears(years);
    } catch (error) {
      console.error('Failed to load timeline notes:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const loadHistoryTags = async () => {
    try {
      const response = await worldTimelineApi.getTimelineTagsHistory();
      setHistoryTags(response.data.tags || []);
    } catch (error) {
      console.error('Failed to load history tags:', error);
    }
  };

  const groupedNotes = () => {
    const groups: Record<number, WorldTimelineEvent[]> = {};

    notes.forEach(note => {
      const year = parseInt(note.event_date);
      const yearKey = isNaN(year) ? 0 : year;
      if (!groups[yearKey]) {
        groups[yearKey] = [];
      }
      groups[yearKey].push(note);
    });

    return Object.entries(groups)
      .sort(([yearA], [yearB]) => parseInt(yearA) - parseInt(yearB))
      .map(([year, notes]) => ({
        year: parseInt(year),
        notes: notes.sort((a, b) => a.event_date.localeCompare(b.event_date))
      }));
  };

  const handleAddNote = () => {
    setSelectedNote(null);
    setIsModalOpen(true);
  };

  const handleEditNote = (note: WorldTimelineEvent, e: React.MouseEvent) => {
    e.stopPropagation();
    setSelectedNote(note);
    setIsModalOpen(true);
  };

  const handleDeleteClick = (note: WorldTimelineEvent, e: React.MouseEvent) => {
    e.stopPropagation();
    setDeleteConfirm({
      isOpen: true,
      noteId: note.id,
      noteTitle: note.event_title,
    });
  };

  const handleConfirmDelete = async () => {
    try {
      const noteToDelete = notes.find(note => note.id === deleteConfirm.noteId);
      if (noteToDelete) {
        const isDocumentEvent = 'document_id' in noteToDelete;
        if (isDocumentEvent) {
          await worldTimelineApi.deleteDocumentDirectTimelineEvent(deleteConfirm.noteId);
        } else {
          await worldTimelineApi.deleteTimelineEvent(deleteConfirm.noteId);
        }
      } else {
        try {
          await worldTimelineApi.deleteDocumentDirectTimelineEvent(deleteConfirm.noteId);
        } catch {
          await worldTimelineApi.deleteTimelineEvent(deleteConfirm.noteId);
        }
      }
      loadNotes();
    } catch (error) {
      console.error('Failed to delete note:', error);
      alert('删除笔记失败，请重试');
    } finally {
      setDeleteConfirm({ isOpen: false, noteId: '', noteTitle: '' });
    }
  };

  const handleNoteClick = (note: WorldTimelineEvent, e: React.MouseEvent) => {
    if (e.shiftKey && lastSelectedId) {
      const noteIds = notes.map(n => n.id);
      const lastIndex = noteIds.indexOf(lastSelectedId);
      const currentIndex = noteIds.indexOf(note.id);
      
      if (lastIndex !== -1 && currentIndex !== -1) {
        const start = Math.min(lastIndex, currentIndex);
        const end = Math.max(lastIndex, currentIndex);
        const newSelected = new Set(selectedNotes);
        
        for (let i = start; i <= end; i++) {
          newSelected.add(noteIds[i]);
        }
        setSelectedNotes(newSelected);
      }
    } else {
      toggleNoteSelection(note.id);
    }
    setLastSelectedId(note.id);
  };

  const toggleNoteSelection = (noteId: string) => {
    const newSelected = new Set(selectedNotes);
    if (newSelected.has(noteId)) {
      newSelected.delete(noteId);
    } else {
      newSelected.add(noteId);
    }
    setSelectedNotes(newSelected);
  };

  const toggleSelectAll = () => {
    if (selectedNotes.size === notes.length) {
      setSelectedNotes(new Set());
      setLastSelectedId(null);
    } else {
      setSelectedNotes(new Set(notes.map(n => n.id)));
    }
  };

  const handleAddBatchTag = async () => {
    if (!tagInput.trim() || selectedNotes.size === 0) return;
    
    const newTag = tagInput.trim();
    
    try {
      for (const noteId of selectedNotes) {
        const note = notes.find(n => n.id === noteId);
        if (note) {
          const currentTags = note.tags || [];
          const newTags = [...new Set([...currentTags, newTag])];
          await worldTimelineApi.updateDocumentDirectTimelineEvent(noteId, { tags: newTags });
        }
      }
      
      setTagFeedback(`已为 ${selectedNotes.size} 个笔记添加标签 "${newTag}"`);
      setTimeout(() => setTagFeedback(null), 2000);
      setTagInput('');
      loadNotes();
    } catch (error) {
      console.error('Failed to add tag:', error);
      alert('添加标签失败');
    }
  };

  const handleAddHistoryTagToSelected = async (tag: string) => {
    if (selectedNotes.size === 0) return;
    
    try {
      for (const noteId of selectedNotes) {
        const note = notes.find(n => n.id === noteId);
        if (note) {
          const currentTags = note.tags || [];
          const newTags = [...new Set([...currentTags, tag])];
          await worldTimelineApi.updateDocumentDirectTimelineEvent(noteId, { tags: newTags });
        }
      }
      
      setTagFeedback(`已为 ${selectedNotes.size} 个笔记添加标签 "${tag}"`);
      setTimeout(() => setTagFeedback(null), 2000);
      loadNotes();
    } catch (error) {
      console.error('Failed to add tag:', error);
      alert('添加标签失败');
    }
  };

  const handleStartEditTags = (note: WorldTimelineEvent, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingNoteId(note.id);
    setEditingTags(note.tags || []);
  };

  const handleAddTagToNote = () => {
    if (!tagInput.trim()) return;
    const newTag = tagInput.trim();
    if (!editingTags.includes(newTag)) {
      setEditingTags([...editingTags, newTag]);
    }
    setTagInput('');
  };

  const handleSaveNoteTags = async () => {
    if (!editingNoteId) return;
    
    try {
      await worldTimelineApi.updateDocumentDirectTimelineEvent(editingNoteId, { tags: editingTags });
      setTagFeedback('标签已更新');
      setTimeout(() => setTagFeedback(null), 2000);
      setEditingNoteId(null);
      setEditingTags([]);
      loadNotes();
    } catch (error) {
      console.error('Failed to save tags:', error);
      alert('保存标签失败');
    }
  };

  const handleRemoveTagFromNote = (tag: string) => {
    setEditingTags(editingTags.filter(t => t !== tag));
  };

  const toggleYear = (year: number) => {
    setExpandedYears(prev => {
      const newSet = new Set(prev);
      if (newSet.has(year)) {
        newSet.delete(year);
      } else {
        newSet.add(year);
      }
      return newSet;
    });
  };

  const getDateDisplay = (note: WorldTimelineEvent) => {
    if (note.event_date_display) {
      return note.event_date_display;
    }
    const year = parseInt(note.event_date);
    if (isNaN(year)) return '未知日期';
    return `${year}年`;
  };

  const getImportanceColor = (importance: string) => {
    switch (importance) {
      case 'high':
        return '#ef4444';
      case 'normal':
        return '#3b82f6';
      case 'low':
        return '#10b981';
      default:
        return '#6b7280';
    }
  };

  const hasPageInfo = (note: WorldTimelineEvent) => {
    return note.page_number !== null && note.page_number !== undefined && note.page_number > 0;
  };

  if (isLoading) {
    return (
      <div className="document-timeline-notes" style={{ padding: '16px' }}>
        <div style={{ textAlign: 'center', color: '#6b7280', padding: '20px' }}>
          <div className="loading-spinner" style={{
            width: '24px',
            height: '24px',
            border: '2px solid #e5e7eb',
            borderTopColor: '#3b82f6',
            borderRadius: '50%',
            animation: 'spin 1s linear infinite',
            margin: '0 auto 8px'
          }} />
          <p style={{ fontSize: '14px', margin: 0 }}>加载时间笔记...</p>
        </div>
      </div>
    );
  }

  const grouped = groupedNotes();

  return (
    <div className="document-timeline-notes" style={{
      background: '#f8f9fa',
      borderRadius: '8px',
      overflow: 'hidden'
    }}>
      <div style={{
        padding: '12px 16px',
        background: '#fff',
        borderBottom: '1px solid #e5e7eb',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center'
      }}>
        <h3 style={{
          margin: 0,
          fontSize: '16px',
          fontWeight: 600,
          display: 'flex',
          alignItems: 'center',
          gap: '8px'
        }}>
          <Calendar size={18} />
          时间笔记
          <span style={{
            fontSize: '12px',
            fontWeight: 'normal',
            color: '#6b7280',
            background: '#e5e7eb',
            padding: '2px 8px',
            borderRadius: '12px'
          }}>
            {notes.length}
          </span>
          {selectedNotes.size > 0 && (
            <span style={{
              fontSize: '12px',
              background: '#8b5cf6',
              color: 'white',
              padding: '2px 8px',
              borderRadius: '12px'
            }}>
              已选 {selectedNotes.size}
            </span>
          )}
        </h3>
        <div style={{ display: 'flex', gap: '8px' }}>
          {selectedNotes.size > 0 && (
            <button
              onClick={() => {
                setShowTagEditor(!showTagEditor);
                if (!showTagEditor) {
                  loadHistoryTags();
                }
              }}
              style={{
                padding: '6px 12px',
                background: showTagEditor ? '#8b5cf6' : '#f3f4f6',
                color: showTagEditor ? 'white' : '#374151',
                border: 'none',
                borderRadius: '4px',
                fontSize: '13px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '4px'
              }}
            >
              <Tag size={14} />
              标签
            </button>
          )}
          <button
            onClick={toggleSelectAll}
            style={{
              padding: '6px 12px',
              background: selectedNotes.size === notes.length ? '#10b981' : '#f3f4f6',
              color: selectedNotes.size === notes.length ? 'white' : '#374151',
              border: 'none',
              borderRadius: '4px',
              fontSize: '13px',
              cursor: 'pointer'
            }}
          >
            {selectedNotes.size === notes.length ? '取消全选' : '全选'}
          </button>
          <button
            onClick={handleAddNote}
            style={{
              padding: '6px 12px',
              background: '#3b82f6',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              fontSize: '13px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '4px'
            }}
          >
            <Plus size={14} />
            添加
          </button>
          <button
            onClick={() => setIsAIModalOpen(true)}
            style={{
              padding: '6px 12px',
              background: '#8b5cf6',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              fontSize: '13px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '4px'
            }}
          >
            AI生成
          </button>
        </div>
      </div>

      {tagFeedback && (
        <div style={{
          background: '#ecfdf5',
          color: '#059669',
          padding: '10px 16px',
          fontSize: '13px',
          display: 'flex',
          alignItems: 'center',
          gap: '6px'
        }}>
          <Check size={14} />
          {tagFeedback}
        </div>
      )}

      {showTagEditor && selectedNotes.size > 0 && (
        <div style={{
          background: '#f8fafc',
          padding: '12px 16px',
          borderBottom: '1px solid #e5e7eb'
        }}>
          <div style={{ fontSize: '13px', fontWeight: 500, marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <Tag size={14} />
            为选中的 {selectedNotes.size} 个笔记添加标签
          </div>
          <div style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
            <input
              type="text"
              value={tagInput}
              onChange={(e) => setTagInput(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && handleAddBatchTag()}
              placeholder="输入标签后按回车添加"
              style={{
                flex: 1,
                padding: '8px',
                border: '1px solid #e5e7eb',
                borderRadius: '4px',
                fontSize: '13px'
              }}
            />
            <button
              onClick={handleAddBatchTag}
              disabled={!tagInput.trim()}
              style={{
                padding: '8px 16px',
                background: tagInput.trim() ? '#8b5cf6' : '#9ca3af',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: tagInput.trim() ? 'pointer' : 'not-allowed',
                fontSize: '13px'
              }}
            >
              添加
            </button>
          </div>
          {historyTags.length > 0 && (
            <div>
              <span style={{ fontSize: '11px', color: '#9ca3af', marginRight: '8px' }}>快速选择:</span>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', marginTop: '4px' }}>
                {historyTags.slice(0, 8).map((tag) => (
                  <button
                    key={tag}
                    onClick={() => handleAddHistoryTagToSelected(tag)}
                    style={{
                      background: '#fff',
                      border: '1px solid #d1d5db',
                      borderRadius: '12px',
                      padding: '2px 8px',
                      fontSize: '11px',
                      cursor: 'pointer'
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

      <div style={{ maxHeight: '400px', overflowY: 'auto' }}>
        {grouped.length === 0 ? (
          <div style={{
            textAlign: 'center',
            padding: '32px 16px',
            color: '#6b7280'
          }}>
            <Calendar size={32} style={{ marginBottom: '8px', opacity: 0.5 }} />
            <p style={{ fontSize: '14px', margin: 0 }}>暂无时间笔记</p>
            <p style={{ fontSize: '12px', margin: '4px 0 0 0', opacity: 0.7 }}>
              点击上方按钮添加第一个时间笔记
            </p>
          </div>
        ) : (
          grouped.map(group => {
            const isExpanded = expandedYears.has(group.year);

            return (
              <div key={group.year} style={{ borderBottom: '1px solid #e5e7eb' }}>
                <div
                  onClick={() => toggleYear(group.year)}
                  style={{
                    padding: '10px 16px',
                    background: '#f3f4f6',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    cursor: 'pointer',
                    userSelect: 'none'
                  }}
                >
                  {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                  <span style={{ fontWeight: 600, fontSize: '14px' }}>
                    {group.year === 0 ? '未知年份' : `${group.year}年`}
                  </span>
                  <span style={{
                    fontSize: '12px',
                    color: '#6b7280',
                    marginLeft: 'auto'
                  }}>
                    {group.notes.length} 条
                  </span>
                </div>

                {isExpanded && (
                  <div>
                    {group.notes.map(note => {
                      const isSelected = selectedNotes.has(note.id);
                      const isEditingThis = editingNoteId === note.id;
                      
                      return (
                        <div
                          key={note.id}
                          onClick={(e) => handleNoteClick(note, e)}
                          style={{
                            padding: '12px 16px',
                            background: isSelected ? '#f0f9ff' : '#fff',
                            borderTop: isSelected ? '2px solid #8b5cf6' : 'none',
                            borderLeft: isSelected ? '2px solid #8b5cf6' : 'none',
                            borderRight: isSelected ? '2px solid #8b5cf6' : 'none',
                            borderBottom: isSelected ? '2px solid #8b5cf6' : '1px solid #f3f4f6',
                            cursor: 'pointer',
                            transition: 'background 0.15s'
                          }}
                        >
                          <div style={{
                            display: 'flex',
                            alignItems: 'flex-start',
                            gap: '8px',
                            marginBottom: '4px'
                          }}>
                            <div style={{
                              width: '18px',
                              height: '18px',
                              borderRadius: '4px',
                              border: isSelected ? '2px solid #8b5cf6' : '2px solid #d1d5db',
                              background: isSelected ? '#8b5cf6' : 'transparent',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              flexShrink: 0,
                              marginTop: '2px'
                            }}>
                              {isSelected && <Check size={12} style={{ color: 'white' }} />}
                            </div>
                            <div
                              style={{
                                width: '8px',
                                height: '8px',
                                borderRadius: '50%',
                                background: getImportanceColor(note.importance),
                                marginTop: '5px',
                                flexShrink: 0
                              }}
                            />
                            <h4 style={{
                              margin: 0,
                              fontSize: '14px',
                              fontWeight: 500,
                              flex: 1,
                              lineHeight: 1.4
                            }}>
                              {note.event_title}
                            </h4>
                            <div style={{ display: 'flex', gap: '4px' }}>
                              <button
                                onClick={(e) => handleStartEditTags(note, e)}
                                style={{
                                  padding: '4px',
                                  background: 'transparent',
                                  border: 'none',
                                  cursor: 'pointer',
                                  borderRadius: '4px',
                                  color: '#8b5cf6'
                                }}
                                title="编辑标签"
                              >
                                <Tag size={14} />
                              </button>
                              <button
                                onClick={(e) => handleEditNote(note, e)}
                                style={{
                                  padding: '4px',
                                  background: 'transparent',
                                  border: 'none',
                                  cursor: 'pointer',
                                  borderRadius: '4px',
                                  color: '#6b7280'
                                }}
                                title="编辑"
                              >
                                <Edit3 size={14} />
                              </button>
                              <button
                                onClick={(e) => handleDeleteClick(note, e)}
                                style={{
                                  padding: '4px',
                                  background: 'transparent',
                                  border: 'none',
                                  cursor: 'pointer',
                                  borderRadius: '4px',
                                  color: '#ef4444'
                                }}
                                title="删除"
                              >
                                <Trash2 size={14} />
                              </button>
                            </div>
                          </div>

                          {note.event_description && (
                            <p style={{
                              margin: '4px 0 8px 34px',
                              fontSize: '13px',
                              color: '#6b7280',
                              lineHeight: 1.4,
                              display: '-webkit-box',
                              WebkitLineClamp: 2,
                              WebkitBoxOrient: 'vertical',
                              overflow: 'hidden'
                            }}>
                              {note.event_description}
                            </p>
                          )}

                          <div style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '12px',
                            marginLeft: '34px',
                            fontSize: '12px',
                            color: '#9ca3af'
                          }}>
                            <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                              <Clock size={12} />
                              {getDateDisplay(note)}
                            </span>
                            {hasPageInfo(note) && (
                              <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                第 {note.page_number} 页
                              </span>
                            )}
                          </div>

                          {isEditingThis ? (
                            <div style={{
                              marginTop: '10px',
                              marginLeft: '34px',
                              padding: '10px',
                              background: '#f8fafc',
                              borderRadius: '6px',
                              border: '1px solid #e5e7eb'
                            }}>
                              <div style={{ fontSize: '12px', fontWeight: 500, marginBottom: '6px' }}>编辑标签</div>
                              <div style={{ display: 'flex', gap: '6px', marginBottom: '8px' }}>
                                <input
                                  type="text"
                                  value={tagInput}
                                  onChange={(e) => setTagInput(e.target.value)}
                                  onKeyPress={(e) => e.key === 'Enter' && handleAddTagToNote()}
                                  placeholder="输入标签"
                                  style={{
                                    flex: 1,
                                    padding: '6px',
                                    border: '1px solid #e5e7eb',
                                    borderRadius: '4px',
                                    fontSize: '12px'
                                  }}
                                />
                                <button
                                  onClick={handleAddTagToNote}
                                  style={{
                                    padding: '6px 10px',
                                    background: '#8b5cf6',
                                    color: 'white',
                                    border: 'none',
                                    borderRadius: '4px',
                                    fontSize: '12px',
                                    cursor: 'pointer'
                                  }}
                                >
                                  添加
                                </button>
                              </div>
                              {editingTags.length > 0 && (
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', marginBottom: '8px' }}>
                                  {editingTags.map((tag, index) => (
                                    <span key={index} style={{
                                      background: '#8b5cf6',
                                      color: 'white',
                                      padding: '2px 8px',
                                      borderRadius: '12px',
                                      fontSize: '11px',
                                      display: 'flex',
                                      alignItems: 'center',
                                      gap: '4px'
                                    }}>
                                      {tag}
                                      <button
                                        onClick={() => handleRemoveTagFromNote(tag)}
                                        style={{
                                          background: 'none',
                                          border: 'none',
                                          color: 'white',
                                          cursor: 'pointer',
                                          padding: 0,
                                          fontSize: '12px'
                                        }}
                                      >
                                        ×
                                      </button>
                                    </span>
                                  ))}
                                </div>
                              )}
                              <div style={{ display: 'flex', gap: '6px' }}>
                                <button
                                  onClick={handleSaveNoteTags}
                                  style={{
                                    padding: '6px 12px',
                                    background: '#10b981',
                                    color: 'white',
                                    border: 'none',
                                    borderRadius: '4px',
                                    fontSize: '12px',
                                    cursor: 'pointer'
                                  }}
                                >
                                  保存
                                </button>
                                <button
                                  onClick={() => {
                                    setEditingNoteId(null);
                                    setEditingTags([]);
                                  }}
                                  style={{
                                    padding: '6px 12px',
                                    background: '#f3f4f6',
                                    color: '#374151',
                                    border: 'none',
                                    borderRadius: '4px',
                                    fontSize: '12px',
                                    cursor: 'pointer'
                                  }}
                                >
                                  取消
                                </button>
                              </div>
                            </div>
                          ) : (
                            note.tags && note.tags.length > 0 && (
                              <div style={{
                                display: 'flex',
                                flexWrap: 'wrap',
                                gap: '4px',
                                marginTop: '8px',
                                marginLeft: '34px'
                              }}>
                                {note.tags.map((tag, index) => (
                                  <span
                                    key={index}
                                    style={{
                                      fontSize: '11px',
                                      padding: '2px 6px',
                                      background: '#e0e7ff',
                                      color: '#4338ca',
                                      borderRadius: '4px',
                                      display: 'flex',
                                      alignItems: 'center',
                                      gap: '2px'
                                    }}
                                  >
                                    <Tag size={10} />
                                    {tag}
                                  </span>
                                ))}
                              </div>
                            )
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      <TimelineNoteModal
        isOpen={isModalOpen}
        onClose={() => {
          setIsModalOpen(false);
          setSelectedNote(null);
        }}
        onEventAdded={() => {
          loadNotes();
          setIsModalOpen(false);
        }}
        onEventUpdated={() => {
          loadNotes();
          setIsModalOpen(false);
        }}
        selectedEvent={selectedNote}
        documentId={documentId}
        currentPage={currentPage}
      />

      <ConfirmDialog
        isOpen={deleteConfirm.isOpen}
        title="确认删除"
        message={`确定要删除笔记"${deleteConfirm.noteTitle}"吗？此操作无法撤销。`}
        confirmText="删除"
        cancelText="取消"
        type="delete"
        onConfirm={handleConfirmDelete}
        onCancel={() => setDeleteConfirm({ isOpen: false, noteId: '', noteTitle: '' })}
      />

      <DraggableTimelineWindow
        isOpen={isAIModalOpen}
        onClose={() => setIsAIModalOpen(false)}
        documentId={documentId}
        documentTitle={undefined}
        onSuccess={() => {
          loadNotes();
        }}
      />
    </div>
  );
};

export default DocumentTimelineNotes;
