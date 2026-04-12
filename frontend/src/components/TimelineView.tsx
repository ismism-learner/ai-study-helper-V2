import React, { useMemo, useState, useEffect, useRef } from 'react';
import { TimelineEntry, BookDocument, Country, TimePeriod } from '../types';
import { Calendar, Trash2, ChevronUp, ChevronDown, Edit3, X, Save, CheckSquare, Square, Plus, Tag } from 'lucide-react';
import ConfirmDialog from './ConfirmDialog';
import { bookApi, countryApi, timePeriodApi } from '../api';

interface TimelineViewProps {
  timeline: TimelineEntry[];
  onBookClick: (book: BookDocument) => void;
  onDeleteBook: (bookId: string) => void;
  onBooksUpdated?: () => void;
  editMode?: boolean;
}

const TimelineView: React.FC<TimelineViewProps> = ({ 
  timeline, 
  onBookClick, 
  onDeleteBook,
  onBooksUpdated,
  editMode = false,
}) => {
  const [expandedYears, setExpandedYears] = useState<Set<number>>(new Set());
  const [deleteConfirm, setDeleteConfirm] = useState<{
    isOpen: boolean;
    bookId: string;
    bookTitle: string;
  }>({
    isOpen: false,
    bookId: '',
    bookTitle: '',
  });

  const [editingBook, setEditingBook] = useState<BookDocument | null>(null);
  const [editForm, setEditForm] = useState<Partial<BookDocument>>({});
  const [editFileName, setEditFileName] = useState<string>('');
  const [countries, setCountries] = useState<Country[]>([]);
  const [timePeriods, setTimePeriods] = useState<TimePeriod[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [selectedThemePeriodId, setSelectedThemePeriodId] = useState<string | null>(null);
  const [selectedContentPeriodId, setSelectedContentPeriodId] = useState<string | null>(null);
  
  const [selectedBooks, setSelectedBooks] = useState<Set<string>>(new Set());
  const [showBatchEdit, setShowBatchEdit] = useState(false);
  const [batchEditForm, setBatchEditForm] = useState<{
    country_id: string | null;
    time_period_id: string | null;
    theme_year_start: number | null;
    theme_year_end: number | null;
    content_era_start: number | null;
    content_era_end: number | null;
    tags: string[] | null;
  }>({
    country_id: null,
    time_period_id: null,
    theme_year_start: null,
    theme_year_end: null,
    content_era_start: null,
    content_era_end: null,
    tags: null,
  });
  const [batchTimePeriods, setBatchTimePeriods] = useState<TimePeriod[]>([]);
  const [batchThemePeriodId, setBatchThemePeriodId] = useState<string | null>(null);
  const [batchContentPeriodId, setBatchContentPeriodId] = useState<string | null>(null);
  
  const [showCreatePeriod, setShowCreatePeriod] = useState(false);
  const [newPeriodForm, setNewPeriodForm] = useState<{
    name: string;
    start_year: number | null;
    end_year: number | null;
    description: string;
    parent_id: string | null;
  }>({
    name: '',
    start_year: null,
    end_year: null,
    description: '',
    parent_id: null,
  });
  
  const [allTags, setAllTags] = useState<string[]>([]);
  const [newTag, setNewTag] = useState('');
  const [showTagSuggestions, setShowTagSuggestions] = useState(false);
  const [tagHistory, setTagHistory] = useState<string[]>([]);
  const [tagInputFocus, setTagInputFocus] = useState(false);
  const tagInputFocusTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (tagInputFocusTimeoutRef.current) {
        clearTimeout(tagInputFocusTimeoutRef.current);
      }
    };
  }, []);

  const sortedTimeline = useMemo(() => 
    [...timeline].sort((a, b) => a.year - b.year), 
    [timeline]
  );

  useEffect(() => {
    loadCountries();
    loadAllTags();
    loadTagHistory();
  }, []);

  const loadTagHistory = () => {
    const stored = localStorage.getItem('tagHistory');
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
    localStorage.setItem('tagHistory', JSON.stringify(updated));
  };

  const loadAllTags = async () => {
    try {
      const response = await bookApi.getTags();
      setAllTags(response.data.tags);
    } catch (error) {
      console.error('Failed to load tags:', error);
    }
  };

  useEffect(() => {
    // 确保所有年份都展开，无论是否在编辑模式
    setExpandedYears(new Set(sortedTimeline.map(e => e.year)));
  }, [sortedTimeline]);

  const loadCountries = async () => {
    try {
      const response = await countryApi.list();
      setCountries(response.data);
    } catch (error) {
      console.error('Failed to load countries:', error);
    }
  };

  const loadTimePeriods = async (countryId?: string) => {
    try {
      const response = await timePeriodApi.list(countryId);
      setTimePeriods(response.data);
    } catch (error) {
      console.error('Failed to load time periods:', error);
    }
  };

  const handleCountryChange = (countryId: string | null) => {
    setEditForm({ ...editForm, country_id: countryId, time_period_id: null });
    if (countryId) {
      loadTimePeriods(countryId);
    } else {
      setTimePeriods([]);
    }
  };

  const getYearLabel = (year: number): string => {
    if (year === -999999) return '未归档书籍';
    if (year === 0) return '公元元年';
    if (year < 0) return `公元前${Math.abs(year)}年`;
    return `${year}年`;
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

  const handleDeleteClick = (e: React.MouseEvent, bookId: string, bookTitle: string) => {
    e.stopPropagation();
    setDeleteConfirm({
      isOpen: true,
      bookId,
      bookTitle,
    });
  };

  const handleConfirmDelete = () => {
    onDeleteBook(deleteConfirm.bookId);
    setDeleteConfirm({ isOpen: false, bookId: '', bookTitle: '' });
  };

  const handleCancelDelete = () => {
    setDeleteConfirm({ isOpen: false, bookId: '', bookTitle: '' });
  };

  const handleEditClick = async (e: React.MouseEvent, book: BookDocument) => {
    e.stopPropagation();
    setEditingBook(book);
    setEditForm({
      country_id: book.country_id,
      time_period_id: book.time_period_id,
      theme_year_start: book.theme_year_start,
      theme_year_end: book.theme_year_end,
      content_era_start: book.content_era_start,
      content_era_end: book.content_era_end,
      tags: book.tags || [],
      title: book.title,
      author: book.author,
    });
    setEditFileName(book.file_path ? book.file_path.split('/').pop() || '' : '');
    setSelectedThemePeriodId(null);
    setSelectedContentPeriodId(null);
    if (book.country_id) {
      await loadTimePeriods(book.country_id);
    } else {
      setTimePeriods([]);
    }
  };

  const handleTimePeriodChange = (periodId: string | null) => {
    if (!periodId) {
      setEditForm({ ...editForm, time_period_id: null });
      return;
    }
    const period = timePeriods.find(p => p.id === periodId);
    if (period) {
      setEditForm({
        ...editForm,
        time_period_id: periodId,
      });
    }
  };

  const handleThemePeriodChange = (periodId: string | null) => {
    setSelectedThemePeriodId(periodId);
    if (!periodId) {
      return;
    }
    const period = timePeriods.find(p => p.id === periodId);
    if (period) {
      setEditForm({
        ...editForm,
        theme_year_start: period.start_year,
        theme_year_end: period.end_year,
      });
    }
  };

  const handleContentPeriodChange = (periodId: string | null) => {
    setSelectedContentPeriodId(periodId);
    if (!periodId) {
      return;
    }
    const period = timePeriods.find(p => p.id === periodId);
    if (period) {
      setEditForm({
        ...editForm,
        content_era_start: period.start_year,
        content_era_end: period.end_year,
      });
    }
  };

  const handleSaveEdit = async () => {
    if (!editingBook) return;
    
    setIsSaving(true);
    try {
      console.log('Saving book with data:', editForm);
      console.log('Tags to save:', editForm.tags);
      
      if (editForm.tags) {
        editForm.tags.forEach(tag => saveTagToHistory(tag));
      }
      
      await bookApi.update(editingBook.id, editForm);
      
      const originalFileName = editingBook.file_path ? editingBook.file_path.split('/').pop() : '';
      if (editFileName && editFileName !== originalFileName) {
        try {
          await bookApi.renameFile(editingBook.id, editFileName);
        } catch (renameError) {
          console.error('Failed to rename file:', renameError);
        }
      }
      
      console.log('Save response: success');
      await loadAllTags();
      if (onBooksUpdated) {
        onBooksUpdated();
      }
    } catch (error) {
      console.error('Failed to update book:', error);
    } finally {
      setIsSaving(false);
    }
  };

  const toggleBookSelection = (e: React.MouseEvent, bookId: string) => {
    e.stopPropagation();
    setSelectedBooks(prev => {
      const newSet = new Set(prev);
      if (newSet.has(bookId)) {
        newSet.delete(bookId);
      } else {
        newSet.add(bookId);
      }
      return newSet;
    });
  };

  const selectAllBooks = () => {
    const allBookIds = sortedTimeline.flatMap(entry => entry.books.map(book => book.id));
    setSelectedBooks(new Set(allBookIds));
  };

  const clearSelection = () => {
    setSelectedBooks(new Set());
  };

  const handleBatchCountryChange = async (countryId: string | null) => {
    setBatchEditForm({ ...batchEditForm, country_id: countryId, time_period_id: null });
    setBatchThemePeriodId(null);
    setBatchContentPeriodId(null);
    if (countryId) {
      try {
        const response = await timePeriodApi.list(countryId);
        setBatchTimePeriods(response.data);
      } catch (error) {
        console.error('Failed to load time periods:', error);
      }
    } else {
      setBatchTimePeriods([]);
    }
  };

  const handleBatchThemePeriodChange = (periodId: string | null) => {
    setBatchThemePeriodId(periodId);
    if (!periodId) {
      return;
    }
    const period = batchTimePeriods.find(p => p.id === periodId);
    if (period) {
      setBatchEditForm({
        ...batchEditForm,
        theme_year_start: period.start_year,
        theme_year_end: period.end_year,
      });
    }
  };

  const handleBatchContentPeriodChange = (periodId: string | null) => {
    setBatchContentPeriodId(periodId);
    if (!periodId) {
      return;
    }
    const period = batchTimePeriods.find(p => p.id === periodId);
    if (period) {
      setBatchEditForm({
        ...batchEditForm,
        content_era_start: period.start_year,
        content_era_end: period.end_year,
      });
    }
  };

  const handleCreatePeriod = async () => {
    if (!editingBook?.country_id || !newPeriodForm.name) {
      alert('请先选择国家并填写历史时期名称');
      return;
    }
    
    setIsSaving(true);
    try {
      await timePeriodApi.create({
        name: newPeriodForm.name,
        start_year: newPeriodForm.start_year || undefined,
        end_year: newPeriodForm.end_year || undefined,
        country_id: editingBook.country_id,
        parent_id: newPeriodForm.parent_id || undefined,
        description: newPeriodForm.description || undefined,
      });
      
      await loadTimePeriods(editingBook.country_id);
      setShowCreatePeriod(false);
      setNewPeriodForm({
        name: '',
        start_year: null,
        end_year: null,
        description: '',
        parent_id: null,
      });
    } catch (error) {
      console.error('Failed to create time period:', error);
      alert('创建历史时期失败');
    } finally {
      setIsSaving(false);
    }
  };

  const handleBatchEdit = async () => {
    if (selectedBooks.size === 0) return;
    
    setIsSaving(true);
    try {
      const updateData: any = {};
      
      if (batchEditForm.country_id) {
        updateData.country_id = batchEditForm.country_id;
      }
      if (batchEditForm.time_period_id) {
        updateData.time_period_id = batchEditForm.time_period_id;
      }
      if (batchEditForm.theme_year_start) {
        updateData.theme_year_start = batchEditForm.theme_year_start;
      }
      if (batchEditForm.theme_year_end) {
        updateData.theme_year_end = batchEditForm.theme_year_end;
      }
      if (batchEditForm.content_era_start) {
        updateData.content_era_start = batchEditForm.content_era_start;
      }
      if (batchEditForm.content_era_end) {
        updateData.content_era_end = batchEditForm.content_era_end;
      }
      if (batchEditForm.tags && batchEditForm.tags.length > 0) {
        updateData.tags = batchEditForm.tags;
      }
      
      console.log('Batch update data:', updateData);
      
      if (Object.keys(updateData).length === 0) {
        alert('请至少修改一个字段');
        setIsSaving(false);
        return;
      }
      
      const updatePromises = Array.from(selectedBooks).map(bookId => 
        bookApi.update(bookId, updateData)
      );
      await Promise.all(updatePromises);
      setShowBatchEdit(false);
      setSelectedBooks(new Set());
      await loadAllTags();
      if (onBooksUpdated) {
        onBooksUpdated();
      }
    } catch (error) {
      console.error('Failed to batch update books:', error);
      alert('批量更新失败');
    } finally {
      setIsSaving(false);
    }
  };

  if (timeline.length === 0) {
    return (
      <div className="timeline-empty">
        <Calendar size={48} strokeWidth={1} />
        <p>暂无年表数据</p>
      </div>
    );
  }

  return (
    <div className="simple-timeline-view">
      {editMode && (
        <div className="batch-edit-bar">
          <div className="selection-info">
            <span>已选择 {selectedBooks.size} 本书</span>
            <button className="btn btn-secondary btn-sm" onClick={selectAllBooks}>
              全选
            </button>
            <button className="btn btn-secondary btn-sm" onClick={clearSelection}>
              清空
            </button>
          </div>
          {selectedBooks.size > 0 && (
            <button className="btn btn-primary btn-sm" onClick={() => setShowBatchEdit(true)}>
              <Edit3 size={14} />
              批量编辑
            </button>
          )}
        </div>
      )}

      <div className="timeline-container">
        {sortedTimeline.map(entry => {
          const isExpanded = expandedYears.has(entry.year);
          
          return (
            <div key={entry.year} className="timeline-year-group">
              <div 
                className="timeline-year-header"
                onClick={() => toggleYear(entry.year)}
              >
                <div className="year-marker">
                  <Calendar size={14} />
                </div>
                <div className="year-label">{getYearLabel(entry.year)}</div>
                <div className="book-count">{entry.books.length} 本书</div>
                <div className="expand-icon">
                  {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                </div>
              </div>
              
              {isExpanded && (
                <div className="timeline-events-list">
                  {entry.books.map((book, idx) => {
                    const isSelected = selectedBooks.has(book.id);
                    const isLast = idx === entry.books.length - 1;
                    
                    return (
                      <div 
                        key={book.id}
                        className={`timeline-event-item ${isSelected ? 'selected' : ''}`}
                        onClick={(e) => {
                          if (editMode) {
                            toggleBookSelection(e, book.id);
                          } else {
                            onBookClick(book);
                          }
                        }}
                      >
                        <div className="event-connector">
                          <div className="connector-dot" />
                          {!isLast && <div className="connector-line" />}
                        </div>
                        <div className={`event-content-card event-card ${editMode ? 'importance-medium' : ''}`}>
                          {editMode && (
                            <div style={{ position: 'absolute', top: 10, right: 10 }}>
                              {isSelected ? (
                                <CheckSquare size={18} style={{ color: 'var(--primary-color)' }} />
                              ) : (
                                <Square size={18} style={{ color: 'var(--text-muted)' }} />
                              )}
                            </div>
                          )}
                          <div className="event-date-badge">
                            <Calendar size={11} />
                            {getYearLabel(entry.year)}
                            {book.author && <span style={{ marginLeft: 4 }}>{book.author}</span>}
                          </div>
                          <h4 className="event-name">{book.title}</h4>
                          {(book.tags && book.tags.length > 0) && (
                            <div className="event-tag-list">
                              {book.tags.slice(0, 4).map((tag, i) => (
                                <span key={i} className="tag-item">{tag}</span>
                              ))}
                              {book.tags.length > 4 && (
                                <span className="tag-item">+{book.tags.length - 4}</span>
                              )}
                            </div>
                          )}
                          {!editMode && (
                            <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                              <button
                                className="action-btn edit-btn"
                                onClick={(e) => handleEditClick(e, book)}
                                title="编辑"
                                style={{
                                  width: 26, height: 26, display: 'flex',
                                  alignItems: 'center', justifyContent: 'center',
                                  border: 'none', background: 'none',
                                  color: 'var(--text-muted)', cursor: 'pointer',
                                  borderRadius: 4,
                                }}
                              >
                                <Edit3 size={14} />
                              </button>
                              <button
                                className="action-btn delete-btn"
                                onClick={(e) => handleDeleteClick(e, book.id, book.title)}
                                title="删除"
                                style={{
                                  width: 26, height: 26, display: 'flex',
                                  alignItems: 'center', justifyContent: 'center',
                                  border: 'none', background: 'none',
                                  color: 'var(--text-muted)', cursor: 'pointer',
                                  borderRadius: 4,
                                }}
                              >
                                <Trash2 size={14} />
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <ConfirmDialog
        isOpen={deleteConfirm.isOpen}
        title="确认删除"
        message={`确定要删除书籍"${deleteConfirm.bookTitle}"吗？此操作无法撤销。`}
        confirmText="删除"
        cancelText="取消"
        type="delete"
        onConfirm={handleConfirmDelete}
        onCancel={handleCancelDelete}
      />

      {editingBook && (
        <div className="edit-book-modal">
          <div className="edit-book-content">
            <div className="edit-book-header">
              <h3>编辑书籍信息</h3>
              <button className="close-btn" onClick={() => setEditingBook(null)}>
                <X size={20} />
              </button>
            </div>
            <div className="edit-book-body">
              <div className="form-group">
                <label>书籍标题</label>
                <input
                  type="text"
                  value={editForm.title || editingBook.title}
                  onChange={(e) => setEditForm({ ...editForm, title: e.target.value })}
                />
              </div>

              <div className="form-group">
                <label>作者</label>
                <input
                  type="text"
                  value={editForm.author || editingBook.author || ''}
                  onChange={(e) => setEditForm({ ...editForm, author: e.target.value })}
                  placeholder="输入作者名称"
                />
              </div>

              <div className="form-group">
                <label>文件名</label>
                <input
                  type="text"
                  value={editFileName}
                  onChange={(e) => setEditFileName(e.target.value)}
                  placeholder="PDF文件名（含.pdf后缀）"
                />
                <small className="form-hint">修改后将重命名实际文件</small>
              </div>

              <div className="form-group">
                <label>主题国家</label>
                <select
                  value={editForm.country_id || ''}
                  onChange={(e) => handleCountryChange(e.target.value || null)}
                >
                  <option value="">未选择</option>
                  {countries.map(country => (
                    <option key={country.id} value={country.id}>
                      {country.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="form-group">
                <label>作者所在的历史时期</label>
                <div className="select-with-button">
                  <select
                    value={editForm.time_period_id || ''}
                    onChange={(e) => handleTimePeriodChange(e.target.value || null)}
                    disabled={!editForm.country_id}
                  >
                    <option value="">{editForm.country_id ? '未选择' : '请先选择国家'}</option>
                    {timePeriods.map(period => (
                      <option key={period.id} value={period.id}>
                        {period.name} ({period.start_year && getYearLabel(period.start_year)}{period.start_year && period.end_year && ' - '}{period.end_year && getYearLabel(period.end_year)})
                      </option>
                    ))}
                  </select>
                  {editForm.country_id && (
                    <button
                      type="button"
                      className="btn-icon"
                      onClick={() => setShowCreatePeriod(true)}
                      title="创建新历史时期"
                    >
                      <Plus size={16} />
                    </button>
                  )}
                </div>
              </div>

              <div className="form-group">
                <label>书籍主题的历史时期</label>
                <div className="select-with-button">
                  <select
                    value={selectedThemePeriodId || ''}
                    onChange={(e) => handleThemePeriodChange(e.target.value || null)}
                    disabled={!editForm.country_id}
                  >
                    <option value="">{editForm.country_id ? '未选择' : '请先选择国家'}</option>
                    {timePeriods.map(period => (
                      <option key={period.id} value={period.id}>
                        {period.name} ({period.start_year && getYearLabel(period.start_year)}{period.start_year && period.end_year && ' - '}{period.end_year && getYearLabel(period.end_year)})
                      </option>
                    ))}
                  </select>
                  {editForm.country_id && (
                    <button
                      type="button"
                      className="btn-icon"
                      onClick={() => setShowCreatePeriod(true)}
                      title="创建新历史时期"
                    >
                      <Plus size={16} />
                    </button>
                  )}
                </div>
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label>主题起始年代</label>
                  <input
                    type="number"
                    placeholder="如：-500"
                    value={editForm.theme_year_start || ''}
                    onChange={(e) => setEditForm({ ...editForm, theme_year_start: e.target.value ? parseInt(e.target.value) : null })}
                  />
                </div>
                <div className="form-group">
                  <label>主题结束年代</label>
                  <input
                    type="number"
                    placeholder="如：2024"
                    value={editForm.theme_year_end || ''}
                    onChange={(e) => setEditForm({ ...editForm, theme_year_end: e.target.value ? parseInt(e.target.value) : null })}
                  />
                </div>
              </div>

              <div className="form-group">
                <label>书籍内容的历史时期</label>
                <div className="select-with-button">
                  <select
                    value={selectedContentPeriodId || ''}
                    onChange={(e) => handleContentPeriodChange(e.target.value || null)}
                    disabled={!editForm.country_id}
                  >
                    <option value="">{editForm.country_id ? '未选择' : '请先选择国家'}</option>
                    {timePeriods.map(period => (
                      <option key={period.id} value={period.id}>
                        {period.name} ({period.start_year && getYearLabel(period.start_year)}{period.start_year && period.end_year && ' - '}{period.end_year && getYearLabel(period.end_year)})
                      </option>
                    ))}
                  </select>
                  {editForm.country_id && (
                    <button
                      type="button"
                      className="btn-icon"
                      onClick={() => setShowCreatePeriod(true)}
                      title="创建新历史时期"
                    >
                      <Plus size={16} />
                    </button>
                  )}
                </div>
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label>内容起始年代</label>
                  <input
                    type="number"
                    placeholder="如：-500"
                    value={editForm.content_era_start || ''}
                    onChange={(e) => setEditForm({ ...editForm, content_era_start: e.target.value ? parseInt(e.target.value) : null })}
                  />
                </div>
                <div className="form-group">
                  <label>内容结束年代</label>
                  <input
                    type="number"
                    placeholder="如：2024"
                    value={editForm.content_era_end || ''}
                    onChange={(e) => setEditForm({ ...editForm, content_era_end: e.target.value ? parseInt(e.target.value) : null })}
                  />
                </div>
              </div>

              <div className="form-group">
                <label>标签</label>
                <div className="tags-container">
                  {(editForm.tags || []).map((tag, index) => (
                    <div key={index} className="tag-item">
                      <Tag size={12} />
                      <span>{tag}</span>
                      <button
                        type="button"
                        className="tag-remove"
                        onClick={() => {
                          const newTags = [...(editForm.tags || [])];
                          newTags.splice(index, 1);
                          setEditForm({ ...editForm, tags: newTags });
                        }}
                      >
                        <X size={12} />
                      </button>
                    </div>
                  ))}
                </div>
                
                <div className="tag-input-container">
                  <input
                    type="text"
                    placeholder="输入新标签"
                    value={newTag}
                    onChange={(e) => {
                      setNewTag(e.target.value);
                      setShowTagSuggestions(e.target.value.length > 0);
                    }}
                    onFocus={() => setTagInputFocus(true)}
                    onBlur={() => {
                      if (tagInputFocusTimeoutRef.current) {
                        clearTimeout(tagInputFocusTimeoutRef.current);
                      }
                      tagInputFocusTimeoutRef.current = setTimeout(() => setTagInputFocus(false), 200);
                    }}
                    onKeyPress={(e) => {
                      if (e.key === 'Enter' && newTag.trim()) {
                        e.preventDefault();
                        const newTags = [...(editForm.tags || []), newTag.trim()];
                        setEditForm({ ...editForm, tags: newTags });
                        setNewTag('');
                        setShowTagSuggestions(false);
                      }
                    }}
                  />
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    onClick={() => {
                      if (newTag.trim()) {
                        const newTags = [...(editForm.tags || []), newTag.trim()];
                        setEditForm({ ...editForm, tags: newTags });
                        setNewTag('');
                        setShowTagSuggestions(false);
                      }
                    }}
                  >
                    添加
                  </button>
                  
                  {tagInputFocus && tagHistory.length > 0 && !newTag && (
                    <div className="tag-history-dropdown">
                      <div className="tag-history-header">历史标签</div>
                      <div className="tag-history-list">
                        {tagHistory
                          .filter(tag => !(editForm.tags || []).includes(tag))
                          .slice(0, 15)
                          .map((tag, index) => (
                            <button
                              key={index}
                              type="button"
                              className="tag-history-item"
                              onClick={() => {
                                const newTags = [...(editForm.tags || []), tag];
                                setEditForm({ ...editForm, tags: newTags });
                              }}
                            >
                              + {tag}
                            </button>
                          ))}
                      </div>
                    </div>
                  )}
                  
                  {showTagSuggestions && newTag && (
                    <div className="tag-suggestions">
                      {allTags
                        .filter(tag => 
                          tag.toLowerCase().includes(newTag.toLowerCase()) &&
                          !(editForm.tags || []).includes(tag)
                        )
                        .slice(0, 5)
                        .map((tag, index) => (
                          <div
                            key={index}
                            className="tag-suggestion-item"
                            onClick={() => {
                              const newTags = [...(editForm.tags || []), tag];
                              setEditForm({ ...editForm, tags: newTags });
                              setNewTag('');
                              setShowTagSuggestions(false);
                            }}
                          >
                            <Tag size={12} />
                            <span>{tag}</span>
                          </div>
                        ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
            <div className="edit-book-footer">
              <button
                className="btn btn-secondary"
                onClick={() => setEditingBook(null)}
                disabled={isSaving}
              >
                取消
              </button>
              <button
                className="btn btn-primary"
                onClick={handleSaveEdit}
                disabled={isSaving}
              >
                <Save size={16} />
                {isSaving ? '保存中...' : '保存'}
              </button>
            </div>
          </div>
        </div>
      )}

      {showCreatePeriod && (
        <div className="edit-book-modal">
          <div className="edit-book-overlay" onClick={() => setShowCreatePeriod(false)} />
          <div className="edit-book-content">
            <div className="edit-book-header">
              <h3>创建新历史时期</h3>
              <button className="close-btn" onClick={() => setShowCreatePeriod(false)}>
                <X size={20} />
              </button>
            </div>
            <div className="edit-book-body">
              <div className="form-group">
                <label>历史时期名称 *</label>
                <input
                  type="text"
                  placeholder="如：东晋、唐朝、宋朝"
                  value={newPeriodForm.name}
                  onChange={(e) => setNewPeriodForm({ ...newPeriodForm, name: e.target.value })}
                />
              </div>

              <div className="form-group">
                <label>父级历史时期（可选）</label>
                <select
                  value={newPeriodForm.parent_id || ''}
                  onChange={(e) => setNewPeriodForm({ ...newPeriodForm, parent_id: e.target.value || null })}
                >
                  <option value="">无（作为顶级时期）</option>
                  {timePeriods.map(period => (
                    <option key={period.id} value={period.id}>
                      {period.name} ({period.start_year && getYearLabel(period.start_year)}{period.start_year && period.end_year && ' - '}{period.end_year && getYearLabel(period.end_year)})
                    </option>
                  ))}
                </select>
                <p className="form-hint">选择父级时期可创建嵌套结构，如：唐朝 → 贞观之治</p>
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label>起始年代</label>
                  <input
                    type="number"
                    placeholder="如：-500"
                    value={newPeriodForm.start_year || ''}
                    onChange={(e) => setNewPeriodForm({ ...newPeriodForm, start_year: e.target.value ? parseInt(e.target.value) : null })}
                  />
                </div>
                <div className="form-group">
                  <label>结束年代</label>
                  <input
                    type="number"
                    placeholder="如：2024"
                    value={newPeriodForm.end_year || ''}
                    onChange={(e) => setNewPeriodForm({ ...newPeriodForm, end_year: e.target.value ? parseInt(e.target.value) : null })}
                  />
                </div>
              </div>

              <div className="form-group">
                <label>描述说明</label>
                <textarea
                  placeholder="可选：对该历史时期的简要描述"
                  value={newPeriodForm.description}
                  onChange={(e) => setNewPeriodForm({ ...newPeriodForm, description: e.target.value })}
                  rows={3}
                />
              </div>
            </div>
            <div className="edit-book-footer">
              <button
                className="btn btn-secondary"
                onClick={() => setShowCreatePeriod(false)}
                disabled={isSaving}
              >
                取消
              </button>
              <button
                className="btn btn-primary"
                onClick={handleCreatePeriod}
                disabled={isSaving || !newPeriodForm.name}
              >
                <Save size={16} />
                {isSaving ? '创建中...' : '创建'}
              </button>
            </div>
          </div>
        </div>
      )}

      {showBatchEdit && (
        <div className="edit-book-modal">
          <div className="edit-book-overlay" onClick={() => setShowBatchEdit(false)} />
          <div className="edit-book-content">
            <div className="edit-book-header">
              <h3>批量编辑 {selectedBooks.size} 本书</h3>
              <button className="close-btn" onClick={() => setShowBatchEdit(false)}>
                <X size={20} />
              </button>
            </div>
            <div className="edit-book-body">
              <p className="batch-edit-hint">选择要修改的字段，未修改的字段将保持原值</p>

              <div className="form-group">
                <label>主题国家</label>
                <select
                  value={batchEditForm.country_id || ''}
                  onChange={(e) => handleBatchCountryChange(e.target.value || null)}
                >
                  <option value="">不修改</option>
                  {countries.map(country => (
                    <option key={country.id} value={country.id}>
                      {country.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="form-group">
                <label>作者所在的历史时期</label>
                <select
                  value={batchEditForm.time_period_id || ''}
                  onChange={(e) => setBatchEditForm({ ...batchEditForm, time_period_id: e.target.value || null })}
                  disabled={!batchEditForm.country_id}
                >
                  <option value="">{batchEditForm.country_id ? '不修改' : '请先选择国家'}</option>
                  {batchTimePeriods.map(period => (
                    <option key={period.id} value={period.id}>
                      {period.name} ({period.start_year && getYearLabel(period.start_year)}{period.start_year && period.end_year && ' - '}{period.end_year && getYearLabel(period.end_year)})
                    </option>
                  ))}
                </select>
              </div>

              <div className="form-group">
                <label>书籍主题的历史时期</label>
                <select
                  value={batchThemePeriodId || ''}
                  onChange={(e) => handleBatchThemePeriodChange(e.target.value || null)}
                  disabled={!batchEditForm.country_id}
                >
                  <option value="">{batchEditForm.country_id ? '不修改' : '请先选择国家'}</option>
                  {batchTimePeriods.map(period => (
                    <option key={period.id} value={period.id}>
                      {period.name} ({period.start_year && getYearLabel(period.start_year)}{period.start_year && period.end_year && ' - '}{period.end_year && getYearLabel(period.end_year)})
                    </option>
                  ))}
                </select>
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label>主题起始年代</label>
                  <input
                    type="number"
                    placeholder="不修改"
                    value={batchEditForm.theme_year_start || ''}
                    onChange={(e) => setBatchEditForm({ ...batchEditForm, theme_year_start: e.target.value ? parseInt(e.target.value) : null })}
                  />
                </div>
                <div className="form-group">
                  <label>主题结束年代</label>
                  <input
                    type="number"
                    placeholder="不修改"
                    value={batchEditForm.theme_year_end || ''}
                    onChange={(e) => setBatchEditForm({ ...batchEditForm, theme_year_end: e.target.value ? parseInt(e.target.value) : null })}
                  />
                </div>
              </div>

              <div className="form-group">
                <label>书籍内容的历史时期</label>
                <select
                  value={batchContentPeriodId || ''}
                  onChange={(e) => handleBatchContentPeriodChange(e.target.value || null)}
                  disabled={!batchEditForm.country_id}
                >
                  <option value="">{batchEditForm.country_id ? '不修改' : '请先选择国家'}</option>
                  {batchTimePeriods.map(period => (
                    <option key={period.id} value={period.id}>
                      {period.name} ({period.start_year && getYearLabel(period.start_year)}{period.start_year && period.end_year && ' - '}{period.end_year && getYearLabel(period.end_year)})
                    </option>
                  ))}
                </select>
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label>内容起始年代</label>
                  <input
                    type="number"
                    placeholder="不修改"
                    value={batchEditForm.content_era_start || ''}
                    onChange={(e) => setBatchEditForm({ ...batchEditForm, content_era_start: e.target.value ? parseInt(e.target.value) : null })}
                  />
                </div>
                <div className="form-group">
                  <label>内容结束年代</label>
                  <input
                    type="number"
                    placeholder="不修改"
                    value={batchEditForm.content_era_end || ''}
                    onChange={(e) => setBatchEditForm({ ...batchEditForm, content_era_end: e.target.value ? parseInt(e.target.value) : null })}
                  />
                </div>
              </div>

              <div className="form-group">
                <label>标签（可选）</label>
                <div className="tags-container">
                  {(batchEditForm.tags || []).map((tag, index) => (
                    <div key={index} className="tag-item">
                      <Tag size={12} />
                      <span>{tag}</span>
                      <button
                        type="button"
                        className="tag-remove"
                        onClick={() => {
                          const newTags = [...(batchEditForm.tags || [])];
                          newTags.splice(index, 1);
                          setBatchEditForm({ ...batchEditForm, tags: newTags });
                        }}
                      >
                        <X size={12} />
                      </button>
                    </div>
                  ))}
                </div>
                
                <div className="tag-input-container">
                  <input
                    type="text"
                    placeholder="输入标签（可选）"
                    value={newTag}
                    onChange={(e) => {
                      setNewTag(e.target.value);
                      setShowTagSuggestions(e.target.value.length > 0);
                    }}
                    onKeyPress={(e) => {
                      if (e.key === 'Enter' && newTag.trim()) {
                        e.preventDefault();
                        const newTags = [...(batchEditForm.tags || []), newTag.trim()];
                        setBatchEditForm({ ...batchEditForm, tags: newTags });
                        setNewTag('');
                        setShowTagSuggestions(false);
                      }
                    }}
                  />
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    onClick={() => {
                      if (newTag.trim()) {
                        const newTags = [...(batchEditForm.tags || []), newTag.trim()];
                        setBatchEditForm({ ...batchEditForm, tags: newTags });
                        setNewTag('');
                        setShowTagSuggestions(false);
                      }
                    }}
                  >
                    添加
                  </button>
                </div>
                
                {showTagSuggestions && newTag && (
                  <div className="tag-suggestions">
                    {allTags
                      .filter(tag => 
                        tag.toLowerCase().includes(newTag.toLowerCase()) &&
                        !(batchEditForm.tags || []).includes(tag)
                      )
                      .slice(0, 5)
                      .map((tag, index) => (
                        <div
                          key={index}
                          className="tag-suggestion-item"
                          onClick={() => {
                            const newTags = [...(batchEditForm.tags || []), tag];
                            setBatchEditForm({ ...batchEditForm, tags: newTags });
                            setNewTag('');
                            setShowTagSuggestions(false);
                          }}
                        >
                          <Tag size={12} />
                          <span>{tag}</span>
                        </div>
                      ))}
                  </div>
                )}
                <p className="form-hint">留空则不修改标签，添加标签会覆盖原有标签</p>
              </div>
            </div>
            <div className="edit-book-footer">
              <button
                className="btn btn-secondary"
                onClick={() => setShowBatchEdit(false)}
                disabled={isSaving}
              >
                取消
              </button>
              <button
                className="btn btn-primary"
                onClick={handleBatchEdit}
                disabled={isSaving}
              >
                <Save size={16} />
                {isSaving ? '保存中...' : '保存'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default TimelineView;
