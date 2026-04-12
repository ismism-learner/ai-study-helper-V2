import React from 'react';
import { Search, X, Plus, Edit3, Zap, BookOpen, Clock } from 'lucide-react';
import ConfirmDialog from '../ConfirmDialog';
import { usePDFNotes } from './usePDFNotes';
import { usePanelDrag } from './usePanelDrag';
import { NoteEditor } from './NoteEditor';
import { NotesList, TimelineNotesView } from './NotesList';
import { QuickModePanel } from './QuickModePanel';
import { PDFNotesPanelProps } from './types';
import { quickNoteApi } from '../../api';

const PDFNotesPanel: React.FC<PDFNotesPanelProps> = ({
  documentId,
  document,
  bookId,
  bookTags,
  currentPage,
  onNoteClick,
  onClose,
}) => {
  const {
    isLoading,
    searchQuery,
    setSearchQuery,
    filterMode,
    setFilterMode,
    deleteConfirm,
    setDeleteConfirm,
    expandedSections,
    newNote,
    setNewNote,
    showAddNoteForm,
    setShowAddNoteForm,
    editingNote,
    setEditingNote,
    isGenerating,
    generateError,
    isQuickMode,
    setIsQuickMode,
    quickContent,
    setQuickContent,
    isSavingQuick,
    quickNotes,
    allUnprocessedQuickNotes,
    selectedQuickNotes,
    isBatchPolishing,
    polishResults,
    setPolishResults,
    isGeneratingTimeline,
    showTimeInput,
    setShowTimeInput,
    viewMode,
    setViewMode,
    filteredNotes,
    groupedNotes,
    handleConfirmDelete,
    handleNoteClick,
    toggleSection,
    handleAddNote,
    handleEditNote,
    handleUpdateNote,
    handleGenerateNote,
    handleQuickSave,
    handleNewQuickNote,
    handleSelectQuickNote,
    handleSelectAllQuickNotes,
    handleBatchPolish,
    handleBatchTimelineGenerate,
    parseTimeInput,
  } = usePDFNotes(documentId, document, bookId, bookTags, currentPage, onNoteClick);

  const {
    position,
    isDragging,
    panelRef,
    handlePointerDown,
    handlePanelMouseMove,
    handlePanelMouseUp,
  } = usePanelDrag();

  const handleDeleteQuickNote = async (noteId: string) => {
    try {
      await quickNoteApi.delete(noteId);
    } catch (error) {
      console.error('Failed to delete quick note:', error);
      alert('ɾ��ʧ��');
    }
  };

  const handleCancelEdit = () => {
    setNewNote({
      title: '',
      content: '',
      page_number: currentPage,
      tags: [],
      event_date: '',
      event_date_display: '',
      event_date_end: '',
      event_date_end_display: '',
      is_time_range: false,
    });
    setEditingNote(null);
    setShowAddNoteForm(false);
    setShowTimeInput(false);
  };

  if (isLoading) {
    return null;
  }

  return (
    <>
      <div 
        ref={panelRef}
        className={`pdf-notes-panel ${isDragging ? 'dragging' : ''}`}
        style={{
          position: 'fixed',
          left: position.x,
          top: position.y,
          zIndex: 1000
        }}
        onMouseMove={handlePanelMouseMove}
        onMouseUp={handlePanelMouseUp}
        onMouseLeave={handlePanelMouseUp}
      >
        <div 
          className="pdf-notes-header"
          onPointerDown={handlePointerDown}
          style={{ cursor: isDragging ? 'grabbing' : 'grab' }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <h3>PDF �ʼ�</h3>
              <span className="current-page-badge">�� {currentPage} ҳ</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <button
                onClick={() => setIsQuickMode(!isQuickMode)}
                className={`mode-toggle-btn ${isQuickMode ? 'active' : ''}`}
                title={isQuickMode ? '�л�����׼ģʽ' : '�л������ټ�¼ģʽ'}
              >
                {isQuickMode ? <Zap size={14} /> : <Edit3 size={14} />}
                {isQuickMode ? '����ģʽ' : '��׼ģʽ'}
              </button>
              {onClose && (
                <button
                  className="close-btn"
                  onClick={onClose}
                  title="�ر�"
                >
                  <X size={16} />
                </button>
              )}
            </div>
          </div>
          
          {isQuickMode ? null : (
            <div className="pdf-notes-controls">
              <div className="search-box">
                <Search size={16} />
                <input
                  type="text"
                  placeholder="�����ʼ�..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
                {searchQuery && (
                  <button
                    className="clear-search"
                    onClick={() => setSearchQuery('')}
                  >
                    <X size={14} />
                  </button>
                )}
              </div>
              <div className="filter-buttons">
                <button
                  className={`filter-btn ${filterMode === 'all' ? 'active' : ''}`}
                  onClick={() => setFilterMode('all')}
                  title="��ʾȫ���ʼ�"
                >
                  ȫ��
                </button>
                <button
                  className={`filter-btn ${filterMode === 'current' ? 'active' : ''}`}
                  onClick={() => setFilterMode('current')}
                  title="����ʾ��ǰҳ�ʼ�"
                >
                  ��ǰҳ
                </button>
                <button
                  className={`filter-btn ${filterMode === 'nearby' ? 'active' : ''}`}
                  onClick={() => setFilterMode('nearby')}
                  title="��ʾ����ҳ��ʼ�"
                >
                  ����
                </button>
              </div>
            </div>
          )}
        </div>

        <div className="pdf-notes-container">
          {isQuickMode ? (
            <QuickModePanel
              quickNotes={quickNotes}
              allUnprocessedQuickNotes={allUnprocessedQuickNotes}
              selectedQuickNotes={selectedQuickNotes}
              quickContent={quickContent}
              isSavingQuick={isSavingQuick}
              isBatchPolishing={isBatchPolishing}
              polishResults={polishResults}
              isGeneratingTimeline={isGeneratingTimeline}
              onQuickContentChange={setQuickContent}
              onQuickSave={handleQuickSave}
              onNewQuickNote={handleNewQuickNote}
              onSelectQuickNote={handleSelectQuickNote}
              onSelectAllQuickNotes={handleSelectAllQuickNotes}
              onBatchPolish={handleBatchPolish}
              onBatchTimelineGenerate={handleBatchTimelineGenerate}
              onDeleteQuickNote={handleDeleteQuickNote}
              onNoteClick={onNoteClick}
              onClearPolishResults={() => setPolishResults(null)}
            />
          ) : (
            <>
              {filteredNotes.length === 0 ? (
                <div className="pdf-notes-empty">
                  <BookOpen size={48} strokeWidth={1} />
                  <p>���ޱʼ�����</p>
                  <p className="hint">��ǰҳ: �� {currentPage} ҳ</p>
                  <button
                    className="btn btn-primary"
                    onClick={() => {
                      setNewNote(prev => ({ ...prev, page_number: currentPage }));
                      setShowAddNoteForm(true);
                    }}
                  >
                    <Plus size={16} />
                    Ϊ��ǰҳ���ӱʼ�
                  </button>
                </div>
              ) : (
                <>
                  {!showAddNoteForm && (
                    <div className="view-mode-toggle" style={{ 
                      display: 'flex', 
                      gap: '8px', 
                      marginBottom: '12px',
                      padding: '4px',
                      background: 'var(--bg-light)',
                      borderRadius: '6px'
                    }}>
                      <button
                        onClick={() => setViewMode('page')}
                        style={{
                          flex: 1,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: '6px',
                          padding: '8px 12px',
                          background: viewMode === 'page' ? 'var(--primary-color)' : 'transparent',
                          border: 'none',
                          borderRadius: '4px',
                          cursor: 'pointer',
                          fontSize: '12px',
                          color: viewMode === 'page' ? 'white' : 'var(--text-secondary)',
                          transition: 'all 0.2s'
                        }}
                      >
                        <BookOpen size={14} />
                        ҳ����ͼ
                      </button>
                      <button
                        onClick={() => setViewMode('timeline')}
                        style={{
                          flex: 1,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: '6px',
                          padding: '8px 12px',
                          background: viewMode === 'timeline' ? 'var(--primary-color)' : 'transparent',
                          border: 'none',
                          borderRadius: '4px',
                          cursor: 'pointer',
                          fontSize: '12px',
                          color: viewMode === 'timeline' ? 'white' : 'var(--text-secondary)',
                          transition: 'all 0.2s'
                        }}
                      >
                        <Clock size={14} />
                        ʱ������
                      </button>
                    </div>
                  )}
                  
                  {!showAddNoteForm && (
                    <button
                      className="btn btn-primary add-note-btn"
                      onClick={() => {
                        setNewNote(prev => ({ ...prev, page_number: currentPage }));
                        setEditingNote(null);
                        setShowAddNoteForm(true);
                      }}
                    >
                      <Plus size={16} />
                      ���ӱʼ� (�� {currentPage} ҳ)
                    </button>
                  )}

                  {showAddNoteForm && (
                    <NoteEditor
                      editingNote={editingNote}
                      newNote={newNote}
                      setNewNote={setNewNote}
                      setEditingNote={setEditingNote}
                      currentPage={currentPage}
                      isGenerating={isGenerating}
                      generateError={generateError}
                      showTimeInput={showTimeInput}
                      setShowTimeInput={setShowTimeInput}
                      onGenerate={handleGenerateNote}
                      onSave={editingNote ? handleUpdateNote : handleAddNote}
                      onCancel={handleCancelEdit}
                      parseTimeInput={parseTimeInput}
                    />
                  )}

                  {viewMode === 'page' ? (
                    <NotesList
                      groupedNotes={groupedNotes}
                      expandedSections={expandedSections}
                      currentPage={currentPage}
                      onToggleSection={toggleSection}
                      onNoteClick={handleNoteClick}
                      onEditNote={handleEditNote}
                      onDeleteClick={(note) => setDeleteConfirm({
                        isOpen: true,
                        noteId: note.id,
                        noteTitle: note.title,
                      })}
                    />
                  ) : (
                    <TimelineNotesView
                      filteredNotes={filteredNotes}
                      currentPage={currentPage}
                      onNoteClick={handleNoteClick}
                    />
                  )}
                </>
              )}
            </>
          )}
        </div>
      </div>

      <ConfirmDialog
        isOpen={deleteConfirm.isOpen}
        title="ȷ��ɾ��"
        message={`ȷ��Ҫɾ���ʼ�"${deleteConfirm.noteTitle}"�𣿴˲����޷�������`}
        confirmText="ɾ��"
        cancelText="ȡ��"
        type="delete"
        onConfirm={handleConfirmDelete}
        onCancel={() => setDeleteConfirm({ isOpen: false, noteId: '', noteTitle: '' })}
      />
    </>
  );
};

export default PDFNotesPanel;
