import React, { useState, useRef, useCallback, useEffect } from 'react';
import { Document, Folder } from '../types';
import { FileText, Trash2, Upload, Clock, Highlighter, Move, FolderOpen, X, Check, Home, FileText as FileTextIcon, Loader, Square, CheckSquare, RefreshCw, AlertTriangle, Calendar, Sparkles } from 'lucide-react';
import FolderManager from './FolderManager';
import BatchTimelineGeneratePanel from './BatchTimelineGeneratePanel';

interface SidebarProps {
  documents: Document[];
  folders: Folder[];
  activeDocumentId: string | null;
  selectedFolderId: string | null;
  onSelectFolder: (id: string | null) => void;
  onSelectDocument: (id: string) => void;
  onBatchUpload: () => void;
  onDeleteDocument: (id: string) => void;
  onFoldersChange: () => void;
  onDocumentsChange: () => void;
}

interface MoveMenuState {
  documentId: string | null;
  x: number;
  y: number;
  isMultiMove: boolean;
}

interface DocStreamState {
  docId: string;
  docTitle: string;
  streamingContent: string;
  streamStatus: 'idle' | 'streaming' | 'done' | 'archived' | 'error' | 'cancelled';
  errorMessage: string | null;
  progress: number;
}

interface BatchGenerateState {
  isOpen: boolean;
  documents: Document[];
  processingDocs: Set<string>;
  completedDocs: Set<string>;
  archivedDocs: Set<string>;
  failedDocs: Set<string>;
  errorDetails: Map<string, string>;
  currentBatch: number;
  totalBatches: number;
  isProcessing: boolean;
  isCancelled: boolean;
  docStreamStates: Map<string, DocStreamState>;
  batchSize: number;
}

const Sidebar: React.FC<SidebarProps> = ({
  documents,
  folders,
  activeDocumentId,
  selectedFolderId,
  onSelectFolder,
  onSelectDocument,
  onBatchUpload,
  onDeleteDocument,
  onFoldersChange,
  onDocumentsChange,
}) => {
  const [hoveredDoc, setHoveredDoc] = useState<string | null>(null);
  const [selectedDocs, setSelectedDocs] = useState<Set<string>>(new Set());
  const [lastSelectedIndex, setLastSelectedIndex] = useState<number>(-1);
  const [isDragging, setIsDragging] = useState(false);
  const [draggedDocs, setDraggedDocs] = useState<string[]>([]);
  const [contextMenu, setContextMenu] = useState<{ docId: string; x: number; y: number } | null>(null);
  const [moveMenu, setMoveMenu] = useState<MoveMenuState | null>(null);
  const [isMoving, setIsMoving] = useState(false);
  const [batchGenerate, setBatchGenerate] = useState<BatchGenerateState>({
    isOpen: false,
    documents: [],
    processingDocs: new Set(),
    completedDocs: new Set(),
    archivedDocs: new Set(),
    failedDocs: new Set(),
    errorDetails: new Map(),
    currentBatch: 0,
    totalBatches: 0,
    isProcessing: false,
    isCancelled: false,
    docStreamStates: new Map(),
    batchSize: 5
  });
  const [showBatchTimeline, setShowBatchTimeline] = useState(false);
  const documentListRef = useRef<HTMLDivElement>(null);
  const batchGenerateCancelRef = useRef<boolean>(false);

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    
    if (diffDays === 0) {
      return '今天 ' + date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
    } else if (diffDays === 1) {
      return '昨天';
    } else if (diffDays < 7) {
      return `${diffDays}天前`;
    } else {
      return date.toLocaleDateString('zh-CN', {
        month: 'short',
        day: 'numeric',
      });
    }
  };

  const handleDocumentClick = useCallback((docId: string, index: number, event: React.MouseEvent) => {
    if (event.shiftKey && lastSelectedIndex !== -1 && lastSelectedIndex !== index) {
      const start = Math.min(lastSelectedIndex, index);
      const end = Math.max(lastSelectedIndex, index);
      const newSelected = new Set<string>();
      for (let i = start; i <= end; i++) {
        newSelected.add(documents[i].id);
      }
      setSelectedDocs(newSelected);
    } else if (event.ctrlKey || event.metaKey) {
      setSelectedDocs(prev => {
        const newSet = new Set(prev);
        if (newSet.has(docId)) {
          newSet.delete(docId);
        } else {
          newSet.add(docId);
        }
        return newSet;
      });
      setLastSelectedIndex(index);
    } else {
      setSelectedDocs(new Set([docId]));
      setLastSelectedIndex(index);
      onSelectDocument(docId);
    }
  }, [documents, lastSelectedIndex, onSelectDocument]);

  const clearSelection = useCallback(() => {
    setSelectedDocs(new Set());
    setLastSelectedIndex(-1);
  }, []);

  const handleContextMenu = (e: React.MouseEvent, docId: string) => {
    e.preventDefault();
    e.stopPropagation();
    
    if (!selectedDocs.has(docId)) {
      setSelectedDocs(new Set([docId]));
      setLastSelectedIndex(documents.findIndex(d => d.id === docId));
    }
    
    setContextMenu({ docId, x: e.clientX, y: e.clientY });
  };

  const handleDragStart = (e: React.DragEvent, docId: string) => {
    const docsToDrag = selectedDocs.has(docId) ? Array.from(selectedDocs) : [docId];
    
    if (!selectedDocs.has(docId)) {
      setSelectedDocs(new Set([docId]));
      setLastSelectedIndex(documents.findIndex(d => d.id === docId));
    }
    
    setDraggedDocs(docsToDrag);
    setIsDragging(true);
    
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', JSON.stringify(docsToDrag));
    
    const dragImage = document.createElement('div');
    dragImage.className = 'drag-preview';
    dragImage.textContent = docsToDrag.length > 1 ? `${docsToDrag.length} 个文档` : '1 个文档';
    document.body.appendChild(dragImage);
    e.dataTransfer.setDragImage(dragImage, 0, 0);
    setTimeout(() => document.body.removeChild(dragImage), 0);
  };

  const handleDragEnd = () => {
    setIsDragging(false);
    setDraggedDocs([]);
  };

  const handleMoveToFolder = async (targetFolderId: string | null) => {
    const docsToMove = moveMenu?.isMultiMove 
      ? Array.from(selectedDocs) 
      : (moveMenu?.documentId ? [moveMenu.documentId] : []);
    
    if (docsToMove.length === 0) return;
    
    setIsMoving(true);
    try {
      const { documentApi } = await import('../api');
      await documentApi.moveBatch(docsToMove, targetFolderId);
      onDocumentsChange();
      clearSelection();
      setMoveMenu(null);
      setContextMenu(null);
    } catch (error) {
      console.error('Failed to move documents:', error);
      alert('移动文档失败');
    } finally {
      setIsMoving(false);
    }
  };

  const handleDeleteSelected = async () => {
    const docsToDelete = contextMenu?.docId 
      ? (selectedDocs.has(contextMenu.docId) ? Array.from(selectedDocs) : [contextMenu.docId])
      : Array.from(selectedDocs);
    
    if (docsToDelete.length === 0) return;
    
    const message = docsToDelete.length === 1 
      ? '确定要删除这个文档吗？' 
      : `确定要删除 ${docsToDelete.length} 个文档吗？`;
    
    if (!window.confirm(message)) return;
    
    try {
      const { documentApi } = await import('../api');
      await Promise.all(docsToDelete.map(id => documentApi.delete(id)));
      onDocumentsChange();
      clearSelection();
      setContextMenu(null);
    } catch (error) {
      console.error('Failed to delete documents:', error);
      alert('删除失败');
    }
  };

  // 批量生成正文相关函数
  const openBatchGenerate = async () => {
    const docsToProcess = selectedDocs.size > 0 
      ? documents.filter(d => selectedDocs.has(d.id) && !d.framework_content)
      : documents.filter(d => !d.framework_content);
    
    if (docsToProcess.length === 0) {
      alert('没有待处理的文档（所有选中的文档都已生成正文）');
      return;
    }
    
    let batchSize = 5;
    try {
      const response = await fetch('/api/settings');
      if (response.ok) {
        const settings = await response.json();
        batchSize = settings.batch_upload_size || 5;
      }
    } catch (error) {
      console.error('Failed to get batch size from settings:', error);
    }
    
    const docStreamStates = new Map<string, DocStreamState>();
    docsToProcess.forEach(doc => {
      docStreamStates.set(doc.id, {
        docId: doc.id,
        docTitle: doc.title,
        streamingContent: '',
        streamStatus: 'idle',
        errorMessage: null,
        progress: 0
      });
    });
    
    setBatchGenerate({
      isOpen: true,
      documents: docsToProcess,
      processingDocs: new Set(),
      completedDocs: new Set(),
      archivedDocs: new Set(),
      failedDocs: new Set(),
      errorDetails: new Map(),
      currentBatch: 0,
      totalBatches: Math.ceil(docsToProcess.length / batchSize),
      isProcessing: false,
      isCancelled: false,
      docStreamStates,
      batchSize
    });
  };

  const closeBatchGenerate = () => {
    if (!batchGenerate.isProcessing) {
      setBatchGenerate(prev => ({ ...prev, isOpen: false }));
    }
  };

  const processBatchGenerate = async () => {
    const { documents: docsToProcess, batchSize } = batchGenerate;
    
    batchGenerateCancelRef.current = false;
    
    setBatchGenerate(prev => ({ 
      ...prev, 
      isProcessing: true,
      isCancelled: false
    }));
    
    const processDocument = async (doc: Document): Promise<{ docId: string; success: boolean; content?: string; error?: string }> => {
      let fullContent = '';
      const controller = new AbortController();
      const timeoutId = setTimeout(() => {
        console.log(`Request timeout for ${doc.title}, aborting...`);
        controller.abort();
      }, 300000);
      
      const saveContent = async (content: string, docId: string): Promise<boolean> => {
        if (!content) return false;
        try {
          const response = await fetch(`/api/documents/${docId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ framework_content: content })
          });
          if (response.ok) {
            console.log(`[saveContent] Successfully saved ${content.length} chars for ${docId}`);
            return true;
          } else {
            console.error(`[saveContent] Save failed with status: ${response.status}`);
            return false;
          }
        } catch (e) {
          console.error(`[saveContent] Failed to save content:`, e);
          return false;
        }
      };
      
      try {
        const response = await fetch(`/api/documents/${doc.id}/generate-framework-stream`, {
          method: 'POST',
          headers: {
            'Accept': 'text/event-stream',
          },
          signal: controller.signal,
        });
        
        if (!response.ok) {
          clearTimeout(timeoutId);
          const errorData = await response.json().catch(() => ({}));
          throw new Error(errorData.detail || `HTTP ${response.status}: ${response.statusText}`);
        }
        
        const reader = response.body?.getReader();
        if (!reader) {
          clearTimeout(timeoutId);
          throw new Error('无法读取响应流');
        }
        
        const decoder = new TextDecoder();
        let buffer = '';
        
        setBatchGenerate(prev => {
          const newDocStreamStates = new Map(prev.docStreamStates);
          const existing = newDocStreamStates.get(doc.id);
          if (existing) {
            newDocStreamStates.set(doc.id, { ...existing, streamStatus: 'streaming' });
          }
          return { ...prev, docStreamStates: newDocStreamStates };
        });
        
        while (true) {
          if (batchGenerateCancelRef.current) {
            clearTimeout(timeoutId);
            reader.cancel();
            if (fullContent) {
              await saveContent(fullContent, doc.id);
            }
            return { docId: doc.id, success: false, error: '已取消' };
          }
          
          const { done, value } = await reader.read();
          if (done) {
            clearTimeout(timeoutId);
            break;
          }
          
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';
          
          for (const line of lines) {
            if (line.startsWith('data: ')) {
              try {
                const data = JSON.parse(line.slice(6));
                if (data.error) {
                  throw new Error(data.error);
                }
                if (data.done) {
                  if (data.full_content) {
                    fullContent = data.full_content;
                  }
                  break;
                }
                if (data.content) {
                  fullContent += data.content;
                  setBatchGenerate(prev => {
                    const newDocStreamStates = new Map(prev.docStreamStates);
                    const existing = newDocStreamStates.get(doc.id);
                    if (existing) {
                      newDocStreamStates.set(doc.id, { 
                        ...existing, 
                        streamingContent: fullContent,
                        progress: Math.min(100, fullContent.length / 10)
                      });
                    }
                    return { ...prev, docStreamStates: newDocStreamStates };
                  });
                }
              } catch (e) {
                if (e instanceof SyntaxError) {
                  console.error('Failed to parse SSE data:', line, e);
                } else {
                  throw e;
                }
              }
            }
          }
        }
        
        return { docId: doc.id, success: true, content: fullContent };
        
      } catch (error: any) {
        clearTimeout(timeoutId);
        console.error(`Failed to process ${doc.title}:`, error);
        
        if (error.name === 'AbortError') {
          console.log(`Request aborted for ${doc.title}, content length: ${fullContent.length}`);
        }
        
        if (fullContent) {
          console.log(`[processDocument] Attempting to save partial content for ${doc.title}: ${fullContent.length} chars`);
          await saveContent(fullContent, doc.id);
        }
        
        return { docId: doc.id, success: false, error: error.message || '未知错误' };
      }
    };
    
    const verifyAndArchive = async (docId: string): Promise<{ archived: boolean; content?: string }> => {
      try {
        const response = await fetch(`/api/documents/${docId}`);
        if (response.ok) {
          const doc = await response.json();
          if (doc.framework_content && doc.framework_content.length > 0) {
            setBatchGenerate(prev => {
              const newArchivedDocs = new Set(prev.archivedDocs);
              newArchivedDocs.add(docId);
              const newDocStreamStates = new Map(prev.docStreamStates);
              const existing = newDocStreamStates.get(docId);
              if (existing) {
                newDocStreamStates.set(docId, { 
                  ...existing, 
                  streamStatus: 'archived',
                  streamingContent: doc.framework_content,
                  progress: 100
                });
              }
              return { 
                ...prev, 
                archivedDocs: newArchivedDocs,
                docStreamStates: newDocStreamStates
              };
            });
            return { archived: true, content: doc.framework_content };
          }
        }
      } catch (error) {
        console.error(`Failed to verify archive for ${docId}:`, error);
      }
      return { archived: false };
    };
    
    for (let batchIndex = 0; batchIndex < docsToProcess.length; batchIndex += batchSize) {
      if (batchGenerateCancelRef.current) {
        break;
      }
      
      const currentBatchNum = Math.floor(batchIndex / batchSize) + 1;
      const batch = docsToProcess.slice(batchIndex, batchIndex + batchSize);
      
      setBatchGenerate(prev => ({
        ...prev,
        currentBatch: currentBatchNum,
        processingDocs: new Set(batch.map(d => d.id))
      }));
      
      const results = await Promise.all(
        batch.map(doc => processDocument(doc))
      );
      
      for (const result of results) {
        if (result.success) {
          const verifyResult = await verifyAndArchive(result.docId);
          if (verifyResult.archived) {
            setBatchGenerate(prev => {
              const newCompletedDocs = new Set(prev.completedDocs);
              newCompletedDocs.add(result.docId);
              const newArchivedDocs = new Set(prev.archivedDocs);
              newArchivedDocs.add(result.docId);
              const newDocStreamStates = new Map(prev.docStreamStates);
              const existing = newDocStreamStates.get(result.docId);
              if (existing) {
                newDocStreamStates.set(result.docId, { 
                  ...existing, 
                  streamStatus: 'archived',
                  streamingContent: verifyResult.content || result.content || '',
                  progress: 100
                });
              }
              return { 
                ...prev, 
                completedDocs: newCompletedDocs,
                archivedDocs: newArchivedDocs,
                docStreamStates: newDocStreamStates
              };
            });
          } else {
            setBatchGenerate(prev => {
              const newCompletedDocs = new Set(prev.completedDocs);
              newCompletedDocs.add(result.docId);
              const newDocStreamStates = new Map(prev.docStreamStates);
              const existing = newDocStreamStates.get(result.docId);
              if (existing) {
                newDocStreamStates.set(result.docId, { 
                  ...existing, 
                  streamStatus: 'done',
                  streamingContent: result.content || '',
                  progress: 100
                });
              }
              return { 
                ...prev, 
                completedDocs: newCompletedDocs,
                docStreamStates: newDocStreamStates
              };
            });
          }
        } else {
          const verifyResult = await verifyAndArchive(result.docId);
          if (verifyResult.archived) {
            console.log(`[processBatchGenerate] Document ${result.docId} was archived despite error: ${result.error}`);
            setBatchGenerate(prev => {
              const newCompletedDocs = new Set(prev.completedDocs);
              newCompletedDocs.add(result.docId);
              const newArchivedDocs = new Set(prev.archivedDocs);
              newArchivedDocs.add(result.docId);
              const newDocStreamStates = new Map(prev.docStreamStates);
              const existing = newDocStreamStates.get(result.docId);
              if (existing) {
                newDocStreamStates.set(result.docId, { 
                  ...existing, 
                  streamStatus: 'archived',
                  streamingContent: verifyResult.content || '',
                  progress: 100
                });
              }
              return { 
                ...prev, 
                completedDocs: newCompletedDocs,
                archivedDocs: newArchivedDocs,
                docStreamStates: newDocStreamStates
              };
            });
          } else {
            setBatchGenerate(prev => {
              const newFailedDocs = new Set(prev.failedDocs);
              newFailedDocs.add(result.docId);
              const newErrors = new Map(prev.errorDetails);
              newErrors.set(result.docId, result.error || '未知错误');
              const newDocStreamStates = new Map(prev.docStreamStates);
              const existing = newDocStreamStates.get(result.docId);
              if (existing) {
                newDocStreamStates.set(result.docId, { 
                  ...existing, 
                  streamStatus: 'error',
                  errorMessage: result.error || '未知错误'
                });
              }
              return { 
                ...prev, 
                failedDocs: newFailedDocs,
                errorDetails: newErrors,
                docStreamStates: newDocStreamStates
              };
            });
          }
        }
      }
      
      setBatchGenerate(prev => ({
        ...prev,
        processingDocs: new Set()
      }));
      
      if (batchIndex + batchSize < docsToProcess.length) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }
    
    setBatchGenerate(prev => ({ 
      ...prev, 
      isProcessing: false
    }));
    onDocumentsChange();
  };

  const cancelBatchGenerate = () => {
    batchGenerateCancelRef.current = true;
    setBatchGenerate(prev => ({ ...prev, isCancelled: true, isProcessing: false }));
  };

  const retryFailed = async () => {
    const failedDocIds = Array.from(batchGenerate.failedDocs);
    if (failedDocIds.length === 0) return;
    
    const failedDocs = batchGenerate.documents.filter(d => failedDocIds.includes(d.id));
    
    setBatchGenerate(prev => ({
      ...prev,
      failedDocs: new Set(),
      errorDetails: new Map(),
      documents: failedDocs
    }));
    
    await processBatchGenerate();
  };

  useEffect(() => {
    const handleClickOutside = () => {
      setContextMenu(null);
      setMoveMenu(null);
    };
    
    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        clearSelection();
        setContextMenu(null);
        setMoveMenu(null);
      }
    };
    
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [clearSelection]);

  const handleFolderDrop = async (targetFolderId: string | null, e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    
    try {
      const data = e.dataTransfer.getData('text/plain');
      const docIds: string[] = JSON.parse(data);
      
      if (docIds.length > 0) {
        setIsMoving(true);
        const { documentApi } = await import('../api');
        await documentApi.moveBatch(docIds, targetFolderId);
        onDocumentsChange();
        clearSelection();
      }
    } catch (error) {
      console.error('Failed to move documents:', error);
      alert('移动文档失败');
    } finally {
      setIsMoving(false);
      setIsDragging(false);
      setDraggedDocs([]);
    }
  };

  return (
    <div className="sidebar">
      <FolderManager
        folders={folders}
        selectedFolderId={selectedFolderId}
        onSelectFolder={onSelectFolder}
        onFoldersChange={onFoldersChange}
        onDrop={handleFolderDrop}
        isDragging={isDragging}
      />

      <div className="document-section">
        <div className="document-header">
          <span className="document-title">
            <FileText size={14} style={{ marginRight: 6, opacity: 0.7 }} />
            文档列表
            <span className="document-count">{documents.length}</span>
          </span>
          <div className="document-actions">
            <button
              className="doc-action-btn timeline"
              onClick={() => setShowBatchTimeline(true)}
              title="批量生成年表"
            >
              <Sparkles size={14} />
            </button>
            <button
              className="doc-action-btn primary"
              onClick={openBatchGenerate}
              title="批量生成正文"
            >
              <FileTextIcon size={14} />
            </button>
            {selectedDocs.size > 0 && (
              <button
                className="doc-action-btn danger"
                onClick={handleDeleteSelected}
                title="删除选中项"
              >
                <Trash2 size={14} />
              </button>
            )}
            <button
              className="doc-action-btn"
              onClick={onBatchUpload}
              title="批量上传"
            >
              <Upload size={14} />
            </button>
          </div>
        </div>

        {/* 全选控制栏 */}
        {documents.length > 0 && (
          <div className="select-all-bar">
            <button
              className={`select-all-btn ${selectedDocs.size === documents.filter(d => !d.framework_content).length && documents.filter(d => !d.framework_content).length > 0 ? 'active' : ''}`}
              onClick={() => {
                const docsToSelect = documents.filter(d => !d.framework_content);
                if (selectedDocs.size === docsToSelect.length && docsToSelect.length > 0) {
                  clearSelection();
                } else {
                  setSelectedDocs(new Set(docsToSelect.map(d => d.id)));
                }
              }}
            >
              {selectedDocs.size === documents.filter(d => !d.framework_content).length && documents.filter(d => !d.framework_content).length > 0 ? (
                <CheckSquare size={14} />
              ) : (
                <Square size={14} />
              )}
              待处理
            </button>
            <div className="divider-vertical" />
            <button
              className={`select-all-btn ${selectedDocs.size === documents.filter(d => d.framework_content).length && documents.filter(d => d.framework_content).length > 0 ? 'active' : ''}`}
              onClick={() => {
                const docsToSelect = documents.filter(d => d.framework_content);
                if (selectedDocs.size === docsToSelect.length && docsToSelect.length > 0) {
                  clearSelection();
                } else {
                  setSelectedDocs(new Set(docsToSelect.map(d => d.id)));
                }
              }}
            >
              {selectedDocs.size === documents.filter(d => d.framework_content).length && documents.filter(d => d.framework_content).length > 0 ? (
                <CheckSquare size={14} />
              ) : (
                <Square size={14} />
              )}
              已生成
            </button>
            <span className="selection-info">
              {selectedDocs.size}
            </span>
          </div>
        )}

        <div className="document-list" ref={documentListRef}>
          {documents.length === 0 ? (
            <div className="empty-state">
              <FileText size={32} strokeWidth={1} />
              <p>暂无文档</p>
              <span>点击上方上传按钮添加文档</span>
            </div>
          ) : (
            documents.map((doc, index) => {
              const hasFrameworkContent = !!doc.framework_content;
              const hasTimelineNotes = (doc.timeline_events_count || 0) > 0;
              const isSelected = selectedDocs.has(doc.id);
              
              return (
                <div
                  key={doc.id}
                  className={`document-item ${activeDocumentId === doc.id ? 'active' : ''} ${hoveredDoc === doc.id && activeDocumentId !== doc.id ? 'hovered' : ''} ${isSelected ? 'selected' : ''} ${isDragging && draggedDocs.includes(doc.id) ? 'dragging' : ''} ${hasFrameworkContent ? 'has-content' : ''}`}
                  onClick={(e) => {
                    handleDocumentClick(doc.id, index, e);
                  }}
                  onMouseEnter={() => setHoveredDoc(doc.id)}
                  onMouseLeave={() => setHoveredDoc(null)}
                  onContextMenu={(e) => handleContextMenu(e, doc.id)}
                  draggable
                  onDragStart={(e) => handleDragStart(e, doc.id)}
                  onDragEnd={handleDragEnd}
                >
                  <div className="document-item-content">
                    <div 
                      className={`document-checkbox ${isSelected ? 'checked' : ''}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDocumentClick(doc.id, index, { ...e, ctrlKey: true });
                      }}
                    >
                      {isSelected && <Check size={10} />}
                      {hasFrameworkContent && !isSelected && (
                        <Check 
                          size={10} 
                          style={{ 
                            color: hasTimelineNotes ? '#8b5cf6' : '#10b981' 
                          }} 
                        />
                      )}
                    </div>
                    <div className="document-icon-wrapper">
                      <FileText size={16} />
                    </div>
                    <div className="document-info">
                      <div className="document-name">
                        {doc.title}
                      </div>
                      <div className="document-meta">
                        <span className="meta-item">
                          <Clock size={10} />
                          {formatDate(doc.created_at)}
                        </span>
                        {doc.highlights && doc.highlights.length > 0 && (
                          <span className="meta-item highlights">
                            <Highlighter size={10} />
                            {doc.highlights.length}
                          </span>
                        )}
                        {hasTimelineNotes && (
                          <span className="meta-item timeline-count" style={{ color: '#8b5cf6' }}>
                            <Calendar size={10} />
                            {doc.timeline_events_count}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  {(activeDocumentId === doc.id || hoveredDoc === doc.id) && selectedDocs.size <= 1 && (
                    <button
                      className="delete-btn"
                      onClick={(e) => {
                        e.stopPropagation();
                        onDeleteDocument(doc.id);
                      }}
                      title="删除文档"
                    >
                      <Trash2 size={12} />
                    </button>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>

      {contextMenu && (
        <div 
          className="context-menu show"
          style={{ left: contextMenu.x, top: contextMenu.y }}
          onClick={(e) => e.stopPropagation()}
        >
          <button onClick={() => {
            setMoveMenu({
              documentId: contextMenu.docId,
              x: contextMenu.x + 150,
              y: contextMenu.y,
              isMultiMove: selectedDocs.size > 1 && selectedDocs.has(contextMenu.docId)
            });
            setContextMenu(null);
          }}>
            <Move size={14} /> 移动到...
          </button>
          <button onClick={handleDeleteSelected} className="danger">
            <Trash2 size={14} /> 删除
          </button>
        </div>
      )}

      {moveMenu && (
        <>
          <div className="move-menu-overlay" onClick={() => setMoveMenu(null)} />
          <div 
            className="move-menu"
            style={{ left: moveMenu.x, top: moveMenu.y }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="move-menu-header">
              <Move size={14} />
              <span>移动到文件夹</span>
              <button className="close-btn" onClick={() => setMoveMenu(null)}>
                <X size={14} />
              </button>
            </div>
            <div className="move-menu-list">
              <button
                className="move-menu-item"
                onClick={() => handleMoveToFolder(null)}
                disabled={isMoving}
              >
                <Home size={14} />
                <span>根目录</span>
              </button>
              {folders.map(folder => (
                <button
                  key={folder.id}
                  className="move-menu-item"
                  onClick={() => handleMoveToFolder(folder.id)}
                  disabled={isMoving}
                >
                  <FolderOpen size={14} />
                  <span>{folder.name}</span>
                </button>
              ))}
            </div>
            {isMoving && (
              <div className="move-menu-loading">
                <div className="loading-spinner" />
                <span>移动中...</span>
              </div>
            )}
          </div>
        </>
      )}

      {/* 批量生成正文弹窗 */}
      {batchGenerate.isOpen && (
        <div className="modal-overlay" onClick={closeBatchGenerate}>
          <div className="modal batch-generate-modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 900 }}>
            <div className="modal-header">
              <h3>批量生成正文</h3>
              <span style={{ fontSize: 12, color: '#6b7280', marginLeft: 8 }}>
                批次大小: {batchGenerate.batchSize} 个文档/批次
              </span>
              <button 
                className="close-btn" 
                onClick={closeBatchGenerate}
                disabled={batchGenerate.isProcessing}
              >
                <X size={18} />
              </button>
            </div>
            
            <div className="modal-body">
              {/* 进度信息 */}
              <div className="batch-progress-info">
                <div className="progress-stats">
                  <span className="stat completed" style={{ color: '#059669' }}>
                    <Check size={14} /> 已归档: {batchGenerate.archivedDocs.size}
                  </span>
                  <span className="stat completed" style={{ color: '#eab308' }}>
                    <Check size={14} /> 已完成: {batchGenerate.completedDocs.size - batchGenerate.archivedDocs.size}
                  </span>
                  <span className="stat processing">
                    <Loader size={14} className={batchGenerate.isProcessing ? 'spinning' : ''} /> 
                    处理中: {batchGenerate.processingDocs.size}
                  </span>
                  <span className="stat pending">
                    待处理: {batchGenerate.documents.length - batchGenerate.completedDocs.size - batchGenerate.processingDocs.size - batchGenerate.failedDocs.size}
                  </span>
                  {batchGenerate.failedDocs.size > 0 && (
                    <span className="stat failed">
                      <X size={14} /> 失败: {batchGenerate.failedDocs.size}
                    </span>
                  )}
                </div>
                
                {/* 进度条 */}
                <div className="progress-bar-container">
                  <div 
                    className="progress-bar"
                    style={{ 
                      width: `${((batchGenerate.archivedDocs.size + batchGenerate.failedDocs.size) / batchGenerate.documents.length) * 100}%` 
                    }}
                  />
                </div>
                <div className="progress-text">
                  {batchGenerate.archivedDocs.size + batchGenerate.failedDocs.size} / {batchGenerate.documents.length} 个文档
                  {batchGenerate.totalBatches > 0 && ` (批次 ${batchGenerate.currentBatch}/${batchGenerate.totalBatches})`}
                  {batchGenerate.isCancelled && <span style={{ color: '#ef4444', marginLeft: 8 }}>已取消</span>}
                </div>
              </div>
              
              {/* 文档列表 - 显示每个文档的处理状态 */}
              <div className="batch-documents-list" style={{ maxHeight: 400, overflow: 'auto' }}>
                {batchGenerate.documents.map(doc => {
                  const isCompleted = batchGenerate.completedDocs.has(doc.id);
                  const isArchived = batchGenerate.archivedDocs.has(doc.id);
                  const isProcessing = batchGenerate.processingDocs.has(doc.id);
                  const isFailed = batchGenerate.failedDocs.has(doc.id);
                  const errorMsg = batchGenerate.errorDetails.get(doc.id);
                  const streamState = batchGenerate.docStreamStates.get(doc.id);
                  
                  return (
                    <div 
                      key={doc.id} 
                      className={`batch-doc-item ${isArchived ? 'archived' : isCompleted ? 'completed' : ''} ${isProcessing ? 'processing' : ''} ${isFailed ? 'failed' : ''}`}
                      style={{ 
                        padding: 12,
                        marginBottom: 8,
                        background: isProcessing ? '#f0f9ff' : isArchived ? '#ecfdf5' : isCompleted ? '#fefce8' : isFailed ? '#fef2f2' : '#f8f9fa',
                        borderRadius: 6,
                        border: `1px solid ${isProcessing ? '#bae6fd' : isArchived ? '#a7f3d0' : isCompleted ? '#fef08a' : isFailed ? '#fecaca' : '#e9ecef'}`
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: isProcessing && streamState?.streamingContent ? 8 : 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <div className="doc-status-icon">
                            {isArchived && <Check size={14} style={{ color: '#059669' }} />}
                            {isCompleted && !isArchived && <Check size={14} style={{ color: '#eab308' }} />}
                            {isProcessing && <Loader size={14} className="spinning" style={{ color: '#3b82f6' }} />}
                            {isFailed && <X size={14} style={{ color: '#ef4444' }} />}
                            {!isCompleted && !isArchived && !isProcessing && !isFailed && <FileText size={14} />}
                          </div>
                          <span className="doc-title" style={{ fontWeight: 500 }}>{doc.title}</span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          {isProcessing && streamState?.streamStatus === 'streaming' && (
                            <span style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: 4,
                              fontSize: 11,
                              color: '#10b981'
                            }}>
                              <span style={{
                                width: 6,
                                height: 6,
                                borderRadius: '50%',
                                background: '#10b981',
                                animation: 'pulse 1s infinite'
                              }} />
                              流式生成中
                            </span>
                          )}
                          {isArchived && (
                            <span style={{ fontSize: 11, color: '#059669' }}>✓ 已归档</span>
                          )}
                          {isCompleted && !isArchived && (
                            <span style={{ fontSize: 11, color: '#eab308' }}>⏳ 验证中...</span>
                          )}
                          {isFailed && (
                            <span style={{ fontSize: 11, color: '#ef4444' }}>✗ 失败</span>
                          )}
                          {streamState?.streamingContent && (
                            <span style={{ fontSize: 10, color: '#6b7280' }}>
                              {streamState.streamingContent.length} 字符
                            </span>
                          )}
                        </div>
                      </div>
                      
                      {/* 流式内容预览 */}
                      {isProcessing && streamState?.streamingContent && (
                        <div style={{
                          background: '#fff',
                          borderRadius: 4,
                          padding: 8,
                          marginTop: 8,
                          maxHeight: 80,
                          overflow: 'auto',
                          fontSize: 11,
                          lineHeight: 1.5,
                          color: '#374151',
                          border: '1px solid #e5e7eb'
                        }}>
                          <pre style={{ margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                            {streamState.streamingContent.slice(-300)}
                            <span style={{ animation: 'blink 1s infinite' }}>▋</span>
                          </pre>
                        </div>
                      )}
                      
                      {/* 错误信息 */}
                      {isFailed && errorMsg && (
                        <div style={{ marginTop: 4, fontSize: 11, color: '#ef4444' }}>
                          {errorMsg}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
            
            <div className="modal-footer">
              <button 
                className="btn btn-secondary" 
                onClick={closeBatchGenerate}
                disabled={batchGenerate.isProcessing}
              >
                关闭
              </button>
              {batchGenerate.failedDocs.size > 0 && !batchGenerate.isProcessing && (
                <button 
                  className="btn btn-secondary" 
                  onClick={retryFailed}
                >
                  重试失败项 ({batchGenerate.failedDocs.size})
                </button>
              )}
              {batchGenerate.isProcessing ? (
                <button 
                  className="btn btn-danger" 
                  onClick={cancelBatchGenerate}
                >
                  取消生成
                </button>
              ) : (
                <button 
                  className="btn btn-primary" 
                  onClick={processBatchGenerate}
                  disabled={batchGenerate.completedDocs.size + batchGenerate.failedDocs.size === batchGenerate.documents.length}
                >
                  {batchGenerate.completedDocs.size + batchGenerate.failedDocs.size === batchGenerate.documents.length ? '已完成' : '开始生成'}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 批量生成年表弹窗 */}
      {showBatchTimeline && (
        <BatchTimelineGeneratePanel
          onClose={() => setShowBatchTimeline(false)}
          selectedDocs={documents.filter(d => selectedDocs.has(d.id))}
          onComplete={() => {
            onDocumentsChange();
          }}
        />
      )}
    </div>
  );
};

export default Sidebar;
