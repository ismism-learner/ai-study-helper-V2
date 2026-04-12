import React from 'react';
import { ChevronUp, ChevronDown, Edit3, Trash2, BookOpen, Clock, Tag, Calendar } from 'lucide-react';
import { PDFNote } from './types';

interface NotesListProps {
  groupedNotes: Record<string, PDFNote[]>;
  expandedSections: Set<string>;
  currentPage: number;
  onToggleSection: (section: string) => void;
  onNoteClick: (note: PDFNote) => void;
  onEditNote: (note: PDFNote) => void;
  onDeleteClick: (note: PDFNote) => void;
}

const getSectionTitle = (section: string, currentPage: number): string => {
  switch (section) {
    case 'current':
      return `当前页 (第 ${currentPage} 页)`;
    case 'nearby':
      return '附近页面';
    case 'other':
      return '其他页面';
    default:
      return section;
  }
};

const getSectionIcon = (section: string) => {
  switch (section) {
    case 'current':
      return <BookOpen size={14} />;
    case 'nearby':
      return null;
    default:
      return <Clock size={14} />;
  }
};

export const NotesList: React.FC<NotesListProps> = ({
  groupedNotes,
  expandedSections,
  currentPage,
  onToggleSection,
  onNoteClick,
  onEditNote,
  onDeleteClick,
}) => {
  return (
    <>
      {Object.entries(groupedNotes).map(([section, sectionNotes]) => {
        if (sectionNotes.length === 0) return null;
        
        const isExpanded = expandedSections.has(section);
        const sectionTitle = getSectionTitle(section, currentPage);
        
        return (
          <div key={section} className={`pdf-notes-section ${section === 'current' ? 'current-section' : ''}`}>
            <div
              className="pdf-notes-section-header"
              onClick={() => onToggleSection(section)}
            >
              <div className="section-title">
                {getSectionIcon(section)}
                {sectionTitle}
              </div>
              <div className="note-count">{sectionNotes.length} 条笔记</div>
              <div className="expand-icon">
                {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
              </div>
            </div>
            
            {isExpanded && (
              <div className="pdf-notes-list">
                {sectionNotes.map(note => (
                  <div
                    key={note.id}
                    className={`pdf-note-card ${note.page_number === currentPage ? 'current-page-note' : ''}`}
                    onClick={() => onNoteClick(note)}
                  >
                    <div className="note-card-header">
                      <h4 className="note-title">{note.title}</h4>
                      <div className="note-actions">
                        <button
                          className="action-btn edit-btn"
                          onClick={(e) => {
                            e.stopPropagation();
                            onEditNote(note);
                          }}
                          title="编辑"
                        >
                          <Edit3 size={16} />
                        </button>
                        <button
                          className="action-btn delete-btn"
                          onClick={(e) => {
                            e.stopPropagation();
                            onDeleteClick(note);
                          }}
                          title="删除"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </div>
                    
                    <div className="note-card-content">
                      {note.content && (
                        <p className="note-content">{note.content}</p>
                      )}
                      
                      <div className="note-meta">
                        <div className={`meta-item ${note.page_number === currentPage ? 'current-page' : ''}`}>
                          <BookOpen size={12} />
                          <span>第 {note.page_number} 页</span>
                          {note.page_number === currentPage && (
                            <span className="current-indicator">当前</span>
                          )}
                        </div>
                        <div className="meta-item">
                          <Clock size={12} />
                          <span>{new Date(note.created_at).toLocaleString()}</span>
                        </div>
                      </div>
                      
                      {note.tags && note.tags.length > 0 && (
                        <div className="note-tags">
                          {note.tags.map((tag, index) => (
                            <span key={index} className="note-tag">
                              <Tag size={10} />
                              {tag}
                            </span>
                          ))}
                        </div>
                      )}
                      
                      {note.event_date && (
                        <div className="note-time-attribute" style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '4px',
                          marginTop: '8px',
                          padding: '4px 8px',
                          background: 'rgba(99, 102, 241, 0.1)',
                          borderRadius: '4px',
                          fontSize: '11px',
                          color: 'var(--primary-color)'
                        }}>
                          <Clock size={10} />
                          <span>{note.event_date_display || note.event_date}</span>
                          {note.event_date_end && (
                            <>
                              <span>~</span>
                              <span>{note.event_date_end_display || note.event_date_end}</span>
                            </>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </>
  );
};

interface TimelineNotesViewProps {
  filteredNotes: PDFNote[];
  currentPage: number;
  onNoteClick: (note: PDFNote) => void;
}

export const TimelineNotesView: React.FC<TimelineNotesViewProps> = ({
  filteredNotes,
  currentPage,
  onNoteClick,
}) => {
  const timeNotes = filteredNotes
    .filter(n => n.event_date)
    .sort((a, b) => (a.event_date || '').localeCompare(b.event_date || ''));
  
  if (timeNotes.length === 0) {
    return (
      <div className="timeline-empty" style={{
        textAlign: 'center',
        padding: '40px 20px',
        color: 'var(--text-secondary)'
      }}>
        <Clock size={48} strokeWidth={1} style={{ opacity: 0.3, marginBottom: '12px' }} />
        <p style={{ marginBottom: '8px' }}>暂无时间序列笔记</p>
        <p style={{ fontSize: '12px' }}>为笔记添加时间属性后，将在此显示时间序列视图</p>
      </div>
    );
  }
  
  const groupedByYear: Record<string, PDFNote[]> = {};
  timeNotes.forEach(note => {
    const year = (note.event_date || '').substring(0, 4);
    if (!groupedByYear[year]) groupedByYear[year] = [];
    groupedByYear[year].push(note);
  });
  
  return (
    <div className="timeline-notes-view">
      {Object.entries(groupedByYear)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([year, yearNotes]) => {
          const yearNum = parseInt(year);
          const isBC = yearNum < 0;
          const displayYear = isBC ? `公元前 ${Math.abs(yearNum)} 年` : `${year} 年`;
          
          return (
            <div key={year} className="timeline-year-group" style={{
              marginBottom: '16px',
              border: '1px solid var(--border-color)',
              borderRadius: '8px',
              overflow: 'hidden'
            }}>
              <div className="year-header" style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '10px 12px',
                background: 'rgba(99, 102, 241, 0.1)',
                borderBottom: '1px solid var(--border-color)'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Calendar size={14} style={{ color: 'var(--primary-color)' }} />
                  <span style={{ fontWeight: 600, color: 'var(--primary-color)' }}>{displayYear}</span>
                </div>
                <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                  {yearNotes.length} 条笔记
                </span>
              </div>
              <div className="year-notes" style={{ padding: '8px' }}>
                {yearNotes.map(note => (
                  <div
                    key={note.id}
                    className="timeline-note-card"
                    onClick={() => onNoteClick(note)}
                    style={{
                      padding: '10px',
                      marginBottom: '8px',
                      background: 'var(--bg-light)',
                      borderRadius: '6px',
                      cursor: 'pointer',
                      border: note.page_number === currentPage ? '1px solid var(--primary-color)' : '1px solid transparent'
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '4px' }}>
                      <h4 style={{ fontSize: '13px', fontWeight: 600, margin: 0 }}>{note.title}</h4>
                      <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
                        {note.event_date_display || note.event_date}
                      </span>
                    </div>
                    {note.content && (
                      <p style={{ fontSize: '12px', color: 'var(--text-secondary)', margin: '4px 0', lineHeight: 1.4 }}>
                        {note.content.substring(0, 80)}{note.content.length > 80 ? '...' : ''}
                      </p>
                    )}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginTop: '6px' }}>
                      <span style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '11px', color: 'var(--text-secondary)' }}>
                        <BookOpen size={10} />
                        第 {note.page_number} 页
                      </span>
                      {note.tags && note.tags.length > 0 && (
                        <div style={{ display: 'flex', gap: '4px' }}>
                          {note.tags.slice(0, 2).map((tag, i) => (
                            <span key={i} style={{
                              fontSize: '10px',
                              padding: '1px 6px',
                              background: 'rgba(99, 102, 241, 0.1)',
                              borderRadius: '3px',
                              color: 'var(--primary-color)'
                            }}>
                              {tag}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
    </div>
  );
};
