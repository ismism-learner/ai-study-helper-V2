import React, { useState, useEffect, useMemo } from 'react';
import { Country, BookDocument, TimelineEntry, TimePeriod } from '../types';
import { countryApi, timePeriodApi, quarkApi } from '../api';
import TimelineView from './TimelineView';
import BookUploadModal from './BookUploadModal';
import BatchUploadModal from './BatchUploadModal';
import BookManageView from './BookManageView';
import { Upload, BookOpen, Calendar, Tag, Layers, Settings, ChevronDown, ChevronUp, Clock, Edit3, ZoomOut, ZoomIn, RotateCcw, Cloud, X, CheckCircle, XCircle, Loader2, Copy, ExternalLink, Eye, EyeOff } from 'lucide-react';

interface CountryDetailViewProps {
  country: Country;
  onBack: () => void;
  onBookSelect: (book: BookDocument) => void;
}

type ViewType = 'main' | 'manage';

const CountryDetailView: React.FC<CountryDetailViewProps> = ({ country, onBookSelect }) => {
  const [books, setBooks] = useState<BookDocument[]>([]);
  const [timePeriods, setTimePeriods] = useState<TimePeriod[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [showBatchUploadModal, setShowBatchUploadModal] = useState(false);
  const [viewMode, setViewMode] = useState<'timeline' | 'grid'>('timeline');
  const [filterYear, setFilterYear] = useState<number | null>(null);
  const [currentView, setCurrentView] = useState<ViewType>('main');
  const [expandedEras, setExpandedEras] = useState<Set<string>>(new Set());
  const [editMode, setEditMode] = useState(false);
  const [scale, setScale] = useState(1);
  const [showBooks, setShowBooks] = useState(true);
  
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

  useEffect(() => {
    loadData();
  }, [country.id]);

  const loadData = async () => {
    setIsLoading(true);
    try {
      console.log('Loading books for country:', country.id, country.name);
      const [booksRes, periodsRes] = await Promise.all([
        countryApi.getBooks(country.id),
        timePeriodApi.list()
      ]);
      console.log('Loaded books:', booksRes.data);
      console.log('Books count:', booksRes.data.length);
      setBooks(booksRes.data);
      setTimePeriods(periodsRes.data);
      if (booksRes.data.length > 0) {
        console.log('First book:', booksRes.data[0]);
        console.log('First book year fields:', {
          content_era_start: booksRes.data[0].content_era_start,
          content_era_end: booksRes.data[0].content_era_end,
          year_start: booksRes.data[0].year_start,
          year_end: booksRes.data[0].year_end,
          country_id: booksRes.data[0].country_id,
          time_period_id: booksRes.data[0].time_period_id,
        });
      }
    } catch (error) {
      console.error('Failed to load books:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const generatedTimeline = useMemo(() => {
    console.log('Generating timeline from books:', books.length);
    
    if (!showBooks) {
      return [];
    }
    
    const yearMap = new Map<number, BookDocument[]>();
    const unclassifiedBooks: BookDocument[] = [];
    
    books.forEach(book => {
      let year = book.content_era_start || book.content_era_end || book.year_start || book.year_end;
      
      if (!year && book.time_period_id) {
        const period = timePeriods.find(p => p.id === book.time_period_id);
        if (period) {
          year = period.start_year || period.end_year;
          console.log(`Book "${book.title}" using time_period year:`, year, 'from period:', period.name);
        }
      }
      
      console.log(`Book "${book.title}" assigned to year:`, year);
      
      if (!year) {
        unclassifiedBooks.push(book);
      } else {
        if (!yearMap.has(year)) {
          yearMap.set(year, []);
        }
        yearMap.get(year)!.push(book);
      }
    });

    const result: TimelineEntry[] = [];
    
    if (unclassifiedBooks.length > 0) {
      result.push({
        year: -999999,
        books: unclassifiedBooks
      });
    }
    
    yearMap.forEach((yearBooks, year) => {
      result.push({
        year: year,
        books: yearBooks
      });
    });

    console.log('Generated timeline:', result.length, 'entries');
    console.log('Unclassified books:', unclassifiedBooks.length);
    return result.sort((a, b) => a.year - b.year);
  }, [books, timePeriods, showBooks]);

  const handleUploadSuccess = () => {
    setShowUploadModal(false);
    setShowBatchUploadModal(false);
    loadData();
  };

  const handleDeleteBook = async (bookId: string) => {
    if (!window.confirm('确定要删除这本书籍吗？')) return;
    
    try {
      const { bookApi } = await import('../api');
      await bookApi.delete(bookId);
      loadData();
    } catch (error) {
      console.error('Failed to delete book:', error);
      alert('删除失败');
    }
  };

  const handleUploadToQuark = async () => {
    const booksToUpload = books.filter(b => !b.quark_upload_status || b.quark_upload_status === 'not_uploaded');
    
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

  const filteredBooks = filterYear
    ? books.filter(b => (b.content_era_start === filterYear || b.content_era_end === filterYear || b.year_start === filterYear || b.year_end === filterYear))
    : books;

  const allYears = Array.from(new Set(books.flatMap(b => [b.content_era_start, b.content_era_end, b.year_start, b.year_end].filter(Boolean)))).sort((a, b) => (a || 0) - (b || 0));

  // 按时代分类书籍
  const getEra = (year: number | null): string => {
    if (!year) return '未知';
    if (year < -500) return '古代';
    if (year < 500) return '古典';
    if (year < 1500) return '中世纪';
    if (year < 1800) return '近代早期';
    if (year < 1900) return '近代';
    return '当代';
  };

  const booksByEra = useMemo(() => {
    const eraMap: Record<string, BookDocument[]> = {};
    filteredBooks.forEach(book => {
      const era = getEra(book.content_era_start || book.content_era_end || book.year_start || book.year_end);
      if (!eraMap[era]) {
        eraMap[era] = [];
      }
      eraMap[era].push(book);
    });
    return eraMap;
  }, [filteredBooks]);

  const toggleEra = (era: string) => {
    setExpandedEras(prev => {
      const newSet = new Set(prev);
      if (newSet.has(era)) {
        newSet.delete(era);
      } else {
        newSet.add(era);
      }
      return newSet;
    });
  };

  const handleEraHover = (era: string, isHovering: boolean) => {
    if (isHovering) {
      setExpandedEras(prev => new Set(prev).add(era));
    } else {
      // 保持点击展开的状态
      setExpandedEras(prev => {
        const newSet = new Set(prev);
        // 这里可以添加逻辑来判断是否需要在鼠标离开时折叠
        // 暂时保持展开状态
        return newSet;
      });
    }
  };

  if (currentView === 'manage') {
    return (
      <BookManageView
        country={country}
        onBack={() => {
          setCurrentView('main');
          loadData();
        }}
        onBookSelect={onBookSelect}
      />
    );
  }

  if (isLoading) {
    return null;
  }

  return (
    <div className="country-detail-view">
      <div className="country-header" style={{ padding: '8px 24px', background: 'var(--bg-white)', borderBottom: '1px solid var(--border-color)' }}>
        <div className="header-content" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '16px' }}>
          <div className="header-left" style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <h2 style={{ fontSize: '16px', fontWeight: 600, margin: 0, color: 'var(--text-primary)', whiteSpace: 'nowrap' }}>作者国籍数据管理</h2>
            <div className="view-toggle inline-toggle" style={{ display: 'flex', background: 'var(--bg-light)', borderRadius: '6px', padding: '2px' }}>
              <button
                className={`toggle-btn ${viewMode === 'timeline' ? 'active' : ''}`}
                onClick={() => setViewMode('timeline')}
                style={{ display: 'flex', alignItems: 'center', gap: '4px', padding: '4px 8px', background: viewMode === 'timeline' ? 'var(--bg-white)' : 'none', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '12px', color: viewMode === 'timeline' ? 'var(--primary-color)' : 'var(--text-secondary)', transition: 'all 0.2s ease' }}
              >
                <Calendar size={14} />
                年表
              </button>
              <button
                className={`toggle-btn ${viewMode === 'grid' ? 'active' : ''}`}
                onClick={() => setViewMode('grid')}
                style={{ display: 'flex', alignItems: 'center', gap: '4px', padding: '4px 8px', background: viewMode === 'grid' ? 'var(--bg-white)' : 'none', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '12px', color: viewMode === 'grid' ? 'var(--primary-color)' : 'var(--text-secondary)', transition: 'all 0.2s ease' }}
              >
                <Tag size={14} />
                网格
              </button>
            </div>
          </div>
          <div className="header-right" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div className="filter-section inline-filter" style={{ marginRight: '0' }}>
              <select
                value={filterYear || ''}
                onChange={(e) => setFilterYear(e.target.value ? parseInt(e.target.value) : null)}
                className="year-filter"
                style={{ padding: '4px 8px', fontSize: '12px', border: '1px solid var(--border-color)', borderRadius: '4px', background: 'var(--bg-white)', color: 'var(--text-primary)' }}
              >
                <option value="">全部年份</option>
                {allYears.map(year => (
                  <option key={year} value={year ?? ''}>{year}年</option>
                ))}
              </select>
            </div>
            <button 
              className="btn btn-secondary" 
              onClick={() => setShowBatchUploadModal(true)}
              title="批量上传"
              style={{ padding: '4px 8px', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '3px', background: 'var(--bg-light)', border: '1px solid var(--border-color)', borderRadius: '4px', color: 'var(--text-primary)', cursor: 'pointer', transition: 'all 0.2s ease' }}
            >
              <Layers size={12} />
              批量上传
            </button>
            <button 
              className="btn btn-primary" 
              onClick={() => setShowUploadModal(true)}
              style={{ padding: '4px 8px', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '3px', background: 'var(--primary-color)', border: '1px solid var(--primary-color)', borderRadius: '4px', color: 'white', cursor: 'pointer', transition: 'all 0.2s ease' }}
            >
              <Upload size={12} />
              上传书籍
            </button>
            <button 
              className="btn btn-secondary" 
              onClick={() => setCurrentView('manage')}
              title="图书管理"
              style={{ padding: '4px 8px', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '3px', background: 'var(--bg-light)', border: '1px solid var(--border-color)', borderRadius: '4px', color: 'var(--text-primary)', cursor: 'pointer', transition: 'all 0.2s ease' }}
            >
              <Settings size={12} />
              管理
            </button>
            <button 
              className="btn btn-secondary" 
              onClick={() => setShowQuarkModal(true)}
              title="上传到夸克网盘"
              style={{ padding: '4px 8px', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '3px', background: 'var(--bg-light)', border: '1px solid var(--border-color)', borderRadius: '4px', color: 'var(--text-primary)', cursor: 'pointer', transition: 'all 0.2s ease' }}
            >
              <Cloud size={12} />
              夸克网盘
            </button>
            {viewMode === 'timeline' && (
              <div className="timeline-controls-inline" style={{ display: 'flex', alignItems: 'center', gap: '6px', paddingLeft: '8px', borderLeft: '1px solid var(--border-color)' }}>
                <button 
                  className="btn btn-secondary btn-sm" 
                  onClick={() => setEditMode(!editMode)}
                  style={{ padding: '4px 8px', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '3px', background: editMode ? 'var(--primary-color)' : 'var(--bg-light)', border: '1px solid var(--border-color)', borderRadius: '4px', color: editMode ? 'white' : 'var(--text-primary)', cursor: 'pointer', transition: 'all 0.2s ease' }}
                >
                  <Edit3 size={12} />
                  {editMode ? '完成' : '编辑'}
                </button>
                <button 
                  className="zoom-btn" 
                  onClick={() => setScale(prev => Math.max(0.2, prev - 0.1))} 
                  title="缩小"
                  style={{ width: '24px', height: '24px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-light)', border: '1px solid var(--border-color)', borderRadius: '4px', color: 'var(--text-secondary)', cursor: 'pointer', transition: 'all 0.2s ease' }}
                >
                  <ZoomOut size={12} />
                </button>
                <span className="zoom-level" style={{ fontSize: '11px', color: 'var(--text-muted)', minWidth: '35px', textAlign: 'center' }}>{Math.round(scale * 100)}%</span>
                <button 
                  className="zoom-btn" 
                  onClick={() => setScale(prev => Math.min(3, prev + 0.1))} 
                  title="放大"
                  style={{ width: '24px', height: '24px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-light)', border: '1px solid var(--border-color)', borderRadius: '4px', color: 'var(--text-secondary)', cursor: 'pointer', transition: 'all 0.2s ease' }}
                >
                  <ZoomIn size={12} />
                </button>
                <button 
                  className="zoom-btn" 
                  onClick={() => setScale(1)} 
                  title="重置"
                  style={{ width: '24px', height: '24px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-light)', border: '1px solid var(--border-color)', borderRadius: '4px', color: 'var(--text-secondary)', cursor: 'pointer', transition: 'all 0.2s ease' }}
                >
                  <RotateCcw size={12} />
                </button>
                <button 
                  className="toggle-books-btn" 
                  onClick={() => setShowBooks(!showBooks)} 
                  title={showBooks ? "隐藏书籍" : "显示书籍"}
                  style={{ 
                    width: 'auto', 
                    height: '24px', 
                    padding: '0 8px',
                    display: 'flex', 
                    alignItems: 'center', 
                    justifyContent: 'center', 
                    gap: '4px',
                    background: showBooks ? 'var(--primary-color)' : 'var(--bg-light)', 
                    border: '1px solid var(--border-color)', 
                    borderRadius: '4px', 
                    color: showBooks ? 'white' : 'var(--text-secondary)', 
                    cursor: 'pointer', 
                    transition: 'all 0.2s ease',
                    fontSize: '11px',
                    whiteSpace: 'nowrap'
                  }}
                >
                  {showBooks ? <Eye size={12} /> : <EyeOff size={12} />}
                  {showBooks ? '书籍' : '已隐藏'}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="country-content">
        {books.length === 0 ? (
          <div className="empty-state">
            <BookOpen size={64} strokeWidth={1} />
            <h3>暂无书籍</h3>
            <p>点击"批量上传"快速添加多本书籍</p>
            <div className="empty-actions">
              <button 
                className="btn btn-primary"
                onClick={() => setShowBatchUploadModal(true)}
              >
                <Layers size={16} />
                批量上传
              </button>
              <button 
                className="btn btn-secondary"
                onClick={() => setShowUploadModal(true)}
              >
                <Upload size={16} />
                单本上传
              </button>
            </div>
          </div>
        ) : viewMode === 'timeline' ? (
          <TimelineView
            timeline={generatedTimeline}
            onBookClick={onBookSelect}
            onDeleteBook={handleDeleteBook}
            onBooksUpdated={loadData}
            editMode={editMode}
          />
        ) : (
          <div className="books-by-era">
            {Object.entries(booksByEra).map(([era, eraBooks]) => (
              <div 
                key={era} 
                className="era-category"
                onMouseEnter={() => handleEraHover(era, true)}
                onMouseLeave={() => handleEraHover(era, false)}
              >
                <div 
                  className="era-header"
                  onClick={() => toggleEra(era)}
                >
                  <div className="era-title">
                    <Clock size={16} />
                    {era}
                    <span className="era-count">({eraBooks.length}本)</span>
                  </div>
                  <div className="era-toggle">
                    {expandedEras.has(era) ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                  </div>
                </div>
                <div className={`era-books ${expandedEras.has(era) ? 'expanded' : ''}`}>
                  <div className="era-books-grid">
                    {eraBooks.map(book => (
                      <div key={book.id} className="book-card" onClick={() => onBookSelect(book)}>
                        <div className="book-cover">
                          {book.cover_image ? (
                            <img src={book.cover_image} alt={book.title} />
                          ) : (
                            <div className="book-cover-placeholder">
                              <BookOpen size={32} />
                            </div>
                          )}
                        </div>
                        <div className="book-info">
                          <h4 className="book-title">{book.title}</h4>
                          {book.author && <p className="book-author">{book.author}</p>}
                          <div className="book-meta">
                            {book.year_start && (
                              <span className="meta-item">
                                <Calendar size={12} />
                                {book.year_start}
                                {book.year_end && book.year_end !== book.year_start && ` - ${book.year_end}`}
                              </span>
                            )}
                          </div>
                          {book.tags && book.tags.length > 0 && (
                            <div className="book-tags">
                              {book.tags.slice(0, 3).map((tag, i) => (
                                <span key={i} className="tag">{tag}</span>
                              ))}
                            </div>
                          )}
                        </div>
                        <button
                          className="delete-btn"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeleteBook(book.id);
                          }}
                        >
                          删除
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {showUploadModal && (
        <BookUploadModal
          countryId={country.id}
          onClose={() => setShowUploadModal(false)}
          onSuccess={handleUploadSuccess}
        />
      )}

      {showBatchUploadModal && (
        <BatchUploadModal
          countryId={country.id}
          onClose={() => setShowBatchUploadModal(false)}
          onSuccess={handleUploadSuccess}
        />
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
                    <p style={{ margin: '0 0 8px 0', color: 'var(--text-muted)' }}>
                      将 {country.name} 的书籍上传到夸克网盘，按标签分类存储。
                    </p>
                    <p style={{ margin: 0, color: 'var(--text-muted)' }}>
                      将上传 {books.filter(b => !b.quark_upload_status || b.quark_upload_status === 'not_uploaded').length} 本未上传的书籍
                    </p>
                  </div>

                  <div style={{ background: 'var(--bg-surface)', padding: 12, borderRadius: 8, marginBottom: 16 }}>
                    <h4 style={{ margin: '0 0 8px 0', fontSize: 14 }}>上传说明：</h4>
                    <ul style={{ margin: 0, paddingLeft: 20, fontSize: 13, color: 'var(--text-muted)' }}>
                      <li>书籍将按标签分类到「我的电子图书馆/标签名」文件夹</li>
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
                        background: result.success ? 'var(--success-100)' : 'var(--danger-100)',
                        border: `1px solid ${result.success ? 'var(--success-200)' : 'var(--danger-200)'}`
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                        {result.success ? (
                          <CheckCircle size={16} color="var(--success-500)" />
                        ) : (
                          <XCircle size={16} color="var(--danger-500)" />
                        )}
                        <span style={{ fontWeight: 500, color: result.success ? 'var(--success-700)' : 'var(--danger-700)' }}>
                          {result.book_title}
                        </span>
                      </div>
                      
                      {result.success && result.share_url && (
                        <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                          <a 
                            href={result.share_url} 
                            target="_blank" 
                            rel="noopener noreferrer"
                            style={{ color: 'var(--primary-500)', fontSize: 12 }}
                          >
                            {result.share_url}
                            <ExternalLink size={10} style={{ marginLeft: 4, verticalAlign: 'middle' }} />
                          </a>
                          {result.share_password && (
                            <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
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
                        <div style={{ fontSize: 12, color: 'var(--danger-700)', marginTop: 4 }}>
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
    </div>
  );
};

export default CountryDetailView;
