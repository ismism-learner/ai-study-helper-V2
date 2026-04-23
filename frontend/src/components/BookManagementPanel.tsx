import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { BookDocument, Country, TimePeriod } from '../types';
import { bookApi, countryApi, timePeriodApi } from '../api';
import {
  BookOpen,
  Upload,
  CheckSquare,
  Square,
  Clock,
  Globe,
  Tag,
  Trash2,
  Edit2,
  X,
  Save,
  FolderPlus,
  Search,
  AlertCircle,
  FileText,
  Plus,
  Minus,
  ArrowLeft,
  Layers,
  Image,
  Cloud,
  FolderOpen,
  Loader,
  ChevronDown
} from 'lucide-react';
import ConfirmDialog from './ConfirmDialog';
import EditBookBody, { EditBookFormData } from './EditBookBody';

interface BookManagementPanelProps {
  onBack?: () => void;
  onBookSelect?: (book: BookDocument) => void;
}

const BookManagementPanel: React.FC<BookManagementPanelProps> = ({ onBack, onBookSelect }) => {
  const [books, setBooks] = useState<BookDocument[]>([]);
  const [countries, setCountries] = useState<Country[]>([]);
  const [timePeriods, setTimePeriods] = useState<TimePeriod[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isBackgroundUpdating, setIsBackgroundUpdating] = useState(false);
  const [selectedBooks, setSelectedBooks] = useState<Set<string>>(new Set());
  const [lastSelectedIndex, setLastSelectedIndex] = useState<number | null>(null);
  const [archivingBooks, setArchivingBooks] = useState<Set<string>>(new Set());
  
  // 分页状态
  const [paginationSkip, setPaginationSkip] = useState(0);
  const paginationLimit = 50;
  const [hasMoreBooks, setHasMoreBooks] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  
  // 懒加载封面缓存
  const [coverCache, setCoverCache] = useState<Record<string, { cover_image: string | null; thumbnail: string | null }>>({});
  const [loadingCovers, setLoadingCovers] = useState<Set<string>>(new Set());
  
  const [searchTerm, setSearchTerm] = useState('');
  const [filterCountry, setFilterCountry] = useState<string>('');
  const [filterPeriod, setFilterPeriod] = useState<string>('');
  const [filterArchiveStatus, setFilterArchiveStatus] = useState<string>('unarchived');
  
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showBatchClassifyModal, setShowBatchClassifyModal] = useState(false);
  const [showTagModal, setShowTagModal] = useState(false);
  const [showNewPeriodModal, setShowNewPeriodModal] = useState(false);
  const [showQuickTagModal, setShowQuickTagModal] = useState(false);
  const [quickTagKeyword, setQuickTagKeyword] = useState('');
  const [quickTagResults, setQuickTagResults] = useState<BookDocument[]>([]);
  const [quickTagSearchLoading, setQuickTagSearchLoading] = useState(false);
  const [editingBook, setEditingBook] = useState<BookDocument | null>(null);
  
  const [uploadFiles, setUploadFiles] = useState<File[]>([]);
  const [uploadProgress, setUploadProgress] = useState<{ current: number; total: number } | null>(null);
  
  const [tagHistory, setTagHistory] = useState<string[]>([]);
  const [editFormData, setEditFormData] = useState<EditBookFormData | null>(null);
  
  const [batchClassifyForm, setBatchClassifyForm] = useState({
    country_id: '',
    time_period_id: '',
  });
  
  const [tagForm, setTagForm] = useState({
    mode: 'add' as 'add' | 'replace' | 'remove',
    tags: '',
  });
  
  const [newPeriodForm, setNewPeriodForm] = useState({
    name: '',
    start_year: '',
    end_year: '',
    country_id: '',
  });
  
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
    const stored = localStorage.getItem('tagHistory');
    if (stored) {
      try {
        setTagHistory(JSON.parse(stored));
      } catch (e) {
        console.error('Failed to parse tag history:', e);
      }
    }
  }, []);

  const saveTagToHistory = (tag: string) => {
    const updated = [tag, ...tagHistory.filter(t => t !== tag)].slice(0, 50);
    setTagHistory(updated);
    localStorage.setItem('tagHistory', JSON.stringify(updated));
  };

  useEffect(() => {
    setLastSelectedIndex(null);
  }, [searchTerm, filterCountry, filterPeriod, filterArchiveStatus]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && showQuickTagModal) {
        setShowQuickTagModal(false);
        setQuickTagKeyword('');
        setQuickTagResults([]);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [showQuickTagModal]);

  const handleQuickTagSearch = async () => {
    if (!quickTagKeyword.trim()) return;
    
    setQuickTagSearchLoading(true);
    try {
      const response = await bookApi.quickSearch(quickTagKeyword.trim());
      setQuickTagResults(response.data.books);
    } catch (error) {
      console.error('Quick tag search failed:', error);
    } finally {
      setQuickTagSearchLoading(false);
    }
  };

  const handleQuickTagApply = async (tag: string) => {
    if (quickTagResults.length === 0 || !tag.trim()) return;
    
    const bookIds = quickTagResults.map(b => b.id);
    
    try {
      await bookApi.batchTag(bookIds, tag.trim(), 'add');
      saveTagToHistory(tag.trim());
      setShowQuickTagModal(false);
      setQuickTagKeyword('');
      setQuickTagResults([]);
      loadData();
    } catch (error) {
      console.error('Batch tag failed:', error);
      alert('批量打标签失败');
    }
  };

  const handleQuickTagSelectAll = () => {
    setSelectedBooks(new Set(quickTagResults.map(b => b.id)));
  };

  const loadData = async (isBackgroundUpdate = false) => {
    if (isBackgroundUpdate) {
      setIsBackgroundUpdating(true);
    } else {
      setIsLoading(true);
    }
    
    try {
      const [booksRes, countriesRes, periodsRes] = await Promise.all([
        bookApi.list({ skip: 0, limit: paginationLimit }),
        countryApi.list(),
        timePeriodApi.list(),
      ]);
      setBooks(booksRes.data);
      setPaginationSkip(0);
      setHasMoreBooks(booksRes.data.length >= paginationLimit);
      setCountries(countriesRes.data);
      setTimePeriods(periodsRes.data);
    } catch (error) {
      console.error('Failed to load data:', error);
    } finally {
      setIsLoading(false);
      setIsBackgroundUpdating(false);
    }
  };

  const loadMoreBooks = async () => {
    if (isLoadingMore || !hasMoreBooks) return;
    setIsLoadingMore(true);
    
    try {
      const nextSkip = paginationSkip + paginationLimit;
      const booksRes = await bookApi.list({ skip: nextSkip, limit: paginationLimit });
      setBooks(prev => [...prev, ...booksRes.data]);
      setPaginationSkip(nextSkip);
      setHasMoreBooks(booksRes.data.length >= paginationLimit);
    } catch (error) {
      console.error('Failed to load more books:', error);
    } finally {
      setIsLoadingMore(false);
    }
  };

  // 懒加载封面
  const loadCover = useCallback(async (bookId: string) => {
    if (coverCache[bookId] || loadingCovers.has(bookId)) return;
    
    setLoadingCovers(prev => new Set(prev).add(bookId));
    try {
      const res = await bookApi.getCover(bookId);
      setCoverCache(prev => ({ ...prev, [bookId]: res.data }));
    } catch (error) {
      console.error('Failed to load cover:', error);
    } finally {
      setLoadingCovers(prev => {
        const next = new Set(prev);
        next.delete(bookId);
        return next;
      });
    }
  }, [coverCache, loadingCovers]);

  // IntersectionObserver 懒加载封面
  const coverObserverRef = useRef<IntersectionObserver | null>(null);
  const coverElementRef = useCallback((bookId: string) => (element: HTMLDivElement | null) => {
    if (!element) return;
    
    if (!coverObserverRef.current) {
      coverObserverRef.current = new IntersectionObserver(
        (entries) => {
          entries.forEach(entry => {
            if (entry.isIntersecting) {
              const id = entry.target.getAttribute('data-book-id');
              if (id) loadCover(id);
              coverObserverRef.current?.unobserve(entry.target);
            }
          });
        },
        { rootMargin: '200px' }
      );
    }
    
    element.setAttribute('data-book-id', bookId);
    coverObserverRef.current.observe(element);
  }, [loadCover]);

  const unarchivedBooks = useMemo(() => {
    return books.filter(b => b.notes_count === 0);
  }, [books]);

  const archivedBooks = useMemo(() => {
    return books.filter(b => b.notes_count > 0);
  }, [books]);

  const allTags = useMemo(() => {
    const tagSet = new Set<string>();
    books.forEach(book => {
      book.tags?.forEach(tag => tagSet.add(tag));
    });
    return Array.from(tagSet).sort();
  }, [books]);

  const filteredBooks = useMemo(() => {
    return books.filter(book => {
      const matchesSearch = !searchTerm || 
        book.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (book.author && book.author.toLowerCase().includes(searchTerm.toLowerCase()));
      
      const matchesCountry = !filterCountry || book.country_id === filterCountry;
      const matchesPeriod = !filterPeriod || book.time_period_id === filterPeriod;
      
      let matchesArchive = true;
      if (filterArchiveStatus === 'unarchived') {
        matchesArchive = book.notes_count === 0;
      } else if (filterArchiveStatus === 'archived') {
        matchesArchive = book.notes_count > 0;
      }
      
      return matchesSearch && matchesCountry && matchesPeriod && matchesArchive;
    });
  }, [books, searchTerm, filterCountry, filterPeriod, filterArchiveStatus]);

  const getFilteredTimePeriods = (countryId?: string) => {
    if (!countryId) return timePeriods;
    return timePeriods.filter(period => period.country_id === countryId);
  };

  const toggleSelect = (bookId: string, index: number, shiftKey: boolean = false) => {
    if (shiftKey && lastSelectedIndex !== null) {
      const start = Math.min(lastSelectedIndex, index);
      const end = Math.max(lastSelectedIndex, index);
      const idsToSelect = filteredBooks.slice(start, end + 1).map(b => b.id);
      setSelectedBooks(prev => {
        const newSet = new Set(prev);
        idsToSelect.forEach(id => newSet.add(id));
        return newSet;
      });
    } else {
      setSelectedBooks(prev => {
        const newSet = new Set(prev);
        if (newSet.has(bookId)) {
          newSet.delete(bookId);
        } else {
          newSet.add(bookId);
        }
        return newSet;
      });
      setLastSelectedIndex(index);
    }
  };

  const toggleSelectAll = () => {
    if (selectedBooks.size === filteredBooks.length) {
      setSelectedBooks(new Set());
    } else {
      setSelectedBooks(new Set(filteredBooks.map(b => b.id)));
    }
  };

  const selectUnarchivedBooks = () => {
    setSelectedBooks(new Set(unarchivedBooks.map(b => b.id)));
  };

  const handleQuickArchive = async (bookId: string, year: string) => {
    if (!year.trim()) return;
    
    const yearNum = parseInt(year);
    if (isNaN(yearNum)) {
      alert('请输入有效的年份');
      return;
    }
    
    // 添加到正在归档的列表
    setArchivingBooks(prev => new Set(prev).add(bookId));
    
    // 立即在本地更新书籍状态，让用户看到变化
    setBooks(prevBooks => prevBooks.map(book => 
      book.id === bookId 
        ? { ...book, theme_year_start: yearNum }
        : book
    ));
    
    try {
      await bookApi.update(bookId, {
        theme_year_start: yearNum,
      });
      // 使用后台模式刷新数据，不阻塞用户操作
      loadData(true);
    } catch (error) {
      console.error('Failed to quick archive:', error);
      // 如果失败，恢复原状态
      setBooks(prevBooks => prevBooks.map(book => 
        book.id === bookId 
          ? { ...book, theme_year_start: null }
          : book
      ));
      alert('归档失败');
    } finally {
      // 从正在归档的列表中移除
      setArchivingBooks(prev => {
        const newSet = new Set(prev);
        newSet.delete(bookId);
        return newSet;
      });
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    setUploadFiles(files);
  };

  const handleFolderSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    const validFiles = files.filter(f => 
      f.type === 'application/pdf' || 
      f.type === 'application/epub+zip' ||
      f.type === 'text/plain' ||
      f.name.endsWith('.pdf') ||
      f.name.endsWith('.epub') ||
      f.name.endsWith('.txt')
    );
    
    if (validFiles.length === 0) {
      alert('所选文件夹中没有支持的文件格式（PDF、EPUB、TXT）');
      return;
    }
    
    setUploadFiles(validFiles);
  };

  const handleUpload = async () => {
    if (uploadFiles.length === 0) return;
    
    setUploadProgress({ current: 0, total: uploadFiles.length });
    
    try {
      for (let i = 0; i < uploadFiles.length; i++) {
        const file = uploadFiles[i];
        const title = file.name.replace(/\.[^/.]+$/, '');
        
        await bookApi.upload({
          file,
          title,
        });
        
        setUploadProgress({ current: i + 1, total: uploadFiles.length });
      }
      
      setShowUploadModal(false);
      setUploadFiles([]);
      setUploadProgress(null);
      loadData();
    } catch (error) {
      console.error('Upload failed:', error);
      alert('上传失败');
      setUploadProgress(null);
    }
  };

  const handleEditBook = (book: BookDocument) => {
    setEditingBook(book);
    setEditFormData(null);
    setShowEditModal(true);
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
      
      setShowEditModal(false);
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

  const handleBatchClassify = async () => {
    if (selectedBooks.size === 0) return;
    
    try {
      await Promise.all(
        Array.from(selectedBooks).map(bookId =>
          bookApi.update(bookId, {
            country_id: batchClassifyForm.country_id || undefined,
            time_period_id: batchClassifyForm.time_period_id || undefined,
          })
        )
      );
      setSelectedBooks(new Set());
      setShowBatchClassifyModal(false);
      setBatchClassifyForm({ country_id: '', time_period_id: '' });
      loadData();
    } catch (error) {
      console.error('Failed to classify:', error);
      alert('分类失败');
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

  const handleCreatePeriod = async () => {
    if (!newPeriodForm.name) return;
    
    try {
      await timePeriodApi.create({
        name: newPeriodForm.name,
        start_year: newPeriodForm.start_year ? parseInt(newPeriodForm.start_year) : undefined,
        end_year: newPeriodForm.end_year ? parseInt(newPeriodForm.end_year) : undefined,
        country_id: newPeriodForm.country_id || undefined,
      });
      setShowNewPeriodModal(false);
      setNewPeriodForm({ name: '', start_year: '', end_year: '', country_id: '' });
      loadData();
    } catch (error) {
      console.error('Failed to create period:', error);
      alert('创建时期失败');
    }
  };

  const handleGenerateThumbnails = async () => {
    if (!confirm('确定要为所有没有缩略图的书籍生成缩略图吗？这可能需要一些时间。')) return;
    
    try {
      const response = await bookApi.generateAllThumbnails();
      const result = response.data;
      alert(`缩略图生成完成！成功: ${result.generated}, 失败: ${result.failed}, 总计: ${result.total}`);
      loadData();
    } catch (error) {
      console.error('Failed to generate thumbnails:', error);
      alert('生成缩略图失败');
    }
  };

  const getCountryName = (countryId?: string) => {
    if (!countryId) return '未分类';
    const country = countries.find(c => c.id === countryId);
    return country ? country.name : '未分类';
  };

  const getPeriodName = (periodId?: string) => {
    if (!periodId) return '未分类';
    const period = timePeriods.find(p => p.id === periodId);
    return period ? period.name : '未分类';
  };

  if (isLoading) {
    return (
      <div className="book-management-loading">
        <div className="loading-spinner" />
        <p>加载中...</p>
      </div>
    );
  }

  return (
    <div className="book-management-panel">
      <div className="management-header">
        {onBack && (
          <button className="btn btn-secondary" onClick={onBack}>
            <ArrowLeft size={16} />
            <span>返回</span>
          </button>
        )}
        <h2>
          <BookOpen size={24} />
          基础书籍管理
        </h2>
        <div className="header-stats">
          <span className="stat-item">
            <BookOpen size={14} />
            {books.length} 本书籍
          </span>
          <span className="stat-item success">
            <FileText size={14} />
            {archivedBooks.length} 本有笔记
          </span>
          <span className="stat-item warning">
            <AlertCircle size={14} />
            {unarchivedBooks.length} 本无笔记
          </span>
        </div>
      </div>

      <div className="management-toolbar">
        <div className="toolbar-left">
          <div className="search-box">
            <Search size={16} />
            <input
              type="text"
              placeholder="搜索书籍..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>

          <select
            value={filterArchiveStatus}
            onChange={(e) => setFilterArchiveStatus(e.target.value)}
            className="archive-filter"
          >
            <option value="all">全部书籍</option>
            <option value="unarchived">未归档</option>
            <option value="archived">已归档</option>
          </select>

          <select
            value={filterCountry}
            onChange={(e) => setFilterCountry(e.target.value)}
            className="country-filter"
          >
            <option value="">全部地区</option>
            {countries.map(country => (
              <option key={country.id} value={country.id}>{country.name}</option>
            ))}
          </select>

          <select
            value={filterPeriod}
            onChange={(e) => setFilterPeriod(e.target.value)}
            className="period-filter"
          >
            <option value="">全部时期</option>
            {timePeriods.map(period => (
              <option key={period.id} value={period.id}>{period.name}</option>
            ))}
          </select>
        </div>

        <div className="toolbar-right">
          {isBackgroundUpdating && (
            <div className="background-update-indicator">
              <Loader size={14} className="spinning" />
              <span>更新中...</span>
            </div>
          )}
          <button
            className="btn btn-primary"
            onClick={() => setShowUploadModal(true)}
          >
            <Upload size={16} />
            上传书籍
          </button>
          
          <button
            className="btn btn-secondary"
            onClick={handleGenerateThumbnails}
            title="为所有没有缩略图的书籍生成缩略图"
          >
            <Image size={16} />
            生成缩略图
          </button>
          
          <button
            className="btn btn-secondary"
            onClick={() => setShowNewPeriodModal(true)}
          >
            <FolderPlus size={16} />
            新建时期
          </button>
        </div>
      </div>

      {selectedBooks.size > 0 && (
        <div className="batch-actions-bar">
          <button
            className="btn btn-secondary"
            onClick={() => setShowBatchClassifyModal(true)}
          >
            <Layers size={16} />
            批量归类
          </button>
          <button
            className="btn btn-secondary"
            onClick={() => setShowTagModal(true)}
          >
            <Tag size={16} />
            批量标签
          </button>
          <button
            className="btn btn-danger"
            onClick={handleBatchDelete}
          >
            <Trash2 size={16} />
            删除
          </button>
        </div>
      )}

      <div className="quick-actions">
        <button
          className="quick-action-btn"
          onClick={selectUnarchivedBooks}
          disabled={unarchivedBooks.length === 0}
        >
          <AlertCircle size={14} />
          选择未归档书籍 ({unarchivedBooks.length})
        </button>
      </div>

      <div className="management-content">
        {filteredBooks.length === 0 ? (
          <div className="empty-state">
            <BookOpen size={64} strokeWidth={1} />
            <h3>暂无书籍</h3>
            <p>点击"上传书籍"添加书籍</p>
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
              <div className="col-country">内容相关地区</div>
              <div className="col-period">时期</div>
              <div className="col-theme-year">主题年代</div>
              <div className="col-tags">标签</div>
              <div className="col-actions">操作</div>
            </div>

            <div className="table-body">
              {filteredBooks.map((book, index) => (
                <div
                  key={book.id}
                  className={`table-row ${selectedBooks.has(book.id) ? 'selected' : ''} ${book.notes_count === 0 ? 'unarchived' : ''}`}
                >
                  <div ref={coverElementRef(book.id)} style={{ display: 'none' }} />
                  <div className="col-checkbox">
                    <button
                      className={`select-btn ${selectedBooks.has(book.id) ? 'selected' : ''}`}
                      onClick={(e) => toggleSelect(book.id, index, e.shiftKey)}
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
                    onClick={() => onBookSelect?.(book)}
                  >
                    <BookOpen size={14} />
                    <span>{book.title}</span>
                    {book.quark_upload_status === 'uploaded' && (
                      <span title="已上传到夸克网盘">
                        <Cloud size={14} className="quark-uploaded-icon" />
                      </span>
                    )}
                    {book.notes_count === 0 && (
                      <span className="warning-indicator" title="无笔记">
                        <AlertCircle size={12} />
                      </span>
                    )}
                    {book.notes_count > 0 && (
                      <span className="notes-count-badge" title={`${book.notes_count} 条笔记`}>
                        {book.notes_count}
                      </span>
                    )}
                  </div>
                  <div className="col-author">{book.author || '-'}</div>
                  <div className="col-country">
                    <span className={`country-tag ${!book.country_id ? 'empty' : ''}`}>
                      <Globe size={12} />
                      {getCountryName(book.country_id ?? undefined)}
                    </span>
                  </div>
                  <div className="col-period">
                    <span className={`period-tag ${!book.time_period_id ? 'empty' : ''}`}>
                      <Clock size={12} />
                      {getPeriodName(book.time_period_id ?? undefined)}
                    </span>
                  </div>
                  <div className="col-theme-year">
                    <div className="quick-archive-wrapper">
                      <input
                        type="number"
                        className={`quick-archive-input ${archivingBooks.has(book.id) ? 'archiving' : ''}`}
                        placeholder="年份"
                        defaultValue={book.theme_year_start || ''}
                        onBlur={(e) => {
                          const value = e.target.value;
                          if (value && value !== String(book.theme_year_start)) {
                            handleQuickArchive(book.id, value);
                          }
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            const value = (e.target as HTMLInputElement).value;
                            if (value && value !== String(book.theme_year_start)) {
                              handleQuickArchive(book.id, value);
                            }
                          }
                        }}
                        disabled={archivingBooks.has(book.id)}
                        title="输入主题起始年代进行快速归档"
                      />
                      {archivingBooks.has(book.id) && (
                        <div className="archive-spinner">
                          <Loader size={12} className="spinning" />
                        </div>
                      )}
                    </div>
                  </div>
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
              {hasMoreBooks && (
                <div className="load-more-row">
                  <button
                    className="btn btn-secondary load-more-btn"
                    onClick={loadMoreBooks}
                    disabled={isLoadingMore}
                  >
                    {isLoadingMore ? (
                      <Loader size={14} className="spinning" />
                    ) : (
                      <ChevronDown size={14} />
                    )}
                    {isLoadingMore ? '加载中...' : '加载更多'}
                  </button>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {showUploadModal && (
        <div className="modal-overlay" onClick={() => setShowUploadModal(false)}>
          <div className="upload-modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3>
                <Upload size={18} />
                上传书籍
              </h3>
              <button className="close-btn" onClick={() => setShowUploadModal(false)}>
                <X size={20} />
              </button>
            </div>

            <div className="modal-body">
              <div className="upload-area">
                <div className="upload-placeholder">
                  <Upload size={48} strokeWidth={1} />
                  <p>点击或拖拽文件到此处上传</p>
                  <span>支持 PDF、EPUB、TXT 格式，可多选</span>
                  <div style={{ display: 'flex', gap: 8, justifyContent: 'center', marginTop: 16 }}>
                    <label className="file-select-btn">
                      <input
                        type="file"
                        multiple
                        accept=".pdf,.epub,.txt"
                        onChange={handleFileSelect}
                        style={{ display: 'none' }}
                      />
                      选择文件
                    </label>
                    <label className="file-select-btn" style={{ background: 'var(--success-500)', borderColor: 'var(--success-500)' }}>
                      <input
                        type="file"
                        // @ts-expect-error webkitdirectory is not in the type definition
                        webkitdirectory=""
                        onChange={handleFolderSelect}
                        style={{ display: 'none' }}
                      />
                      <FolderOpen size={14} style={{ marginRight: 4 }} />
                      选择文件夹
                    </label>
                  </div>
                </div>
              </div>

              {uploadFiles.length > 0 && (
                <div className="selected-files">
                  <h4>已选择 {uploadFiles.length} 个文件</h4>
                  <div className="file-list">
                    {uploadFiles.map((file, index) => (
                      <div key={index} className="file-item">
                        <FileText size={16} />
                        <span>{file.name}</span>
                        <span className="file-size">
                          {(file.size / 1024 / 1024).toFixed(2)} MB
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {uploadProgress && (
                <div className="upload-progress">
                  <div className="progress-bar">
                    <div
                      className="progress-fill"
                      style={{ width: `${(uploadProgress.current / uploadProgress.total) * 100}%` }}
                    />
                  </div>
                  <span>{uploadProgress.current} / {uploadProgress.total}</span>
                </div>
              )}
            </div>

            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setShowUploadModal(false)}>
                取消
              </button>
              <button
                className="btn btn-primary"
                onClick={handleUpload}
                disabled={uploadFiles.length === 0 || uploadProgress !== null}
              >
                开始上传
              </button>
            </div>
          </div>
        </div>
      )}

      {showEditModal && editingBook && (
        <div className="modal-overlay">
          <div className="edit-book-modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3>
                <Edit2 size={18} />
                编辑书籍信息
              </h3>
              <button className="close-btn" onClick={() => setShowEditModal(false)}>
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
              <button className="btn btn-secondary" onClick={() => setShowEditModal(false)}>
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

      {showBatchClassifyModal && (
        <div className="modal-overlay" onClick={() => setShowBatchClassifyModal(false)}>
          <div className="batch-classify-modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3>
                <Layers size={18} />
                批量归类
              </h3>
              <button className="close-btn" onClick={() => setShowBatchClassifyModal(false)}>
                <X size={20} />
              </button>
            </div>

            <div className="modal-body">
              <p className="modal-hint">
                将选中的 {selectedBooks.size} 本书籍归类到以下地区和时期：
              </p>

              <div className="form-group">
                <label><Globe size={14} /> 地区</label>
                <select
                  value={batchClassifyForm.country_id}
                  onChange={(e) => setBatchClassifyForm({ ...batchClassifyForm, country_id: e.target.value, time_period_id: '' })}
                >
                  <option value="">保持不变</option>
                  {countries.map(country => (
                    <option key={country.id} value={country.id}>{country.name}</option>
                  ))}
                </select>
              </div>

              <div className="form-group">
                <label><Clock size={14} /> 时期</label>
                <select
                  value={batchClassifyForm.time_period_id}
                  onChange={(e) => setBatchClassifyForm({ ...batchClassifyForm, time_period_id: e.target.value })}
                  disabled={!batchClassifyForm.country_id}
                >
                  <option value="">{batchClassifyForm.country_id ? '未分类' : '请先选择地区'}</option>
                  {getFilteredTimePeriods(batchClassifyForm.country_id).map(period => (
                    <option key={period.id} value={period.id}>{period.name}</option>
                  ))}
                </select>
                {!batchClassifyForm.country_id && (
                  <span className="field-hint">时期与地区关联，请先选择地区</span>
                )}
              </div>
            </div>

            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setShowBatchClassifyModal(false)}>
                取消
              </button>
              <button
                className="btn btn-primary"
                onClick={handleBatchClassify}
                disabled={!batchClassifyForm.country_id && !batchClassifyForm.time_period_id}
              >
                确认归类
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
                <label>标签（逗号分隔）</label>
                <input
                  type="text"
                  value={tagForm.tags}
                  onChange={(e) => setTagForm({ ...tagForm, tags: e.target.value })}
                  placeholder="如：历史, 文学"
                />
              </div>

              {allTags.length > 0 && (
                <div className="form-group">
                  <label>历史标签（点击添加）</label>
                  <div className="history-tags-container">
                    {allTags.map(tag => {
                      const isSelected = tagForm.tags.split(',').map(t => t.trim()).includes(tag);
                      return (
                        <button
                          key={tag}
                          className={`history-tag-chip ${isSelected ? 'selected' : ''}`}
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
                </div>
              )}
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

              <div className="form-group">
                <label>关联国家/地区</label>
                <select
                  value={newPeriodForm.country_id}
                  onChange={(e) => setNewPeriodForm({ ...newPeriodForm, country_id: e.target.value })}
                >
                  <option value="">无关联</option>
                  {countries.map(country => (
                    <option key={country.id} value={country.id}>{country.name}</option>
                  ))}
                </select>
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

      {showQuickTagModal && (
        <div className="modal-overlay" onClick={() => setShowQuickTagModal(false)}>
          <div className="quick-tag-modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3>
                <Tag size={18} />
                快速打标签
              </h3>
              <button className="close-btn" onClick={() => {
                setShowQuickTagModal(false);
                setQuickTagKeyword('');
                setQuickTagResults([]);
              }}>
                <X size={20} />
              </button>
            </div>

            <div className="modal-body">
              <div className="quick-tag-search">
                <div className="search-input-row">
                  <input
                    type="text"
                    placeholder="输入关键词搜索书名或作者..."
                    value={quickTagKeyword}
                    onChange={(e) => setQuickTagKeyword(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        handleQuickTagSearch();
                      }
                    }}
                    autoFocus
                  />
                  <button
                    className="btn btn-primary"
                    onClick={handleQuickTagSearch}
                    disabled={quickTagSearchLoading || !quickTagKeyword.trim()}
                  >
                    {quickTagSearchLoading ? <Loader size={14} className="spinning" /> : <Search size={14} />}
                    搜索
                  </button>
                </div>
              </div>

              {quickTagResults.length > 0 && (
                <div className="quick-tag-results">
                  <div className="results-header">
                    <span>找到 {quickTagResults.length} 本书籍</span>
                    <button className="btn btn-secondary btn-sm" onClick={handleQuickTagSelectAll}>
                      全选
                    </button>
                  </div>
                  <div className="results-list">
                    {quickTagResults.map(book => (
                      <div key={book.id} className="result-item">
                        <div className="result-title">{book.title}</div>
                        <div className="result-author">{book.author || '未知作者'}</div>
                        <div className="result-tags">
                          {(book.tags || []).map((tag, i) => (
                            <span key={i} className="mini-tag">{tag}</span>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="quick-tag-input">
                    <input
                      type="text"
                      placeholder="输入标签名，按 Enter 应用..."
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          const target = e.target as HTMLInputElement;
                          handleQuickTagApply(target.value);
                          target.value = '';
                        }
                      }}
                    />
                  </div>

                  {tagHistory.length > 0 && (
                    <div className="tag-history">
                      <label>历史标签（点击应用）：</label>
                      <div className="history-tags">
                        {tagHistory.slice(0, 10).map((tag, i) => (
                          <button
                            key={i}
                            className="history-tag-btn"
                            onClick={() => handleQuickTagApply(tag)}
                          >
                            {tag}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="modal-footer">
              <span className="hint-text">提示：输入标签后按 Enter 应用</span>
              <button className="btn btn-secondary" onClick={() => setShowQuickTagModal(false)}>
                关闭
              </button>
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

export default BookManagementPanel;
