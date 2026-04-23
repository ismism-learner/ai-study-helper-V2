import { useState, useMemo, lazy, Suspense } from 'react';
import { CreateDocumentRequest, BookDocument } from './types';
import { useDocuments, useQuarkUpload, usePhilosophyKeywords, useSidebarResize } from './hooks';
import Sidebar from './components/Sidebar';
import DocumentEditor from './components/DocumentEditor';
import DocumentView from './components/DocumentView';
import ResizablePanels from './components/ResizablePanels';
import KnowledgeGraphPanel from './components/KnowledgeGraphPanel';
import CognitiveChainPanel from './components/CognitiveChainPanel';
import FrameworkView from './components/FrameworkView';
import HighlightPanel from './components/HighlightPanel';
import PhilosophyKeywordsPanel from './components/PhilosophyKeywordsPanel';
import DocumentTimelineNotes from './components/DocumentTimelineNotes';
const CreateDocumentModal = lazy(() => import('./components/CreateDocumentModal'));
const BatchUploadModal = lazy(() => import('./components/BatchUploadModal'));
const SettingsModal = lazy(() => import('./components/SettingsModal'));
import LibraryView from './components/LibraryView';
import { FileText, Edit3, BookOpen, Settings, Upload, ChevronDown, GripVertical, Library, FileQuestion, ChevronRight, Cloud, MessageCircle, Network } from 'lucide-react';
const QuarkUploadModal = lazy(() => import('./components/QuarkUploadModal'));

type LibraryViewType = 'map' | 'tagLibrary' | 'documents' | 'timeline' | 'bookReader';
type MainViewType = 'documents' | 'library';

function App() {
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showBatchUploadModal, setShowBatchUploadModal] = useState(false);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [mainView, setMainView] = useState<MainViewType>('library');
  const [libraryView, setLibraryView] = useState<LibraryViewType>('map');
  const [selectedTag, setSelectedTag] = useState<string | null>(null);
  const [selectedBook, setSelectedBook] = useState<BookDocument | null>(null);
  const [pendingQuestion, setPendingQuestion] = useState<string | null>(null);

  const {
    documents,
    folders,
    activeDocument,
    activeTab,
    setActiveTab,
    selectedFolderId,
    isLoading,
    uploadLoading,
    generatingDocIds,
    streamingContents,
    isDeleteMode,
    setIsDeleteMode,
    currentPage,
    loadFolders,
    loadDocuments,
    handleSelectFolder,
    handleSelectDocument,
    handleCreateDocument,
    handleUploadDocument,
    handleGenerateFramework,
    handleDeleteDocument,
    handleHighlightCreated,
    handleHighlightDeleted,
    handleExplanationGenerated,
    handleFrameworkUpdate,
    handleCreateHighlightFromKeyword,
  } = useDocuments();

  const {
    showQuarkModal,
    setShowQuarkModal,
    quarkUploading,
    quarkUploadResults,
    quarkUploadProgress,
    handleUploadToQuark,
    handleCopyShareUrl,
    handleCopyAllShareUrls,
  } = useQuarkUpload();

  const {
    highlightedKeyword,
    findMatchingPhilosophyKeywords,
    handleKeywordClick,
  } = usePhilosophyKeywords();

  const {
    sidebarWidth,
    isResizing,
    sidebarRef,
    handleMouseDown,
  } = useSidebarResize(280);

  const philosophyMatches = useMemo(() => {
    if (!activeDocument) return [];
    return findMatchingPhilosophyKeywords(activeDocument.title);
  }, [activeDocument, findMatchingPhilosophyKeywords]);

  const renderLibraryBreadcrumbs = () => {
    const path = [];

    path.push({
      label: '图书馆',
      onClick: () => {
        setSelectedTag(null);
        setSelectedBook(null);
        setLibraryView('map');
      },
      isCurrent: libraryView === 'map'
    });

    if (libraryView === 'tagLibrary' && selectedTag) {
      path.push({
        label: selectedTag,
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
    
    if (libraryView === 'timeline') {
      path.push({
        label: '年表',
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

  const onCreateDocument = async (data: CreateDocumentRequest) => {
    const result = await handleCreateDocument(data);
    if (result.success) {
      setShowCreateModal(false);
      setActiveTab('edit');
    }
  };

  const onUploadDocument = async (file: File) => {
    const result = await handleUploadDocument(file, selectedFolderId);
    if (result.success) {
      setShowCreateModal(false);
      setActiveTab('edit');
    }
  };

  const onCreateHighlight = async (keyword: string) => {
    await handleCreateHighlightFromKeyword(keyword);
  };

  return (
    <div className="app-container">
      <div className="header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 24px', background: 'var(--bg-white)', borderBottom: '1px solid var(--border-color)', boxShadow: '0 1px 3px rgba(0, 0, 0, 0.05)', marginBottom: 0, position: 'sticky', top: 0, zIndex: 100 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          {mainView === 'library' && (
            <BookOpen size={20} style={{ color: 'var(--primary-color)' }} />
          )}
          <h1 style={{ fontSize: '18px', fontWeight: '700', color: 'var(--text-primary)', margin: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '200px' }}>{mainView === 'library' ? '书籍与文档管理' : '交互式文档增强系统'}</h1>
          {mainView === 'documents' && activeDocument && (
            <span style={{ fontSize: '14px', color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '400px' }}>{activeDocument.title}</span>
          )}
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
              selectedTag={selectedTag}
              setSelectedTag={setSelectedTag}
              selectedBook={selectedBook}
              setSelectedBook={setSelectedBook}
              onDocumentSelect={(document, page) => {
                setMainView('documents');
                handleSelectDocument(document.id, page);
              }}
            />
          ) : activeDocument ? (
          <>
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

            <div className="document-three-panel-layout">
              <ResizablePanels
                panels={[
                  { id: 'doc', title: '文档', icon: <FileText size={14} />, defaultWidth: 40, minWidth: 25, maxWidth: 60, collapsible: true },
                  { id: 'qa', title: '问答', icon: <MessageCircle size={14} />, defaultWidth: 30, minWidth: 15, maxWidth: 50, collapsible: true },
                  { id: 'graph', title: '知识图谱', icon: <Network size={14} />, defaultWidth: 30, minWidth: 15, maxWidth: 50, collapsible: true },
                ]}
                className="doc-resizable-panels"
              >
                {/* 第1栏：文档内容 */}
                <div className="doc-panel-content">
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
                      onAskQuestion={(question: string) => setPendingQuestion(question)}
                    />
                  )}
                  {activeTab === 'edit' && (
                    <DocumentEditor
                      documentId={activeDocument.id}
                      content={activeDocument.original_content}
                      highlights={activeDocument.highlights || []}
                      onHighlightCreated={handleHighlightCreated}
                      onAskQuestion={(question: string) => setPendingQuestion(question)}
                    />
                  )}
                  {activeTab === 'view' && (
                    <DocumentView
                      document={activeDocument}
                      highlightedKeyword={highlightedKeyword}
                    />
                  )}
                  <div className="doc-panel-sidebar">
                    {philosophyMatches.length > 0 && (
                      <PhilosophyKeywordsPanel
                        matches={philosophyMatches}
                        onKeywordClick={handleKeywordClick}
                        onCreateHighlight={onCreateHighlight}
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
                      }}
                      onTimelineEventUpdated={() => {
                      }}
                    />
                    <DocumentTimelineNotes
                      documentId={activeDocument.id}
                      currentPage={currentPage}
                      onNoteClick={(note) => {
                        console.log('Note clicked:', note);
                      }}
                    />
                  </div>
                </div>

                {/* 第2栏：问答/认知链 */}
                <CognitiveChainPanel
                  sourceDocId={activeDocument.id}
                  bookTitle={activeDocument.title}
                  pendingQuestion={pendingQuestion}
                  onQuestionConsumed={() => setPendingQuestion(null)}
                />

                {/* 第3栏：知识图谱 */}
                <KnowledgeGraphPanel
                  onNodeClick={(node) => {
                    if (node) {
                      console.log('选中节点:', node.name);
                    }
                  }}
                />
              </ResizablePanels>
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
        <Suspense fallback={null}>
          <CreateDocumentModal
            onClose={() => setShowCreateModal(false)}
            onCreate={onCreateDocument}
            onUpload={onUploadDocument}
            onBatchUploadComplete={() => loadDocuments(selectedFolderId)}
            folderId={selectedFolderId}
            isLoading={isLoading || uploadLoading}
          />
        </Suspense>
      )}

      {showBatchUploadModal && (
        <Suspense fallback={null}>
          <BatchUploadModal
            onClose={() => setShowBatchUploadModal(false)}
            onSuccess={() => {
              setShowBatchUploadModal(false);
              loadDocuments();
            }}
            folderId={selectedFolderId}
          />
        </Suspense>
      )}

      {showSettingsModal && (
        <Suspense fallback={null}>
          <SettingsModal onClose={() => setShowSettingsModal(false)} />
        </Suspense>
      )}

      <Suspense fallback={null}>
        <QuarkUploadModal
          show={showQuarkModal}
          uploading={quarkUploading}
          results={quarkUploadResults}
          progress={quarkUploadProgress}
          onClose={() => setShowQuarkModal(false)}
          onUpload={handleUploadToQuark}
          onCopyShareUrl={handleCopyShareUrl}
          onCopyAllShareUrls={handleCopyAllShareUrls}
        />
      </Suspense>
    </div>
  );
}

export default App;
