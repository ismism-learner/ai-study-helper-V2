import React, { useState, useEffect, lazy, Suspense } from 'react';
import { BookDocument, Document } from '../types';
import { bookApi } from '../api';
const TagLibraryView = lazy(() => import('./TagLibraryView'));
const BookUploadModal = lazy(() => import('./BookUploadModal'));
const DocumentManager = lazy(() => import('./DocumentManager'));
const TimelinePanel = lazy(() => import('./TimelinePanel'));
const DashboardPanel = lazy(() => import('./DashboardPanel'));
const BookReaderView = lazy(() => import('./BookReaderView'));
import { Library, Clock, Tag } from 'lucide-react';

type ViewType = 'map' | 'tagLibrary' | 'documents' | 'timeline' | 'bookReader';

interface LibraryViewProps {
  currentView: ViewType;
  setCurrentView: (view: ViewType) => void;
  selectedTag: string | null;
  setSelectedTag: (tag: string | null) => void;
  selectedBook: BookDocument | null;
  setSelectedBook: (book: BookDocument | null) => void;
  onDocumentSelect?: (document: Document, page?: number) => void;
}

const LibraryView: React.FC<LibraryViewProps> = ({
  currentView,
  setCurrentView,
  selectedTag,
  setSelectedTag,
  selectedBook,
  setSelectedBook,
  onDocumentSelect
}) => {
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [totalBooks, setTotalBooks] = useState(0);
  const [tagCount, setTagCount] = useState(0);
  const [timelineRefresh, setTimelineRefresh] = useState(false);
  const [previousView, setPreviousView] = useState<ViewType>('map');
  const [initialPage, setInitialPage] = useState<number | undefined>(undefined);

  useEffect(() => {
    loadStats();
  }, []);

  const loadStats = async () => {
    try {
      const response = await bookApi.list();
      setTotalBooks(response.data.length);

      const tagSet = new Set<string>();
      response.data.forEach((book: BookDocument) => {
        book.tags?.forEach(tag => tagSet.add(tag));
      });
      setTagCount(tagSet.size);
    } catch (error) {
      console.error('Failed to load stats:', error);
    }
  };

  const handleBookSelect = (book: BookDocument, page?: number) => {
    setPreviousView(currentView);
    setSelectedBook(book);
    setInitialPage(page);
    setCurrentView('bookReader');
  };

  const handleDocumentSelect = (document: Document, page?: number) => {
    if (onDocumentSelect) {
      onDocumentSelect(document, page);
      setTimelineRefresh(prev => !prev);
    }
  };

  return (
    <div className="library-view">
      <div className="library-content">
        {currentView === 'map' && (
          <div className="map-view-container">
            <div className="map-sidebar">
              <div className="library-stats">
                <div className="stat-card">
                  <Library size={24} />
                  <div className="stat-info">
                    <span className="stat-value">{totalBooks}</span>
                    <span className="stat-label">总书籍数</span>
                  </div>
                </div>
                <div className="stat-card">
                  <Tag size={24} />
                  <div className="stat-info">
                    <span className="stat-value">{tagCount}</span>
                    <span className="stat-label">标签数</span>
                  </div>
                </div>
              </div>

              <div className="sidebar-section">
                <h3>图书馆</h3>
                <button
                  className="doc-management-btn"
                  onClick={() => { setSelectedTag(null); setCurrentView('tagLibrary'); }}
                  style={{ width: '100%', justifyContent: 'center' }}
                >
                  <Library size={18} />
                  <span>查看全部书籍</span>
                </button>
              </div>

              <div className="sidebar-section">
                <h3>年表</h3>
                <button
                  className="doc-management-btn timeline-entry-btn"
                  onClick={() => setCurrentView('timeline')}
                >
                  <Clock size={18} />
                  <span>年表浏览</span>
                </button>
              </div>
            </div>

            <div className="map-main" style={{ overflow: 'auto' }}>
              <Suspense fallback={<div>加载中...</div>}>
                <DashboardPanel onBookSelect={handleBookSelect} />
              </Suspense>
            </div>
          </div>
        )}

        {currentView === 'tagLibrary' && (
          <Suspense fallback={<div>加载中...</div>}>
            <TagLibraryView
              selectedTag={selectedTag}
              onBookSelect={handleBookSelect}
              onTagSelect={(tag) => setSelectedTag(tag)}
            />
          </Suspense>
        )}

        {currentView === 'documents' && (
          <Suspense fallback={<div>加载中...</div>}>
            <DocumentManager
              onBack={() => setCurrentView('map')}
              onDocumentClick={(doc) => {
                console.log('Document clicked:', doc);
              }}
            />
          </Suspense>
        )}

        {currentView === 'timeline' && (
          <Suspense fallback={<div>加载中...</div>}>
            <TimelinePanel
              onBookSelect={handleBookSelect}
              onDocumentSelect={handleDocumentSelect}
              refresh={timelineRefresh}
            />
          </Suspense>
        )}

        {currentView === 'bookReader' && selectedBook && (
          <Suspense fallback={<div>加载中...</div>}>
            <BookReaderView
              book={selectedBook}
              initialPage={initialPage}
              onBack={() => {
                setSelectedBook(null);
                setInitialPage(undefined);
                setCurrentView(previousView);
                if (previousView !== 'map') setSelectedTag(null);
              }}
            />
          </Suspense>
        )}
      </div>

      {showUploadModal && (
        <Suspense fallback={<div>加载中...</div>}>
          <BookUploadModal
            onClose={() => setShowUploadModal(false)}
            onSuccess={() => {
              loadStats();
              setShowUploadModal(false);
            }}
          />
        </Suspense>
      )}
    </div>
  );
};

export default LibraryView;
