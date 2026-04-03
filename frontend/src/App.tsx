import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Document, Highlight, CreateDocumentRequest, Folder, PhilosophyKeyword, PhilosophyKeywordMatch, ParsedKeyword, Country, BookDocument } from './types';
import { documentApi, folderApi, highlightApi, bookApi, quarkApi } from './api';
import Sidebar from './components/Sidebar';
import DocumentEditor from './components/DocumentEditor';
import DocumentView from './components/DocumentView';
import FrameworkView from './components/FrameworkView';
import HighlightPanel from './components/HighlightPanel';
import PhilosophyKeywordsPanel from './components/PhilosophyKeywordsPanel';
import DocumentTimelineNotes from './components/DocumentTimelineNotes';
import CreateDocumentModal from './components/CreateDocumentModal';
import BatchUploadModal from './components/BatchUploadModal';
import SettingsModal from './components/SettingsModal';
import LibraryView from './components/LibraryView';
import { FileText, Edit3, BookOpen, Settings, Upload, ChevronDown, GripVertical, Library, FileQuestion, ChevronRight, Cloud, X, CheckCircle, XCircle, Loader2, Copy, ExternalLink } from 'lucide-react';
import philosophyData from '../philosophy-data.json';

type LibraryViewType = 'map' | 'country' | 'documents' | 'bookManagement' | 'timeline' | 'bookReader';

type TabType = 'framework' | 'edit' | 'view';
type MainViewType = 'documents' | 'library';

function parseKeyword(keyword: string): ParsedKeyword {
  const patterns = [
    { regex: /(.+?)\s*对立于\s*(.+)/, connector: '对立于' },
    { regex: /(.+?)\s*调和者[：:]\s*(.+?)\s+(.+)/, connector: '调和者' },
    { regex: /(.+?)\s*调和者[：:]\s*(.+)/, connector: '调和者' },
  ];

  for (const pattern of patterns) {
    const match = keyword.match(pattern.regex);
    if (match) {
      if (pattern.connector === '调和者' && match[3]) {
        return {
          left: match[1].trim(),
          right: match[3].trim(),
          connector: `调和者：${match[2].trim()}`,
        };
      }
      return {
        left: match[1].trim(),
        right: match[2]?.trim(),
        connector: pattern.connector,
      };
    }
  }

  return { left: keyword };
}

function parseKeywords(keywords: string[]): ParsedKeyword[] {
  return keywords.map(parseKeyword);
}

function App() {
  const [documents, setDocuments] = useState<Document[]>([]);
  const [folders, setFolders] = useState<Folder[]>([]);
  const [activeDocument, setActiveDocument] = useState<Document | null>(null);
  const [activeTab, setActiveTab] = useState<TabType>('framework');
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showBatchUploadModal, setShowBatchUploadModal] = useState(false);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [uploadLoading, setUploadLoading] = useState(false);
  const [generatingDocIds, setGeneratingDocIds] = useState<Set<string>>(new Set());
  const [streamingContents, setStreamingContents] = useState<Map<string, string>>(new Map());
  const [isDeleteMode, setIsDeleteMode] = useState(false);
  const [sidebarWidth, setSidebarWidth] = useState(280);
  const [isResizing, setIsResizing] = useState(false);
  const [highlightedKeyword, setHighlightedKeyword] = useState<string | null>(null);
  const [mainView, setMainView] = useState<MainViewType>('library');
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
  const [quarkUploadProgress, setQuarkUploadProgress] = useState<{
    current: number;
    total: number;
    currentTag: string;
    percentage: number;
    startTime: number;
  } | null>(null);
  
  // LibraryView 状态
  const [libraryView, setLibraryView] = useState<LibraryViewType>('map');
  const [selectedCountry, setSelectedCountry] = useState<Country | null>(null);
  const [selectedBook, setSelectedBook] = useState<BookDocument | null>(null);
  const [currentPage, setCurrentPage] = useState<number>(1);
  
  const sidebarRef = useRef<HTMLDivElement>(null);
  const philosophyKeywords = philosophyData as PhilosophyKeyword[];
  
  const renderLibraryBreadcrumbs = () => {
    const path = [];
    
    path.push({
      label: '世界地图',
      onClick: () => {
        setSelectedCountry(null);
        setSelectedBook(null);
        setLibraryView('map');
      },
      isCurrent: libraryView === 'map'
    });
    
    if (libraryView === 'country') {
      path.push({
        label: selectedCountry?.name || '国家详情',
        onClick: () => {
          setLibraryView('map');
        },
        isCurrent: true
      });
    }
    
    if (libraryView === 'bookReader' && selectedBook) {
      path.push({
        label: selectedBook.title,
        isCurrent: true
      });
    }
    
    if (libraryView === 'documents') {
      path.push({
        label: '文档管理',
        isCurrent: true
      });
    }
    
    if (libraryView === 'bookManagement') {
      path.push({
        label: '书籍管理',
        isCurrent: true
      });
    }
    
    if (libraryView === 'timeline') {
      path.push({
        label: '时间轴',
        isCurrent: true
      });
    }
    
    return (
      <div className="app-breadcrumbs">
        {path.map((item, index) => (
          <span key={index}>
            {index > 0 && <ChevronRight size={14} />}
            {item.onClick ? (
              <button 
                className={`app-breadcrumb-item ${item.isCurrent ? 'active' : ''}`}
                onClick={item.onClick}
              >
                {item.label}
              </button>
            ) : (
              <span className={`app-breadcrumb-item ${item.isCurrent ? 'active' : ''}`}>
                {item.label}
              </span>
            )}
          </span>
        ))}
      </div>
    );
  };

  const extractCodeFromTitle = (title: string): string | null => {
    const codePattern = /^(\d+-\d+-\d+-\d+)/;
    const match = title.match(codePattern);
    return match ? match[1] : null;
  };

  const findMatchingPhilosophyKeywords = useCallback((title: string): PhilosophyKeywordMatch[] => {
    const code = extractCodeFromTitle(title);
    if (!code) return [];

    const matches: PhilosophyKeywordMatch[] = [];
    
    philosophyKeywords.forEach((item) => {
      if (item.code.startsWith(code)) {
        matches.push({
          code: item.code,
          name: item.name,
          keywords: {
            field: item.field,
            ontology: parseKeywords(item.ontology || []),
            epistemology: parseKeywords(item.epistemology || []),
            teleology: parseKeywords(item.teleology || []),
          },
        });
      }
    });

    return matches;
  }, [philosophyKeywords]);

  const philosophyMatches = useMemo(() => {
    if (!activeDocument) return [];
    return findMatchingPhilosophyKeywords(activeDocument.title);
  }, [activeDocument, findMatchingPhilosophyKeywords]);

  const handleKeywordClick = useCallback((keyword: string) => {
    setHighlightedKeyword(keyword);
    setTimeout(() => {
      setHighlightedKeyword(null);
    }, 3000);
  }, []);

  const handleCreateHighlight = useCallback(async (keyword: string) => {
    if (!activeDocument) return;

    const content = activeDocument.original_content || '';
    const keywordIndex = content.indexOf(keyword);
    
    if (keywordIndex === -1) {
      alert(`在文章中未找到关键词: "${keyword}"`);
      return;
    }

    const existingHighlight = (activeDocument.highlights || []).find(
      h => h.highlighted_text === keyword
    );
    
    if (existingHighlight) {
      alert(`关键词 "${keyword}" 已经被标记过了`);
      return;
    }

    try {
      const response = await highlightApi.create(activeDocument.id, {
        highlighted_text: keyword,
        start_offset: keywordIndex,
        end_offset: keywordIndex + keyword.length,
        highlight_type: 'keyword',
      });
      
      const newHighlight = response.data;
      setActiveDocument({
        ...activeDocument,
        highlights: [...(activeDocument.highlights || []), newHighlight],
      });
    } catch (error) {
      console.error('Failed to create highlight:', error);
      alert('创建高亮标记失败，请重试');
    }
  }, [activeDocument]);

  useEffect(() => {
    loadFolders();
    loadDocuments();
  }, []);

  // 监听 PDF 页码变化事件
  useEffect(() => {
    const handlePageChange = (e: CustomEvent<{ pageNumber: number }>) => {
      console.log('[App] Received pdf-page-changed event:', e.detail.pageNumber);
      setCurrentPage(e.detail.pageNumber);
    };

    window.addEventListener('pdf-page-changed', handlePageChange as EventListener);

    return () => {
      window.removeEventListener('pdf-page-changed', handlePageChange as EventListener);
    };
  }, []);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizing(true);
  }, []);

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!isResizing) return;
    const newWidth = e.clientX;
    if (newWidth >= 200 && newWidth <= 500) {
      setSidebarWidth(newWidth);
    }
  }, [isResizing]);

  const handleMouseUp = useCallback(() => {
    setIsResizing(false);
  }, []);

  useEffect(() => {
    if (isResizing) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      return () => {
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
      };
    }
  }, [isResizing, handleMouseMove, handleMouseUp]);

  const loadFolders = async () => {
    try {
      const response = await folderApi.list();
      setFolders(response.data);
    } catch (error) {
      console.error('Failed to load folders:', error);
    }
  };

  const loadDocuments = async (folderId?: string | null) => {
    try {
      const params: any = {};
      if (folderId) params.folder_id = folderId;
      const response = await documentApi.list(params);
      const docsWithHighlights = response.data.map((doc: Document) => ({
        ...doc,
        highlights: doc.highlights || [],
      }));
      setDocuments(docsWithHighlights);
    } catch (error) {
      console.error('Failed to load documents:', error);
    }
  };

  const handleSelectFolder = (folderId: string | null) => {
    setSelectedFolderId(folderId);
    loadDocuments(folderId);
  };

  const handleSelectDocument = async (id: string) => {
    try {
      const response = await documentApi.get(id);
      const docWithHighlights = {
        ...response.data,
        highlights: response.data.highlights || [],
      };
      setActiveDocument(docWithHighlights);
      setActiveTab('framework');
    } catch (error) {
      console.error('Failed to load document:', error);
    }
  };

  const handleCreateDocument = async (data: CreateDocumentRequest) => {
    setIsLoading(true);
    try {
      const response = await documentApi.create(data);
      const docWithHighlights = {
        ...response.data,
        highlights: response.data.highlights || [],
      };
      setDocuments([docWithHighlights, ...documents]);
      setActiveDocument(docWithHighlights);
      setShowCreateModal(false);
      setActiveTab('edit');
    } catch (error) {
      console.error('Failed to create document:', error);
      alert('创建文档失败，请重试');
    } finally {
      setIsLoading(false);
    }
  };

  const handleUploadDocument = async (file: File) => {
    setUploadLoading(true);
    try {
      const response = await documentApi.upload(file, selectedFolderId || undefined);
      const docWithHighlights = {
        ...response.data,
        highlights: response.data.highlights || [],
      };
      setDocuments([docWithHighlights, ...documents]);
      setActiveDocument(docWithHighlights);
      setShowCreateModal(false);
      setActiveTab('edit');
    } catch (error) {
      console.error('Failed to upload document:', error);
      alert('上传文档失败，请重试');
    } finally {
      setUploadLoading(false);
    }
  };

  const handleGenerateFramework = async (docId?: string) => {
    const targetDocId = docId || activeDocument?.id;
    if (!targetDocId) return;
    
    const targetDoc = documents.find(d => d.id === targetDocId) || activeDocument;
    if (!targetDoc) return;

    setGeneratingDocIds(prev => new Set(prev).add(targetDocId));
    setStreamingContents(prev => {
      const newMap = new Map(prev);
      newMap.set(targetDocId, '');
      return newMap;
    });
    
    await documentApi.generateFrameworkStream(
      targetDocId,
      (chunk: string) => {
        setStreamingContents(prev => {
          const newMap = new Map(prev);
          const current = newMap.get(targetDocId) || '';
          newMap.set(targetDocId, current + chunk);
          return newMap;
        });
      },
      (fullContent: string) => {
        const updatedDoc = {
          ...targetDoc,
          framework_content: fullContent,
          highlights: targetDoc.highlights,
        };
        
        if (activeDocument?.id === targetDocId) {
          setActiveDocument(updatedDoc);
        }
        setDocuments(prev => prev.map(d =>
          d.id === targetDocId ? { ...updatedDoc, highlights: d.highlights } : d
        ));
        
        setGeneratingDocIds(prev => {
          const newSet = new Set(prev);
          newSet.delete(targetDocId);
          return newSet;
        });
        setStreamingContents(prev => {
          const newMap = new Map(prev);
          newMap.delete(targetDocId);
          return newMap;
        });
      },
      (error: string) => {
        console.error('Failed to generate framework:', error);
        alert(error || '生成正文失败，请重试');
        
        setGeneratingDocIds(prev => {
          const newSet = new Set(prev);
          newSet.delete(targetDocId);
          return newSet;
        });
        setStreamingContents(prev => {
          const newMap = new Map(prev);
          newMap.delete(targetDocId);
          return newMap;
        });
      }
    );
  };

  const handleDeleteDocument = async (id: string) => {
    if (!window.confirm('确定要删除这个文档吗？所有相关的高亮标记和解释都将被删除。')) {
      return;
    }

    try {
      await documentApi.delete(id);
      const newDocuments = documents.filter((d) => d.id !== id);
      setDocuments(newDocuments);
      if (activeDocument?.id === id) {
        setActiveDocument(newDocuments.length > 0 ? newDocuments[0] : null);
      }
    } catch (error) {
      console.error('Failed to delete document:', error);
      alert('删除失败，请重试');
    }
  };

  const handleHighlightCreated = (highlight: Highlight) => {
    if (!activeDocument) return;

    setActiveDocument({
      ...activeDocument,
      highlights: [...(activeDocument.highlights || []), highlight],
    });
  };

  const handleHighlightDeleted = (id: string) => {
    if (!activeDocument) return;

    setActiveDocument({
      ...activeDocument,
      highlights: (activeDocument.highlights || []).filter((h) => h.id !== id),
    });
  };

  const handleExplanationGenerated = (updatedHighlight: Highlight) => {
    if (!activeDocument) return;

    setActiveDocument({
      ...activeDocument,
      highlights: (activeDocument.highlights || []).map((h) =>
        h.id === updatedHighlight.id ? updatedHighlight : h
      ),
    });
  };

  const handleFrameworkUpdate = (updatedDoc: Document) => {
    setActiveDocument({
      ...activeDocument!,
      framework_content: updatedDoc.framework_content,
    });
    setDocuments(documents.map(d =>
      d.id === activeDocument?.id ? { ...d, framework_content: updatedDoc.framework_content } : d
    ));
  };

  const handleUploadToQuark = async () => {
    try {
      const response = await bookApi.list({});
      const books = response.data;
      const booksToUpload = books.filter((b: BookDocument) => !b.quark_upload_status || b.quark_upload_status === 'not_uploaded');
      
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
      const tags = Object.keys(booksByTag);
      const totalTags = tags.length;
      const startTime = Date.now();
      
      for (let i = 0; i < tags.length; i++) {
        const tag = tags[i];
        const tagBooks = booksByTag[tag];
        
        setQuarkUploadProgress({
          current: i + 1,
          total: totalTags,
          currentTag: tag,
          percentage: Math.round(((i + 1) / totalTags) * 100),
          startTime: startTime,
        });
        
        try {
          const response = await quarkApi.uploadByTag(tag, {
            book_ids: tagBooks.map(b => b.id),
          });
          
          if (response.data.success) {
            const skippedInfo = response.data.skipped_count > 0 
              ? `, 跳过 ${response.data.skipped_count} 本已上传` 
              : '';
            results.push({
              book_id: `folder-${tag}`,
              book_title: `📁 ${tag} (${response.data.uploaded_count}本上传${skippedInfo})`,
              success: true,
              message: `已上传到 ${response.data.folder_path}`,
              share_url: response.data.share_url || undefined,
              share_password: response.data.share_password || undefined,
            });
            
            for (const bookResult of response.data.results) {
              if (!bookResult.success && !bookResult.skipped) {
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
      setQuarkUploadProgress(null);
    } catch (error) {
      console.error('Failed to upload to Quark:', error);
      setQuarkUploading(false);
      setQuarkUploadProgress(null);
      alert('上传失败');
    }
  };

  const handleCopyShareUrl = (url: string, password?: string) => {
    const text = password ? `${url} 提取码: ${password}` : url;
    navigator.clipboard.writeText(text);
  };

  const handleCopyAllShareUrls = () => {
    const successfulResults = quarkUploadResults.filter(r => r.success && r.share_url);
    if (successfulResults.length === 0) {
      alert('没有可复制的链接');
      return;
    }
    
    const text = successfulResults.map(result => {
      const passwordText = result.share_password ? ` 提取码: ${result.share_password}` : '';
      return `${result.book_title}：${result.share_url}${passwordText}`;
    }).join('\n');
    
    navigator.clipboard.writeText(text).then(() => {
      alert(`已复制 ${successfulResults.length} 个链接到剪贴板`);
    }).catch(err => {
      console.error('Failed to copy:', err);
      alert('复制失败，请手动复制');
    });
  };

  return (
    <div className="app-container">
      <div className="header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 24px', background: 'var(--bg-white)', borderBottom: '1px solid var(--border-color)', boxShadow: '0 1px 3px rgba(0, 0, 0, 0.05)', marginBottom: 0, position: 'sticky', top: 0, zIndex: 100 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          {mainView === 'library' && (
            <BookOpen size={20} style={{ color: 'var(--primary-color)' }} />
          )}
          <h1 style={{ fontSize: '18px', fontWeight: '700', color: 'var(--text-primary)', margin: 0 }}>{mainView === 'library' ? '书籍与文档管理' : activeDocument?.title || '交互式文档增强系统'}</h1>
          {mainView === 'library' && renderLibraryBreadcrumbs()}
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <div className="view-switcher">
            <button
              className={`view-switch-btn ${mainView === 'library' ? 'active' : ''}`}
              onClick={() => setMainView('library')}
              title="书籍与文档管理"
            >
              <Library size={16} />
              书籍与文档管理
            </button>
            <button
              className={`view-switch-btn ${mainView === 'documents' ? 'active' : ''}`}
              onClick={() => setMainView('documents')}
              title="文档系统"
            >
              <FileQuestion size={16} />
              文档系统
            </button>
          </div>
          {mainView === 'documents' && (
            <>
              <button
                className="btn btn-secondary"
                onClick={() => setShowBatchUploadModal(true)}
                style={{ padding: '6px 12px', fontSize: '14px', display: 'flex', alignItems: 'center', gap: '4px' }}
              >
                <Upload size={14} />
                批量上传
              </button>
            </>
          )}
          <button
            className="btn btn-primary"
            onClick={() => setShowQuarkModal(true)}
            style={{ padding: '6px 12px', fontSize: '14px', display: 'flex', alignItems: 'center', gap: '4px' }}
          >
            <Cloud size={14} />
            夸克网盘
          </button>
          <button
            className="btn btn-secondary"
            onClick={() => setShowSettingsModal(true)}
            style={{ padding: '6px 12px', fontSize: '14px', display: 'flex', alignItems: 'center', gap: '4px' }}
          >
            <Settings size={14} />
            设置
          </button>
        </div>
      </div>

      <div className="app-body">
        {mainView === 'documents' && (
          <div 
            ref={sidebarRef}
            className="sidebar-wrapper"
            style={{ width: sidebarWidth }}
          >
            <Sidebar
              documents={documents}
              folders={folders}
              activeDocumentId={activeDocument?.id || null}
              selectedFolderId={selectedFolderId}
              onSelectFolder={handleSelectFolder}
              onSelectDocument={handleSelectDocument}
              onBatchUpload={() => setShowBatchUploadModal(true)}
              onDeleteDocument={handleDeleteDocument}
              onFoldersChange={loadFolders}
              onDocumentsChange={() => loadDocuments(selectedFolderId)}
            />
            <div
              className={`sidebar-resize-handle ${isResizing ? 'resizing' : ''}`}
              onMouseDown={handleMouseDown}
            >
              <GripVertical size={14} />
            </div>
          </div>
        )}

        <div className={`main-content ${mainView === 'library' ? 'full-width' : ''}`}>
          {mainView === 'library' ? (
            <LibraryView 
              currentView={libraryView}
              setCurrentView={setLibraryView}
              selectedCountry={selectedCountry}
              setSelectedCountry={setSelectedCountry}
              selectedBook={selectedBook}
              setSelectedBook={setSelectedBook}
              onDocumentSelect={(document) => {
                setMainView('documents');
                handleSelectDocument(document.id);
              }}
            />
          ) : activeDocument ? (
          <>
            <div style={{ display: 'flex', gap: 8, marginBottom: 15 }}>
              <span
                style={{
                  padding: '4px 12px',
                  background: '#e9ecef',
                  borderRadius: 4,
                  fontSize: 12,
                }}
              >
                {activeDocument.highlights?.length || 0} 个标记
              </span>
            </div>

            <div className="tabs">
              <button
                className={`tab ${activeTab === 'framework' ? 'active' : ''}`}
                onClick={() => setActiveTab('framework')}
              >
                <BookOpen size={16} style={{ marginRight: 6, verticalAlign: 'middle' }} />
                文章正文
              </button>
              <div className="tab-dropdown">
                <button
                  className={`tab ${activeTab === 'edit' || activeTab === 'view' ? 'active' : ''}`}
                  onClick={() => setActiveTab(activeTab === 'view' ? 'view' : 'edit')}
                >
                  <ChevronDown size={16} style={{ marginRight: 6, verticalAlign: 'middle' }} />
                  {activeTab === 'view' ? '阅读模式' : activeTab === 'edit' ? '原文模式' : '更多模式'}
                </button>
                <div className="dropdown-menu">
                  <button
                    className={`dropdown-item ${activeTab === 'edit' ? 'active' : ''}`}
                    onClick={() => setActiveTab('edit')}
                  >
                    <Edit3 size={14} style={{ marginRight: 6 }} />
                    原文模式
                  </button>
                  <button
                    className={`dropdown-item ${activeTab === 'view' ? 'active' : ''}`}
                    onClick={() => setActiveTab('view')}
                  >
                    <FileText size={14} style={{ marginRight: 6 }} />
                    阅读模式
                  </button>
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', gap: 20 }}>
              <div style={{ flex: 1 }}>
                {activeTab === 'framework' && (
                  <FrameworkView
                    document={activeDocument}
                    onGenerate={() => handleGenerateFramework(activeDocument.id)}
                    isGenerating={generatingDocIds.has(activeDocument.id)}
                    streamingContent={streamingContents.get(activeDocument.id) || ''}
                    generatingDocumentId={activeDocument.id}
                    generatingDocIds={generatingDocIds}
                    streamingContents={streamingContents}
                    onHighlightCreated={handleHighlightCreated}
                    onHighlightDeleted={handleHighlightDeleted}
                    onFrameworkUpdate={handleFrameworkUpdate}
                    isDeleteMode={isDeleteMode}
                  />
                )}
                {activeTab === 'edit' && (
                  <DocumentEditor
                    documentId={activeDocument.id}
                    content={activeDocument.original_content}
                    highlights={activeDocument.highlights || []}
                    onHighlightCreated={handleHighlightCreated}
                  />
                )}
                {activeTab === 'view' && (
                  <DocumentView
                    document={activeDocument}
                    highlightedKeyword={highlightedKeyword}
                  />
                )}
              </div>

              <div className="right-panel-fixed">
                {philosophyMatches.length > 0 && (
                  <PhilosophyKeywordsPanel
                    matches={philosophyMatches}
                    onKeywordClick={handleKeywordClick}
                    onCreateHighlight={handleCreateHighlight}
                  />
                )}
                <HighlightPanel
                  highlights={activeDocument.highlights || []}
                  onHighlightDeleted={handleHighlightDeleted}
                  onExplanationGenerated={handleExplanationGenerated}
                  isDeleteMode={isDeleteMode}
                  setIsDeleteMode={setIsDeleteMode}
                  showDeleteModeButton={activeTab === 'framework'}
                  documentId={activeDocument.id}
                  currentPage={currentPage}
                  onTimelineEventAdded={() => {
                    // 时间笔记添加后，刷新时间笔记列表
                    // DocumentTimelineNotes 组件会自动刷新
                  }}
                  onTimelineEventUpdated={() => {
                    // 时间笔记更新后，刷新时间笔记列表
                    // DocumentTimelineNotes 组件会自动刷新
                  }}
                />
                <DocumentTimelineNotes
                  documentId={activeDocument.id}
                  currentPage={currentPage}
                  onNoteClick={(note) => {
                    // 点击时间笔记时，可以跳转到对应页码或显示详情
                    console.log('Note clicked:', note);
                  }}
                />
              </div>
            </div>
          </>
        ) : (
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              height: '60%',
              color: '#6c757d',
            }}
          >
            <FileText size={80} style={{ marginBottom: 20, opacity: 0.3 }} />
            <h2>欢迎使用交互式文档增强系统</h2>
            <p style={{ marginTop: 10 }}>
              点击左侧边栏的 + 按钮创建您的第一个文档
            </p>
            <p style={{ marginTop: 5, fontSize: 12 }}>
              点击右上角"批量上传"可一次上传多个文件
            </p>
          </div>
        )}
      </div>
      </div>

      {showCreateModal && (
        <CreateDocumentModal
          onClose={() => setShowCreateModal(false)}
          onCreate={handleCreateDocument}
          onUpload={handleUploadDocument}
          onBatchUploadComplete={() => loadDocuments(selectedFolderId)}
          folderId={selectedFolderId}
          isLoading={isLoading || uploadLoading}
        />
      )}

      {showBatchUploadModal && (
        <BatchUploadModal
          onClose={() => setShowBatchUploadModal(false)}
          onSuccess={() => {
            setShowBatchUploadModal(false);
            loadDocuments();
          }}
          folderId={selectedFolderId}
        />
      )}

      {showSettingsModal && <SettingsModal onClose={() => setShowSettingsModal(false)} />}

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
              {quarkUploadProgress ? (
                <div className="quark-progress-container">
                  <div className="quark-progress-header">
                    <Loader2 size={20} className="spinning" />
                    <span>正在上传中...</span>
                  </div>
                  
                  <div className="quark-progress-bar-wrapper">
                    <div className="quark-progress-bar">
                      <div 
                        className="quark-progress-fill"
                        style={{ width: `${quarkUploadProgress.percentage}%` }}
                      />
                    </div>
                    <span className="quark-progress-percentage">{quarkUploadProgress.percentage}%</span>
                  </div>
                  
                  <div className="quark-progress-details">
                    <div className="quark-progress-item">
                      <span className="quark-progress-label">当前标签：</span>
                      <span className="quark-progress-value">{quarkUploadProgress.currentTag}</span>
                    </div>
                    <div className="quark-progress-item">
                      <span className="quark-progress-label">进度：</span>
                      <span className="quark-progress-value">{quarkUploadProgress.current} / {quarkUploadProgress.total}</span>
                    </div>
                    <div className="quark-progress-item">
                      <span className="quark-progress-label">已用时间：</span>
                      <span className="quark-progress-value">
                        {Math.floor((Date.now() - quarkUploadProgress.startTime) / 1000)}秒
                      </span>
                    </div>
                  </div>
                </div>
              ) : quarkUploadResults.length === 0 ? (
                <>
                  <div className="quark-upload-info" style={{ marginBottom: 16 }}>
                    <p style={{ margin: '0 0 8px 0', color: '#666' }}>
                      将所有书籍上传到夸克网盘，按标签分类存储。
                    </p>
                  </div>

                  <div style={{ background: '#f8f9fa', padding: 12, borderRadius: 8, marginBottom: 16 }}>
                    <h4 style={{ margin: '0 0 8px 0', fontSize: 14 }}>上传说明：</h4>
                    <ul style={{ margin: 0, paddingLeft: 20, fontSize: 13, color: '#666' }}>
                      <li>书籍将按标签分类到「我的电子图书馆/标签名」文件夹</li>
                      <li>每个标签文件夹会生成一个分享链接</li>
                      <li>相同标签的书籍共享同一个文件夹链接</li>
                    </ul>
                  </div>
                </>
              ) : (
                <div className="quark-upload-results">
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                    <h4 style={{ margin: 0, fontSize: 14 }}>上传结果：</h4>
                    {quarkUploadResults.filter(r => r.success && r.share_url).length > 0 && (
                      <button
                        className="btn btn-primary"
                        style={{ padding: '6px 12px', fontSize: 12, display: 'flex', alignItems: 'center', gap: 4 }}
                        onClick={handleCopyAllShareUrls}
                      >
                        <Copy size={14} />
                        一键复制所有链接
                      </button>
                    )}
                  </div>
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
                        <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
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
    </div>
  );
}

export default App;
