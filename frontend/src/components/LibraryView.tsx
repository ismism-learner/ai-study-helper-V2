import React, { useState, useEffect } from 'react';
import { Country, BookDocument, Document } from '../types';
import { countryApi } from '../api';
import CountryDetailView from './CountryDetailView';
import BookUploadModal from './BookUploadModal';
import DocumentManager from './DocumentManager';
import BookManagementPanel from './BookManagementPanel';
import TimelinePanel from './TimelinePanel';
import DashboardPanel from './DashboardPanel';
import BookReaderView from './BookReaderView';
import { Globe, Library, FileText, BookMarked, Clock } from 'lucide-react';

type ViewType = 'map' | 'country' | 'documents' | 'bookManagement' | 'timeline' | 'bookReader';

interface LibraryViewProps {
  currentView: ViewType;
  setCurrentView: (view: ViewType) => void;
  selectedCountry: Country | null;
  setSelectedCountry: (country: Country | null) => void;
  selectedBook: BookDocument | null;
  setSelectedBook: (book: BookDocument | null) => void;
  onDocumentSelect?: (document: Document) => void;
}

const LibraryView: React.FC<LibraryViewProps> = ({ 
  currentView, 
  setCurrentView, 
  selectedCountry, 
  setSelectedCountry, 
  selectedBook, 
  setSelectedBook,
  onDocumentSelect
}) => {
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [countries, setCountries] = useState<Country[]>([]);
  const [recentCountries, setRecentCountries] = useState<Country[]>([]);
  const [timelineRefresh, setTimelineRefresh] = useState(false);

  useEffect(() => {
    loadCountries();
    loadRecentCountries();
  }, []);

  const loadCountries = async () => {
    try {
      const response = await countryApi.list();
      setCountries(response.data);
    } catch (error) {
      console.error('Failed to load countries:', error);
    }
  };

  const loadRecentCountries = () => {
    const stored = localStorage.getItem('recentCountries');
    if (stored) {
      try {
        setRecentCountries(JSON.parse(stored));
      } catch (e) {
        console.error('Failed to parse recent countries:', e);
      }
    }
  };

  const saveRecentCountry = (country: Country) => {
    const updated = [country, ...recentCountries.filter(c => c.id !== country.id)].slice(0, 5);
    setRecentCountries(updated);
    localStorage.setItem('recentCountries', JSON.stringify(updated));
  };

  const handleCountryClick = (country: Country) => {
    setSelectedCountry(country);
    setCurrentView('country');
    saveRecentCountry(country);
  };

  const handleBookSelect = (book: BookDocument) => {
    setSelectedBook(book);
    setCurrentView('bookReader');
  };

  const handleDocumentSelect = (document: Document) => {
    if (onDocumentSelect) {
      onDocumentSelect(document);
      setTimelineRefresh(prev => !prev);
    }
  };

  const handleBackToMap = () => {
    setSelectedCountry(null);
    setCurrentView('map');
  };

  const renderStats = () => {
    const totalBooks = countries.reduce((sum, c) => sum + c.book_count, 0);
    const countriesWithBooks = countries.filter(c => c.book_count > 0).length;

    return (
      <div className="library-stats">
        <div className="stat-card">
          <Library size={24} />
          <div className="stat-info">
            <span className="stat-value">{totalBooks}</span>
            <span className="stat-label">总书籍数</span>
          </div>
        </div>
        <div className="stat-card">
          <Globe size={24} />
          <div className="stat-info">
            <span className="stat-value">{countriesWithBooks}</span>
            <span className="stat-label">覆盖国家</span>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="library-view">
      <div className="library-content">
        {currentView === 'map' && (
          <div className="map-view-container">
            <div className="map-sidebar">
              {renderStats()}
              
              <div className="sidebar-section">
                <h3>作者国籍数据管理</h3>
                <div className="country-list">
                  {countries
                    .filter(c => c.book_count > 0)
                    .sort((a, b) => b.book_count - a.book_count)
                    .slice(0, 8)
                    .map(country => (
                      <button
                        key={country.id}
                        className="country-item"
                        onClick={() => handleCountryClick(country)}
                      >
                        <span className="country-name">{country.name}</span>
                        <span className="book-badge">{country.book_count}</span>
                      </button>
                    ))}
                </div>
              </div>

              <div className="sidebar-section">
                <h3>文档管理</h3>
                <button
                  className="doc-management-btn"
                  onClick={() => setCurrentView('documents')}
                >
                  <FileText size={18} />
                  <span>文档管理</span>
                </button>
              </div>

              <div className="sidebar-section">
                <h3>基础书籍管理</h3>
                <button
                  className="doc-management-btn"
                  onClick={() => setCurrentView('bookManagement')}
                >
                  <BookMarked size={18} />
                  <span>书籍管理</span>
                </button>
              </div>

              <div className="sidebar-section">
                <h3>时间轴</h3>
                <button
                  className="doc-management-btn timeline-entry-btn"
                  onClick={() => setCurrentView('timeline')}
                >
                  <Clock size={18} />
                  <span>时间轴浏览</span>
                </button>
              </div>
            </div>

            <div className="map-main" style={{ overflow: 'auto' }}>
              <DashboardPanel />
            </div>
          </div>
        )}

        {currentView === 'country' && selectedCountry && (
          <CountryDetailView
            country={selectedCountry}
            onBack={handleBackToMap}
            onBookSelect={handleBookSelect}
          />
        )}

        {currentView === 'documents' && (
          <DocumentManager
            onBack={() => setCurrentView('map')}
            onDocumentClick={(doc) => {
              console.log('Document clicked:', doc);
            }}
          />
        )}

        {currentView === 'bookManagement' && (
          <BookManagementPanel
            onBack={() => setCurrentView('map')}
            onBookSelect={handleBookSelect}
          />
        )}

        {currentView === 'timeline' && (
          <TimelinePanel
            onBookSelect={handleBookSelect}
            onDocumentSelect={handleDocumentSelect}
            refresh={timelineRefresh}
          />
        )}

        {currentView === 'bookReader' && selectedBook && (
          <BookReaderView
            book={selectedBook}
            onBack={() => {
              setSelectedBook(null);
              setCurrentView('map');
            }}
          />
        )}
      </div>

      {showUploadModal && (
        <BookUploadModal
          countryId={selectedCountry?.id}
          onClose={() => setShowUploadModal(false)}
          onSuccess={() => {
            loadCountries();
            setShowUploadModal(false);
          }}
        />
      )}
    </div>
  );
};

export default LibraryView;
