import React, { useState, useEffect, useMemo } from 'react';
import { BookDocument, TimePeriod, Country } from '../types';
import { bookApi, timePeriodApi, countryApi, quarkApi } from '../api';
import { 
  BookOpen, Edit2, Trash2, CheckSquare, Square, 
  Clock, X, ChevronDown, Save, ArrowLeft,
  Tag, FolderPlus, Image, Sparkles, AlertCircle, Plus, Minus,
  Cloud, ExternalLink, Loader2, CheckCircle, XCircle, Copy
} from 'lucide-react';
import ConfirmDialog from './ConfirmDialog';
import EditBookBody, { EditBookFormData } from './EditBookBody';

interface BookManageViewProps {
  country: Country;
  onBack: () => void;
  onBookSelect: (book: BookDocument) => void;
}

const TAG_CATEGORIES = {
  basic: {
    name: '基础分类',
    icon: '📚',
    tags: ['历史', '文学', '哲学', '科技', '艺术', '宗教', '政治', '经济', '军事', '地理']
  },
  genre: {
    name: '文学体裁',
    icon: '📖',
    tags: ['小说', '诗歌', '散文', '戏剧', '传记', '古籍', '神话', '童话', '科幻', '武侠']
  },
  history: {
    name: '历史时期',
    icon: '🏛️',
    tags: ['上古', '先秦', '秦汉', '魏晋', '南北朝', '隋唐', '五代', '宋元', '明清', '近代', '现代', '当代', '史前', '古代', '中世纪', '近代早期', '文艺复兴', '启蒙时代', '工业革命', '二战时期', '冷战时期']
  },
  authorEra: {
    name: '作者时代',
    icon: '👤',
    tags: ['先秦', '秦汉', '魏晋南北朝', '隋唐', '宋元', '明清', '近代', '现代', '当代', '古典时期', '中世纪', '文艺复兴', '启蒙时期', '浪漫主义', '现实主义', '现代主义', '后现代']
  },
  authorRegion: {
    name: '作者所属地区',
    icon: '🌍',
    tags: ['中国', '日本', '韩国', '印度', '美国', '英国', '法国', '德国', '俄罗斯', '西班牙', '意大利', '拉美', '阿拉伯世界', '北欧', '东南亚']
  },
  contentRegion: {
    name: '作品涉及地区',
    icon: '🗺️',
    tags: ['中国', '日本', '韩国', '印度', '美国', '英国', '法国', '德国', '俄罗斯', '欧洲', '亚洲', '非洲', '美洲', '中东', '东南亚', '中亚', '地中海', '丝绸之路']
  },
  discipline: {
    name: '学科领域',
    icon: '🔬',
    tags: ['考古', '人类学', '社会学', '心理学', '教育学', '法学', '医学', '生物学', '物理学', '化学', '数学', '工程学', '计算机', '环境科学', '农学']
  },
  theme: {
    name: '主题关键词',
    icon: '💡',
    tags: ['战争', '和平', '革命', '爱情', '友情', '家庭', '成长', '冒险', '悬疑', '恐怖', '幽默', '讽刺', '浪漫', '现实', '神话', '民间传说', '英雄史诗']
  }
};

type TagCategory = keyof typeof TAG_CATEGORIES;

const BookManageView: React.FC<BookManageViewProps> = ({ country, onBack, onBookSelect }) => {
  const [books, setBooks] = useState<BookDocument[]>([]);
  const [timePeriods, setTimePeriods] = useState<TimePeriod[]>([]);
  const [countries, setCountries] = useState<Country[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedBooks, setSelectedBooks] = useState<Set<string>>(new Set());
  const [editingBook, setEditingBook] = useState<BookDocument | null>(null);
  const [showTimePeriodModal, setShowTimePeriodModal] = useState(false);
  const [showNewPeriodModal, setShowNewPeriodModal] = useState(false);
  const [showTagModal, setShowTagModal] = useState(false);
  const [showCoverModal, setShowCoverModal] = useState(false);
  const [filterPeriod, setFilterPeriod] = useState<string>('');
  const [filterTag, setFilterTag] = useState<string>('');
  const [searchTerm, setSearchTerm] = useState('');
  const [isGeneratingCovers, setIsGeneratingCovers] = useState(false);
  
  const [showQuarkModal, setShowQuarkModal] = useState(false);
  const [quarkUploading, setQuarkUploading] = useState(false);
  const [quarkUploadResults, setQuarkUploadResults] = useState<Array<{
    book_id: string;
    book_title: string;
    success: boolean;
    message: string;
    share_url?: string;
    share_password?: string;
  }>>([]);
  
  const [editFormData, setEditFormData] = useState<EditBookFormData | null>(null);

  const [newPeriodForm, setNewPeriodForm] = useState({
    name: '',
    start_year: '',
    end_year: '',
  });

  const [tagForm, setTagForm] = useState({
    mode: 'add' as 'add' | 'replace' | 'remove',
    tags: '',
  });
  
  const [expandedCategories, setExpandedCategories] = useState<Set<TagCategory>>(new Set(['basic']));
  const [tagSearchTerm, setTagSearchTerm] = useState('');
  const [tagHistory, setTagHistory] = useState<string[]>([]);

  const [confirmDialog, setConfirmDialog] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    onConfirm: () => void;
  }>({
    isOpen: false,
    title: '',
    message: '',
    onConfirm: () => {},
  });

  useEffect(() => {
    loadData();
    loadTagHistory();
  }, [country.id]);

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

  const loadData = async () => {
    setIsLoading(true);
    try {
      const [booksRes, periodsRes, countriesRes] = await Promise.all([
        countryApi.getBooks(country.id),
        timePeriodApi.list(country.id),
        countryApi.list(),
      ]);
      setBooks(booksRes.data);
      setTimePeriods(periodsRes.data);
      setCountries(countriesRes.data);
    } catch (error) {
      console.error('Failed to load data:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const allTags = useMemo(() => {
    const tagSet = new Set<string>();
    books.forEach(book => {
      book.tags?.forEach(tag => tagSet.add(tag));
    });
    return Array.from(tagSet).sort();
  }, [books]);

  const booksWithoutCover = useMemo(() => {
    return books.filter(b => !b.cover_image);
  }, [books]);

  const booksWithoutTags = useMemo(() => {
    return books.filter(b => !b.tags || b.tags.length === 0);
  }, [books]);

  const toggleSelect = (bookId: string) => {
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

  const toggleSelectAll = () => {
    if (selectedBooks.size === filteredBooks.length) {
      setSelectedBooks(new Set());
    } else {
      setSelectedBooks(new Set(filteredBooks.map(b => b.id)));
    }
  };

  const selectBooksWithoutTags = () => {
    setSelectedBooks(new Set(booksWithoutTags.map(b => b.id)));
  };

  const selectBooksWithoutCover = () => {
    setSelectedBooks(new Set(booksWithoutCover.map(b => b.id)));
  };

  const handleEditBook = (book: BookDocument) => {
    setEditingBook(book);
    setEditFormData(null);
  };

  const handleSaveEdit = async () => {
    if (!editingBook || !editFormData) return;
    
    editFormData.tags.forEach(tag => saveTagToHistory(tag));
    
    try {
      await bookApi.update(editingBook.id, {
        title: editFormData.title,
        author: editFormData.author,
        country_id: editFormData.country_id || undefined,
        theme_year_start: editFormData.theme_year_start ? parseInt(editFormData.theme_year_start) : undefined,
        theme_year_end: editFormData.theme_year_end ? parseInt(editFormData.theme_year_end) : undefined,
        content_era_start: editFormData.content_era_start ? parseInt(editFormData.content_era_start) : undefined,
        content_era_end: editFormData.content_era_end ? parseInt(editFormData.content_era_end) : undefined,
        tags: editFormData.tags,
        time_period_id: editFormData.theme_time_period_id || undefined,
        author_country_id: editFormData.author_country_id || undefined,
        author_time_period_id: editFormData.author_time_period_id || undefined,
      });
      
      const originalFileName = editingBook.file_path ? editingBook.file_path.split('/').pop() : '';
      if (editFormData.file_name && editFormData.file_name !== originalFileName) {
        try {
          await bookApi.renameFile(editingBook.id, editFormData.file_name);
        } catch (renameError) {
          console.error('Failed to rename file:', renameError);
          alert('文件重命名失败，但书籍信息已保存');
        }
      }
      
      setEditingBook(null);
      setEditFormData(null);
      loadData();
    } catch (error) {
      console.error('Failed to save:', error);
      alert('保存失败');
    }
  };

  const handleDeleteBook = (bookId: string, bookTitle: string) => {
    setConfirmDialog({
      isOpen: true,
      title: '确认删除',
      message: `确定要删除书籍"${bookTitle}"吗？此操作无法撤销。`,
      onConfirm: async () => {
        try {
          await bookApi.delete(bookId);
          setConfirmDialog({ ...confirmDialog, isOpen: false });
          loadData();
        } catch (error) {
          console.error('Failed to delete:', error);
          alert('删除失败');
        }
      },
    });
  };

  const handleBatchDelete = () => {
    if (selectedBooks.size === 0) return;
    
    setConfirmDialog({
      isOpen: true,
      title: '批量删除确认',
      message: `确定要删除选中的 ${selectedBooks.size} 本书籍吗？此操作无法撤销。`,
      onConfirm: async () => {
        try {
          await Promise.all(Array.from(selectedBooks).map(id => bookApi.delete(id)));
          setSelectedBooks(new Set());
          setConfirmDialog({ ...confirmDialog, isOpen: false });
          loadData();
        } catch (error) {
          console.error('Failed to delete:', error);
          alert('批量删除失败');
        }
      },
    });
  };

  const handleMoveToPeriod = async (periodId: string) => {
    if (selectedBooks.size === 0) return;
    
    try {
      await Promise.all(
        Array.from(selectedBooks).map(bookId => 
          bookApi.update(bookId, { time_period_id: periodId || undefined })
        )
      );
      setSelectedBooks(new Set());
      setShowTimePeriodModal(false);
      loadData();
    } catch (error) {
      console.error('Failed to move:', error);
      alert('移动失败');
    }
  };

  const handleCreatePeriod = async () => {
    if (!newPeriodForm.name) return;
    
    try {
      await timePeriodApi.create({
        name: newPeriodForm.name,
        start_year: newPeriodForm.start_year ? parseInt(newPeriodForm.start_year) : undefined,
        end_year: newPeriodForm.end_year ? parseInt(newPeriodForm.end_year) : undefined,
        country_id: country.id,
      });
      setShowNewPeriodModal(false);
      setNewPeriodForm({ name: '', start_year: '', end_year: '' });
      loadData();
    } catch (error) {
      console.error('Failed to create period:', error);
      alert('创建时期失败');
    }
  };

  const handleBatchTags = async () => {
    if (selectedBooks.size === 0 || !tagForm.tags.trim()) return;
    
    const newTags = tagForm.tags.split(',').map(t => t.trim()).filter(Boolean);
    
    try {
      await Promise.all(
        Array.from(selectedBooks).map(async bookId => {
          const book = books.find(b => b.id === bookId);
          if (!book) return;
          
          let finalTags: string[];
          if (tagForm.mode === 'add') {
            finalTags = [...new Set([...(book.tags || []), ...newTags])];
          } else if (tagForm.mode === 'remove') {
            finalTags = (book.tags || []).filter(t => !newTags.includes(t));
          } else {
            finalTags = newTags;
          }
          
          await bookApi.update(bookId, { tags: finalTags });
        })
      );
      
      setSelectedBooks(new Set());
      setShowTagModal(false);
      setTagForm({ mode: 'add', tags: '' });
      loadData();
    } catch (error) {
      console.error('Failed to update tags:', error);
      alert('标签更新失败');
    }
  };

  const handleGenerateCovers = async () => {
    const booksToProcess = selectedBooks.size > 0 
      ? books.filter(b => selectedBooks.has(b.id) && !b.cover_image)
      : booksWithoutCover;
    
    if (booksToProcess.length === 0) return;
    
    setIsGeneratingCovers(true);
    
    try {
      await Promise.all(
        booksToProcess.map(async book => {
          try {
            const response = await bookApi.generateCover(book.id);
            if (response.data.cover_image) {
              await bookApi.update(book.id, { cover_image: response.data.cover_image });
            }
          } catch (error) {
            console.error(`Failed to generate cover for ${book.title}:`, error);
          }
        })
      );
      
      setSelectedBooks(new Set());
      setShowCoverModal(false);
      loadData();
    } catch (error) {
      console.error('Failed to generate covers:', error);
      alert('封面生成失败');
    } finally {
      setIsGeneratingCovers(false);
    }
  };

  const handleUploadToQuark = async () => {
    const booksToUpload = selectedBooks.size > 0 
      ? books.filter(b => selectedBooks.has(b.id))
      : books.filter(b => !b.quark_upload_status || b.quark_upload_status === 'not_uploaded');
    
    if (booksToUpload.length === 0) {
      alert('没有需要上传的书籍');
      return;
    }
    
    setQuarkUploading(true);
    setQuarkUploadResults([]);
    
    const booksByTag: Record<string, typeof booksToUpload> = {};
    
    for (const book of booksToUpload) {
      if (book.tags && book.tags.length > 0) {
        const primaryTag = book.tags[0];
        if (!booksByTag[primaryTag]) {
          booksByTag[primaryTag] = [];
        }
        booksByTag[primaryTag].push(book);
      } else {
        if (!booksByTag['未分类']) {
          booksByTag['未分类'] = [];
        }
        booksByTag['未分类'].push(book);
      }
    }
    
    const results: typeof quarkUploadResults = [];
    
    for (const [tag, tagBooks] of Object.entries(booksByTag)) {
      try {
        const response = await quarkApi.uploadByTag(tag, {
          book_ids: tagBooks.map(b => b.id),
        });
        
        if (response.data.success) {
          results.push({
            book_id: `folder-${tag}`,
            book_title: `📁 ${tag} (${response.data.uploaded_count}本)`,
            success: true,
            message: `已上传到 ${response.data.folder_path}`,
            share_url: response.data.share_url || undefined,
            share_password: response.data.share_password || undefined,
          });
          
          for (const bookResult of response.data.results) {
            if (!bookResult.success) {
              results.push({
                book_id: bookResult.book_id,
                book_title: `  └ ${bookResult.book_title}`,
                success: false,
                message: bookResult.message,
              });
            }
          }
        } else {
          for (const book of tagBooks) {
            results.push({
              book_id: book.id,
              book_title: book.title,
              success: false,
              message: response.data.message,
            });
          }
        }
      } catch (error: unknown) {
        const axiosErr = error as { response?: { data?: { detail?: string } } };
        for (const book of tagBooks) {
          results.push({
            book_id: book.id,
            book_title: book.title,
            success: false,
            message: axiosErr.response?.data?.detail || '上传失败',
          });
        }
      }
    }
    
    setQuarkUploadResults(results);
    setQuarkUploading(false);
    loadData();
  };

  const handleCopyShareUrl = (url: string, password?: string) => {
    const text = password ? `${url} 提取码: ${password}` : url;
    navigator.clipboard.writeText(text);
  };

  const filteredBooks = books.filter(book => {
    const matchesSearch = !searchTerm || 
      book.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (book.author && book.author.toLowerCase().includes(searchTerm.toLowerCase()));
    const matchesPeriod = !filterPeriod || book.time_period_id === filterPeriod;
    const matchesTag = !filterTag || (book.tags && book.tags.includes(filterTag));
    return matchesSearch && matchesPeriod && matchesTag;
  });

  const getPeriodName = (periodId?: string) => {
    if (!periodId) return '未分类';
    const period = timePeriods.find(p => p.id === periodId);
    return period ? period.name : '未分类';
  };

  const getBooksByPeriod = (periodId: string) => {
    return books.filter(b => b.time_period_id === periodId);
  };

  if (isLoading) {
    return (
      <div className="book-manage-loading">
        <div className="loading-spinner" />
        <p>加载中...</p>
      </div>
    );
  }

  return (
    <div className="book-manage-view">
      <div className="manage-header">
        <button className="back-btn" onClick={onBack}>
          <ArrowLeft size={20} />
          <span>返回</span>
        </button>
        
        <div className="header-info">
          <h2>{country.name} - 图书管理</h2>
          <span className="book-count">{books.length} 本书籍</span>
        </div>
      </div>

      <div className="manage-toolbar">
        <div className="toolbar-left">
          <div className="search-box">
            <input
              type="text"
              placeholder="搜索书籍..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          
          <select
            value={filterPeriod}
            onChange={(e) => setFilterPeriod(e.target.value)}
            className="period-filter"
          >
            <option value="">全部时期</option>
            {timePeriods.map(period => (
              <option key={period.id} value={period.id}>
                {period.name} ({getBooksByPeriod(period.id).length})
              </option>
            ))}
          </select>

          <select
            value={filterTag}
            onChange={(e) => setFilterTag(e.target.value)}
            className="tag-filter"
          >
            <option value="">全部标签</option>
            {allTags.map(tag => (
              <option key={tag} value={tag}>{tag}</option>
            ))}
          </select>
        </div>

        <div className="toolbar-right">
          {selectedBooks.size > 0 && (
            <>
              <span className="selection-count">
                已选择 {selectedBooks.size} 本
              </span>
              <button
                className="btn btn-secondary"
                onClick={() => setShowTagModal(true)}
              >
                <Tag size={16} />
                批量标签
              </button>
              <button
                className="btn btn-secondary"
                onClick={() => setShowTimePeriodModal(true)}
              >
                <Clock size={16} />
                移动时期
              </button>
              <button
                className="btn btn-danger"
                onClick={handleBatchDelete}
              >
                <Trash2 size={16} />
                删除
              </button>
            </>
          )}
          
          <button
            className="btn btn-secondary"
            onClick={() => setShowCoverModal(true)}
            title={booksWithoutCover.length > 0 ? `${booksWithoutCover.length} 本书缺少封面` : '封面管理'}
          >
            <Image size={16} />
            封面
            {booksWithoutCover.length > 0 && (
              <span className="badge">{booksWithoutCover.length}</span>
            )}
          </button>
          
          <button
            className="btn btn-secondary"
            onClick={() => setShowNewPeriodModal(true)}
          >
            <FolderPlus size={16} />
            新建时期
          </button>
          
          <button
            className="btn btn-secondary"
            onClick={() => setShowQuarkModal(true)}
            title="上传到夸克网盘"
          >
            <Cloud size={16} />
            夸克网盘
          </button>
        </div>
      </div>

      <div className="quick-actions">
        <button 
          className="quick-action-btn"
          onClick={selectBooksWithoutTags}
          disabled={booksWithoutTags.length === 0}
        >
          <AlertCircle size={14} />
          选择无标签书籍 ({booksWithoutTags.length})
        </button>
        <button 
          className="quick-action-btn"
          onClick={selectBooksWithoutCover}
          disabled={booksWithoutCover.length === 0}
        >
          <Image size={14} />
          选择无封面书籍 ({booksWithoutCover.length})
        </button>
      </div>

      <div className="manage-content">
        {filteredBooks.length === 0 ? (
          <div className="empty-state">
            <BookOpen size={64} strokeWidth={1} />
            <h3>暂无书籍</h3>
            <p>请先上传书籍</p>
          </div>
        ) : (
          <div className="book-table">
            <div className="table-header">
              <div className="col-checkbox">
                <button
                  className={`select-all-btn ${selectedBooks.size === filteredBooks.length ? 'selected' : ''}`}
                  onClick={toggleSelectAll}
                >
                  {selectedBooks.size === filteredBooks.length ? (
                    <CheckSquare size={18} />
                  ) : (
                    <Square size={18} />
                  )}
                </button>
              </div>
              <div className="col-title">书名</div>
              <div className="col-author">作者</div>
              <div className="col-era">作者时代</div>
              <div className="col-tags">标签</div>
              <div className="col-period">时期分类</div>
              <div className="col-actions">操作</div>
            </div>

            <div className="table-body">
              {filteredBooks.map(book => (
                <div 
                  key={book.id} 
                  className={`table-row ${selectedBooks.has(book.id) ? 'selected' : ''} ${!book.cover_image ? 'no-cover' : ''}`}
                >
                  <div className="col-checkbox">
                    <button
                      className={`select-btn ${selectedBooks.has(book.id) ? 'selected' : ''}`}
                      onClick={() => toggleSelect(book.id)}
                    >
                      {selectedBooks.has(book.id) ? (
                        <CheckSquare size={18} />
                      ) : (
                        <Square size={18} />
                      )}
                    </button>
                  </div>
                  <div 
                    className="col-title clickable"
                    onClick={() => onBookSelect(book)}
                  >
                    <BookOpen size={14} />
                    <span>{book.title}</span>
                    {!book.cover_image && (
                      <span className="warning-indicator" title="缺少封面">
                        <Image size={12} />
                      </span>
                    )}
                  </div>
                  <div className="col-author">{book.author || '-'}</div>
                  <div className="col-era">{book.author_era || '-'}</div>
                  <div className="col-tags">
                    {book.tags && book.tags.length > 0 ? (
                      <div className="tags-cell">
                        {book.tags.slice(0, 2).map((tag, i) => (
                          <span key={i} className="mini-tag">{tag}</span>
                        ))}
                        {book.tags.length > 2 && (
                          <span className="more-tags">+{book.tags.length - 2}</span>
                        )}
                      </div>
                    ) : (
                      <span className="no-tags-hint">无标签</span>
                    )}
                  </div>
                  <div className="col-period">
                    <span className="period-tag">{getPeriodName(book.time_period_id ?? undefined)}</span>
                  </div>
                  <div className="col-actions">
                    <button
                      className="action-btn edit"
                      onClick={() => handleEditBook(book)}
                      title="编辑"
                    >
                      <Edit2 size={14} />
                    </button>
                    <button
                      className="action-btn delete"
                      onClick={() => handleDeleteBook(book.id, book.title)}
                      title="删除"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {editingBook && (
        <div className="modal-overlay">
          <div className="edit-book-modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3>
                <Edit2 size={18} />
                编辑书籍信息
              </h3>
              <button className="close-btn" onClick={() => setEditingBook(null)}>
                <X size={20} />
              </button>
            </div>

            <div className="modal-body">
              <EditBookBody
                book={editingBook}
                countries={countries}
                timePeriods={timePeriods}
                tagHistory={tagHistory}
                allTags={allTags}
                onDataChange={(data: EditBookFormData) => setEditFormData(data)}
                onCreateTimePeriod={async (data) => {
                  const response = await timePeriodApi.create({
                    name: data.name,
                    start_year: data.start_year,
                    end_year: data.end_year,
                    country_id: data.country_id
                  });
                  loadData();
                  return response.data;
                }}
              />
            </div>

            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setEditingBook(null)}>
                取消
              </button>
              <button className="btn btn-primary" onClick={handleSaveEdit}>
                <Save size={16} />
                保存
              </button>
            </div>
          </div>
        </div>
      )}

      {showTagModal && (
        <div className="modal-overlay" onClick={() => setShowTagModal(false)}>
          <div className="tag-modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3>
                <Tag size={18} />
                批量修改标签
              </h3>
              <button className="close-btn" onClick={() => setShowTagModal(false)}>
                <X size={20} />
              </button>
            </div>

            <div className="modal-body">
              <div className="tag-modal-info">
                <span className="info-badge">{selectedBooks.size} 本书籍</span>
                <span className="info-text">将被修改标签</span>
              </div>

              <div className="form-group">
                <label>操作方式</label>
                <div className="mode-buttons">
                  <button
                    className={`mode-btn ${tagForm.mode === 'add' ? 'active' : ''}`}
                    onClick={() => setTagForm({ ...tagForm, mode: 'add' })}
                  >
                    <Plus size={14} />
                    添加
                  </button>
                  <button
                    className={`mode-btn ${tagForm.mode === 'replace' ? 'active' : ''}`}
                    onClick={() => setTagForm({ ...tagForm, mode: 'replace' })}
                  >
                    替换
                  </button>
                  <button
                    className={`mode-btn ${tagForm.mode === 'remove' ? 'active' : ''}`}
                    onClick={() => setTagForm({ ...tagForm, mode: 'remove' })}
                  >
                    <Minus size={14} />
                    移除
                  </button>
                </div>
              </div>

              <div className="form-group">
                <label>已选标签</label>
                <div className="selected-tags-display">
                  {tagForm.tags.split(',').map(t => t.trim()).filter(Boolean).length > 0 ? (
                    <div className="selected-tags-list">
                      {tagForm.tags.split(',').map(t => t.trim()).filter(Boolean).map((tag, i) => (
                        <span key={i} className="selected-tag-chip">
                          {tag}
                          <button
                            className="remove-tag"
                            onClick={() => {
                              const tags = tagForm.tags.split(',').map(t => t.trim()).filter(Boolean);
                              const newTags = tags.filter((_, index) => index !== i);
                              setTagForm({ ...tagForm, tags: newTags.join(', ') });
                            }}
                          >
                            <X size={12} />
                          </button>
                        </span>
                      ))}
                    </div>
                  ) : (
                    <span className="no-tags-placeholder">点击下方标签添加</span>
                  )}
                </div>
                <input
                  type="text"
                  className="custom-tag-input"
                  value={tagForm.tags}
                  onChange={(e) => setTagForm({ ...tagForm, tags: e.target.value })}
                  placeholder="或直接输入自定义标签，用逗号分隔"
                />
              </div>

              <div className="form-group">
                <label>快速选择标签</label>
                <input
                  type="text"
                  className="tag-search-input"
                  placeholder="搜索标签..."
                  value={tagSearchTerm}
                  onChange={(e) => setTagSearchTerm(e.target.value)}
                />
              </div>

              <div className="tag-categories-container">
                {(Object.entries(TAG_CATEGORIES) as [TagCategory, typeof TAG_CATEGORIES[TagCategory]][]).map(([key, category]) => {
                  const isExpanded = expandedCategories.has(key);
                  const filteredTags = tagSearchTerm 
                    ? category.tags.filter(tag => tag.toLowerCase().includes(tagSearchTerm.toLowerCase()))
                    : category.tags;
                  
                  if (tagSearchTerm && filteredTags.length === 0) return null;
                  
                  return (
                    <div key={key} className="tag-category">
                      <div 
                        className="category-header"
                        onClick={() => {
                          setExpandedCategories(prev => {
                            const newSet = new Set(prev);
                            if (newSet.has(key)) {
                              newSet.delete(key);
                            } else {
                              newSet.add(key);
                            }
                            return newSet;
                          });
                        }}
                      >
                        <span className="category-icon">{category.icon}</span>
                        <span className="category-name">{category.name}</span>
                        <span className="category-count">{category.tags.length}</span>
                        <ChevronDown 
                          size={16} 
                          className={`category-chevron ${isExpanded ? 'expanded' : ''}`} 
                        />
                      </div>
                      
                      {isExpanded && (
                        <div className="category-tags">
                          {filteredTags.map(tag => {
                            const isSelected = tagForm.tags.split(',').map(t => t.trim()).includes(tag);
                            return (
                              <button
                                key={tag}
                                className={`tag-chip ${isSelected ? 'selected' : ''}`}
                                onClick={() => {
                                  const currentTags = tagForm.tags.split(',').map(t => t.trim()).filter(Boolean);
                                  if (isSelected) {
                                    const newTags = currentTags.filter(t => t !== tag);
                                    setTagForm({ ...tagForm, tags: newTags.join(', ') });
                                  } else {
                                    const newTags = currentTags.length > 0 ? [...currentTags, tag] : [tag];
                                    setTagForm({ ...tagForm, tags: newTags.join(', ') });
                                  }
                                }}
                              >
                                {isSelected ? <CheckSquare size={12} /> : <Square size={12} />}
                                {tag}
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setShowTagModal(false)}>
                取消
              </button>
              <button 
                className="btn btn-primary" 
                onClick={handleBatchTags}
                disabled={!tagForm.tags.trim()}
              >
                应用到 {selectedBooks.size} 本书
              </button>
            </div>
          </div>
        </div>
      )}

      {showCoverModal && (
        <div className="modal-overlay" onClick={() => setShowCoverModal(false)}>
          <div className="cover-modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3>
                <Image size={18} />
                封面管理
              </h3>
              <button className="close-btn" onClick={() => setShowCoverModal(false)}>
                <X size={20} />
              </button>
            </div>

            <div className="modal-body">
              <div className="cover-stats">
                <div className="stat-item">
                  <span className="stat-value">{books.length}</span>
                  <span className="stat-label">总书籍数</span>
                </div>
                <div className="stat-item">
                  <span className="stat-value">{books.length - booksWithoutCover.length}</span>
                  <span className="stat-label">有封面</span>
                </div>
                <div className="stat-item warning">
                  <span className="stat-value">{booksWithoutCover.length}</span>
                  <span className="stat-label">缺少封面</span>
                </div>
              </div>

              {booksWithoutCover.length > 0 && (
                <div className="cover-action">
                  <p className="action-hint">
                    <Sparkles size={16} />
                    自动提取书籍第一页作为封面
                  </p>
                  <p className="action-description">
                    系统将从 PDF 文件的第一页生成压缩后的封面图片
                  </p>
                  <button
                    className="btn btn-primary"
                    onClick={handleGenerateCovers}
                    disabled={isGeneratingCovers}
                  >
                    {isGeneratingCovers ? (
                      <>
                        <span className="spinning">⏳</span>
                        生成中...
                      </>
                    ) : (
                      <>
                        <Image size={16} />
                        为 {booksWithoutCover.length} 本书生成封面
                      </>
                    )}
                  </button>
                </div>
              )}

              {booksWithoutCover.length === 0 && (
                <div className="all-covers-ok">
                  <Image size={48} strokeWidth={1} />
                  <p>所有书籍都已有封面</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {showTimePeriodModal && (
        <div className="modal-overlay" onClick={() => setShowTimePeriodModal(false)}>
          <div className="time-period-modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3>
                <Clock size={18} />
                移动到时期
              </h3>
              <button className="close-btn" onClick={() => setShowTimePeriodModal(false)}>
                <X size={20} />
              </button>
            </div>

            <div className="modal-body">
              <p className="modal-hint">
                将选中的 {selectedBooks.size} 本书籍移动到以下时期：
              </p>
              
              <div className="period-list">
                {timePeriods.map(period => (
                  <button
                    key={period.id}
                    className="period-option"
                    onClick={() => handleMoveToPeriod(period.id)}
                  >
                    <div className="period-info">
                      <span className="period-name">{period.name}</span>
                      {period.start_year !== null && (
                        <span className="period-years">
                          {period.start_year}{period.end_year ? ` - ${period.end_year}` : ' 至今'}
                        </span>
                      )}
                    </div>
                    <span className="period-count">
                      {getBooksByPeriod(period.id).length} 本
                    </span>
                  </button>
                ))}
                
                <button
                  className="period-option unclassified"
                  onClick={() => handleMoveToPeriod('')}
                >
                  <div className="period-info">
                    <span className="period-name">未分类</span>
                  </div>
                  <span className="period-count">
                    {books.filter(b => !b.time_period_id).length} 本
                  </span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showNewPeriodModal && (
        <div className="modal-overlay" onClick={() => setShowNewPeriodModal(false)}>
          <div className="new-period-modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3>
                <FolderPlus size={18} />
                新建时期
              </h3>
              <button className="close-btn" onClick={() => setShowNewPeriodModal(false)}>
                <X size={20} />
              </button>
            </div>

            <div className="modal-body">
              <div className="form-group">
                <label>时期名称 *</label>
                <input
                  type="text"
                  value={newPeriodForm.name}
                  onChange={(e) => setNewPeriodForm({ ...newPeriodForm, name: e.target.value })}
                  placeholder="如：现代、当代、明清时期"
                />
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label>起始年份</label>
                  <input
                    type="number"
                    value={newPeriodForm.start_year}
                    onChange={(e) => setNewPeriodForm({ ...newPeriodForm, start_year: e.target.value })}
                    placeholder="如：1840"
                  />
                </div>

                <div className="form-group">
                  <label>结束年份</label>
                  <input
                    type="number"
                    value={newPeriodForm.end_year}
                    onChange={(e) => setNewPeriodForm({ ...newPeriodForm, end_year: e.target.value })}
                    placeholder="如：1949"
                  />
                </div>
              </div>
            </div>

            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setShowNewPeriodModal(false)}>
                取消
              </button>
              <button 
                className="btn btn-primary" 
                onClick={handleCreatePeriod}
                disabled={!newPeriodForm.name}
              >
                创建
              </button>
            </div>
          </div>
        </div>
      )}

      {showQuarkModal && (
        <div className="modal-overlay" onClick={() => !quarkUploading && setShowQuarkModal(false)}>
          <div className="quark-modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 600, maxHeight: '80vh', overflow: 'auto' }}>
            <div className="modal-header">
              <h3>
                <Cloud size={18} />
                上传到夸克网盘
              </h3>
              <button className="close-btn" onClick={() => !quarkUploading && setShowQuarkModal(false)} disabled={quarkUploading}>
                <X size={20} />
              </button>
            </div>

            <div className="modal-body">
              {quarkUploadResults.length === 0 ? (
                <>
                  <div className="quark-upload-info" style={{ marginBottom: 16 }}>
                    <p style={{ margin: '0 0 8px 0', color: '#666' }}>
                      将书籍上传到夸克网盘，并自动生成分享链接。
                    </p>
                    <p style={{ margin: 0, color: '#666' }}>
                      {selectedBooks.size > 0 
                        ? `已选择 ${selectedBooks.size} 本书籍`
                        : `将上传 ${books.filter(b => !b.quark_upload_status || b.quark_upload_status === 'not_uploaded').length} 本未上传的书籍`
                      }
                    </p>
                  </div>

                  <div style={{ background: '#f8f9fa', padding: 12, borderRadius: 8, marginBottom: 16 }}>
                    <h4 style={{ margin: '0 0 8px 0', fontSize: 14 }}>上传说明：</h4>
                    <ul style={{ margin: 0, paddingLeft: 20, fontSize: 13, color: '#666' }}>
                      <li>书籍将按标签分类上传到「我的电子图书馆/标签名」文件夹</li>
                      <li>每个标签文件夹会生成一个分享链接</li>
                      <li>相同标签的书籍共享同一个文件夹链接</li>
                    </ul>
                  </div>
                </>
              ) : (
                <div className="quark-upload-results">
                  <h4 style={{ margin: '0 0 12px 0', fontSize: 14 }}>上传结果：</h4>
                  {quarkUploadResults.map((result, index) => (
                    <div 
                      key={index}
                      style={{ 
                        padding: 12, 
                        marginBottom: 8, 
                        borderRadius: 8,
                        background: result.success ? '#d4edda' : '#f8d7da',
                        border: `1px solid ${result.success ? '#c3e6cb' : '#f5c6cb'}`
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                        {result.success ? (
                          <CheckCircle size={16} color="#155724" />
                        ) : (
                          <XCircle size={16} color="#721c24" />
                        )}
                        <span style={{ fontWeight: 500, color: result.success ? '#155724' : '#721c24' }}>
                          {result.book_title}
                        </span>
                      </div>
                      
                      {result.success && result.share_url && (
                        <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
                          <a 
                            href={result.share_url} 
                            target="_blank" 
                            rel="noopener noreferrer"
                            style={{ color: '#0066cc', fontSize: 12 }}
                          >
                            {result.share_url}
                            <ExternalLink size={10} style={{ marginLeft: 4, verticalAlign: 'middle' }} />
                          </a>
                          {result.share_password && (
                            <span style={{ fontSize: 12, color: '#666' }}>
                              提取码: {result.share_password}
                            </span>
                          )}
                          <button
                            className="btn btn-secondary"
                            style={{ padding: '2px 8px', fontSize: 11 }}
                            onClick={() => handleCopyShareUrl(result.share_url!, result.share_password)}
                          >
                            <Copy size={12} />
                            复制
                          </button>
                        </div>
                      )}
                      
                      {!result.success && (
                        <div style={{ fontSize: 12, color: '#721c24', marginTop: 4 }}>
                          {result.message}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="modal-footer">
              <button 
                className="btn btn-secondary" 
                onClick={() => setShowQuarkModal(false)}
                disabled={quarkUploading}
              >
                {quarkUploadResults.length > 0 ? '关闭' : '取消'}
              </button>
              {quarkUploadResults.length === 0 && (
                <button 
                  className="btn btn-primary" 
                  onClick={handleUploadToQuark}
                  disabled={quarkUploading}
                >
                  {quarkUploading ? (
                    <>
                      <Loader2 size={14} className="spinning" style={{ marginRight: 4 }} />
                      上传中...
                    </>
                  ) : (
                    <>
                      <Cloud size={14} style={{ marginRight: 4 }} />
                      开始上传
                    </>
                  )}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      <ConfirmDialog
        isOpen={confirmDialog.isOpen}
        title={confirmDialog.title}
        message={confirmDialog.message}
        confirmText="确认"
        cancelText="取消"
        type="delete"
        onConfirm={confirmDialog.onConfirm}
        onCancel={() => setConfirmDialog({ ...confirmDialog, isOpen: false })}
      />
    </div>
  );
};

export default BookManageView;
