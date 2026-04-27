import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
  X, 
  Calendar, 
  Check, 
  Play, 
  CheckSquare, 
  Square,
  FileText,
  Tag,
  ChevronDown,
  ChevronUp,
  Search,
  Settings
} from 'lucide-react';
import { worldTimelineApi } from '../api';
import DraggableProgressWindow from './DraggableProgressWindow';

interface DocumentItem {
  id: string;
  title: string;
  author?: string | null;
  tags?: string[] | null;
}

interface ProgressItem {
  id: string;
  title: string;
  status: 'pending' | 'processing' | 'success' | 'error';
  eventCount?: number;
  error?: string;
}

interface GenerateResult {
  id: string;
  success: boolean;
  title?: string;
  eventCount?: number;
  error?: string;
}

interface BatchTimelineGeneratePanelProps {
  onClose: () => void;
  selectedDocs: DocumentItem[];
  onComplete?: () => void;
}

const BatchTimelineGeneratePanel: React.FC<BatchTimelineGeneratePanelProps> = ({
  onClose,
  selectedDocs,
  onComplete
}) => {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set(selectedDocs.map(d => d.id)));
  const [generating, setGenerating] = useState(false);
  const [results, setResults] = useState<GenerateResult[]>([]);
  const [currentProcessing, setCurrentProcessing] = useState<string | null>(null);
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  const [isPaused, setIsPaused] = useState(false);
  const [shouldStop, setShouldStop] = useState(false);
  const [customPrompt, setCustomPrompt] = useState('');
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState('');
  const [historyTags, setHistoryTags] = useState<string[]>([]);
  const [historyTagDropdownOpen, setHistoryTagDropdownOpen] = useState(false);
  const [historyTagSearchQuery, setHistoryTagSearchQuery] = useState('');
  const historyTagDropdownRef = useRef<HTMLDivElement>(null);
  const [concurrency, setConcurrency] = useState(3);
  const [showProgressWindow, setShowProgressWindow] = useState(false);
  const [progressItems, setProgressItems] = useState<ProgressItem[]>([]);
  const isPausedRef = useRef(false);
  const shouldStopRef = useRef(false);

  useEffect(() => {
    loadHistoryTags();
  }, []);

  useEffect(() => {
    isPausedRef.current = isPaused;
  }, [isPaused]);

  useEffect(() => {
    shouldStopRef.current = shouldStop;
  }, [shouldStop]);

  const loadHistoryTags = async () => {
    try {
      const response = await worldTimelineApi.getTimelineTagsHistory();
      setHistoryTags(response.data.tags || []);
    } catch (error) {
      console.error('Failed to load history tags:', error);
    }
  };

  const filteredHistoryTags = useMemo(() => {
    if (!historyTagSearchQuery.trim()) {
      return historyTags;
    }
    const query = historyTagSearchQuery.toLowerCase();
    return historyTags.filter(tag => tag.toLowerCase().includes(query));
  }, [historyTags, historyTagSearchQuery]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (historyTagDropdownRef.current && !historyTagDropdownRef.current.contains(event.target as Node)) {
        setHistoryTagDropdownOpen(false);
      }
    };

    if (historyTagDropdownOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [historyTagDropdownOpen]);

  const handleAddTag = () => {
    if (tagInput.trim() && !selectedTags.includes(tagInput.trim())) {
      setSelectedTags([...selectedTags, tagInput.trim()]);
      setTagInput('');
    }
  };

  const handleRemoveTag = (tag: string) => {
    setSelectedTags(selectedTags.filter(t => t !== tag));
  };

  const toggleSelection = (id: string) => {
    setSelectedIds(prev => {
      const newSet = new Set(prev);
      if (newSet.has(id)) {
        newSet.delete(id);
      } else {
        newSet.add(id);
      }
      return newSet;
    });
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === selectedDocs.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(selectedDocs.map(d => d.id)));
    }
  };

  const processDocument = async (docId: string, docTitle: string): Promise<GenerateResult> => {
    try {
      const response = await worldTimelineApi.aiGenerateTimelineNotes(docId, customPrompt);
      
      if (response.data.parsed_events && response.data.parsed_events.length > 0 && selectedTags.length > 0) {
        await worldTimelineApi.saveTimelineNotesBatch(docId, response.data.parsed_events, selectedTags);
      }
      
      return {
        id: docId,
        success: true,
        title: docTitle,
        eventCount: response.data.parsed_events?.length || 0
      };
    } catch (error) {
      return {
        id: docId,
        success: false,
        title: docTitle,
        error: error instanceof Error ? error.message : '生成失败'
      };
    }
  };

  const handleGenerate = async () => {
    if (selectedIds.size === 0) return;
    
    setGenerating(true);
    setResults([]);
    setIsPaused(false);
    setShouldStop(false);
    isPausedRef.current = false;
    shouldStopRef.current = false;
    
    const ids = Array.from(selectedIds);
    const total = ids.length;
    setProgress({ current: 0, total });
    
    const initialItems: ProgressItem[] = ids.map(id => {
      const doc = selectedDocs.find(d => d.id === id);
      return {
        id,
        title: doc?.title || id,
        status: 'pending' as const
      };
    });
    setProgressItems(initialItems);
    setShowProgressWindow(true);
    
    let completed = 0;
    const newResults: GenerateResult[] = [];
    
    const updateProgressItem = (id: string, updates: Partial<ProgressItem>) => {
      setProgressItems(prev => prev.map(item => 
        item.id === id ? { ...item, ...updates } : item
      ));
    };

    const processWithConcurrency = async () => {
      const executing: Promise<void>[] = [];
      
      for (const docId of ids) {
        if (shouldStopRef.current) break;
        
        while (isPausedRef.current) {
          await new Promise(resolve => setTimeout(resolve, 500));
          if (shouldStopRef.current) break;
        }
        if (shouldStopRef.current) break;

        const doc = selectedDocs.find(d => d.id === docId);
        updateProgressItem(docId, { status: 'processing' });
        
        const promise = processDocument(docId, doc?.title || docId).then(result => {
          newResults.push(result);
          setResults([...newResults]);
          completed++;
          setProgress({ current: completed, total });
          
          updateProgressItem(docId, {
            status: result.success ? 'success' : 'error',
            eventCount: result.eventCount,
            error: result.error
          });
        });
        
        executing.push(promise);
        
        if (executing.length >= concurrency) {
          await Promise.race(executing);
          executing.splice(executing.findIndex(p => p === promise), 1);
        }
      }
      
      await Promise.all(executing);
    };
    
    await processWithConcurrency();
    
    setGenerating(false);
    setCurrentProcessing(null);
    
    if (onComplete && !shouldStopRef.current) {
      onComplete();
    }
  };

  const handlePause = () => {
    setIsPaused(true);
  };

  const handleContinue = () => {
    setIsPaused(false);
  };

  const handleStop = () => {
    setShouldStop(true);
    isPausedRef.current = false;
    shouldStopRef.current = true;
    setIsPaused(false);
  };

  const handleCloseProgressWindow = () => {
    setShowProgressWindow(false);
  };

  const successCount = results.filter(r => r.success).length;
  const failedCount = results.filter(r => !r.success).length;

  return (
    <>
      {!generating && (
        <div className="modal-overlay">
          <div className="batch-regenerate-modal">
          <div className="modal-header">
            <h3>
              <Calendar size={20} />
              批量生成时间笔记
            </h3>
            <button className="close-btn" onClick={onClose}>
              <X size={20} />
            </button>
          </div>

          <div className="modal-body">
            {!generating && results.length === 0 && (
              <>
                <div className="form-section">
                  <div className="form-group">
                    <label>自定义提示词（可选）</label>
                    <textarea
                      value={customPrompt}
                      onChange={(e) => setCustomPrompt(e.target.value)}
                      placeholder="留空使用默认提示词"
                      rows={3}
                      style={{
                        width: '100%',
                        padding: '10px',
                        border: '1px solid #e5e7eb',
                        borderRadius: '6px',
                        fontSize: '14px',
                        resize: 'vertical',
                      }}
                    />
                  </div>
                  
                  <div className="form-group">
                    <label style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <Settings size={14} />
                      并发数量（同时处理的文档数：1-10）
                    </label>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                      <input
                        type="range"
                        min="1"
                        max="10"
                        value={concurrency}
                        onChange={(e) => setConcurrency(parseInt(e.target.value))}
                        style={{ flex: 1 }}
                      />
                      <span style={{ 
                        minWidth: '40px', 
                        textAlign: 'center',
                        fontWeight: 600,
                        fontSize: '16px',
                        color: 'var(--primary-500)'
                      }}>
                        {concurrency}
                      </span>
                    </div>
                    <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px' }}>
                       建议：并发数过高可能导致API限流，请根据实际情况调整
                     </div>
                  </div>
                  
                  <div className="form-group">
                    <label>默认标签（添加到所有生成的时间笔记）</label>
                    <div style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
                      <input
                        type="text"
                        value={tagInput}
                        onChange={(e) => setTagInput(e.target.value)}
                        onKeyPress={(e) => e.key === 'Enter' && handleAddTag()}
                        placeholder="输入标签后按回车添加"
                        style={{
                          flex: 1,
                          padding: '8px',
                          border: '1px solid #e5e7eb',
                          borderRadius: '4px',
                          fontSize: '14px',
                        }}
                      />
                      <button
                        onClick={handleAddTag}
                        style={{
                          padding: '8px 16px',
                          background: 'var(--primary-500)',
                          color: 'white',
                          border: 'none',
                          borderRadius: '4px',
                          cursor: 'pointer',
                          fontSize: '14px',
                        }}
                      >
                        添加
                      </button>
                    </div>
                    
                    {selectedTags.length > 0 && (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '12px' }}>
                        {selectedTags.map((tag, index) => (
                          <span key={index} style={{
                            background: 'var(--primary-light)',
                            padding: '4px 10px',
                            borderRadius: '12px',
                            fontSize: '13px',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '4px',
                          }}>
                            {tag}
                            <button
                              onClick={() => handleRemoveTag(tag)}
                              style={{
                                background: 'none',
                                border: 'none',
                                cursor: 'pointer',
                                fontSize: '14px',
                                lineHeight: '1',
                                padding: '0 2px',
                              }}
                            >
                              ×
                            </button>
                          </span>
                        ))}
                      </div>
                    )}
                    
                    {historyTags.length > 0 && (
                      <div ref={historyTagDropdownRef}>
                       <label style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '6px', display: 'block' }}>
                           历史标签（点击快速添加）
                         </label>
                        <div style={{ position: 'relative' }}>
                          <button
                            onClick={() => setHistoryTagDropdownOpen(!historyTagDropdownOpen)}
                            style={{
                              width: '100%',
                              padding: '10px 14px',
                              background: historyTagDropdownOpen ? 'var(--bg-muted)' : 'white',
                              border: '1px solid #e5e7eb',
                              borderRadius: '6px',
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'space-between',
                              fontSize: '13px',
                              color: 'var(--text-primary)',
                              transition: 'all 0.2s ease'
                            }}
                          >
                             <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                               <Tag size={14} style={{ color: 'var(--accent-500)' }} />
                               <span>全部历史标签 ({historyTags.length})</span>
                             </div>
                            {historyTagDropdownOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                          </button>

                          {historyTagDropdownOpen && (
                            <div style={{
                              position: 'absolute',
                              top: '100%',
                              left: 0,
                              right: 0,
                              marginTop: '4px',
                              background: 'white',
                              border: '1px solid #e5e7eb',
                              borderRadius: '8px',
                              boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
                              zIndex: 100,
                              maxHeight: '300px',
                              display: 'flex',
                              flexDirection: 'column'
                            }}>
                              <div style={{
                                padding: '10px 12px',
                                borderBottom: '1px solid #e5e7eb',
                                position: 'sticky',
                                top: 0,
                                background: 'white',
                                borderRadius: '8px 8px 0 0'
                              }}>
                                <div style={{
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: '8px',
                                  padding: '8px 12px',
                                  background: 'var(--bg-muted)',
                                  borderRadius: '6px'
                                }}>
                                   <Search size={14} style={{ color: 'var(--text-muted)' }} />
                                  <input
                                    type="text"
                                    placeholder="搜索历史标签..."
                                    value={historyTagSearchQuery}
                                    onChange={(e) => setHistoryTagSearchQuery(e.target.value)}
                                    style={{
                                      border: 'none',
                                      background: 'transparent',
                                      outline: 'none',
                                      flex: 1,
                                      fontSize: '13px',
                                      color: 'var(--text-primary)'
                                    }}
                                  />
                                  {historyTagSearchQuery && (
                                    <button
                                      onClick={() => setHistoryTagSearchQuery('')}
                                      style={{
                                        background: 'none',
                                        border: 'none',
                                        padding: 0,
                                        cursor: 'pointer',
                                        color: 'var(--text-muted)'
                                      }}
                                    >
                                      <X size={14} />
                                    </button>
                                  )}
                                </div>
                              </div>

                              <div style={{
                                flex: 1,
                                overflowY: 'auto',
                                padding: '8px'
                              }}>
                                {filteredHistoryTags.length === 0 ? (
                                  <div style={{
                                    textAlign: 'center',
                                    padding: '20px',
                                    color: 'var(--text-muted)',
                                    fontSize: '13px'
                                  }}>
                                    {historyTagSearchQuery ? '没有找到匹配的标签' : '暂无历史标签'}
                                  </div>
                                ) : (
                                  <div style={{
                                    display: 'grid',
                                    gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))',
                                    gap: '6px'
                                  }}>
                                    {filteredHistoryTags.map(tag => {
                                      const isSelected = selectedTags.includes(tag);
                                      return (
                                        <button
                                          key={tag}
                                          onClick={() => {
                                            if (!isSelected) {
                                              setSelectedTags([...selectedTags, tag]);
                                            }
                                          }}
                                          style={{
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '6px',
                                            padding: '8px 10px',
                                            background: isSelected ? 'var(--accent-500)' : 'white',
                                            border: '1px solid ' + (isSelected ? 'var(--accent-600)' : 'var(--border-default)'),
                                            borderRadius: '6px',
                                            cursor: isSelected ? 'default' : 'pointer',
                                            fontSize: '12px',
                                            color: isSelected ? 'white' : 'var(--text-primary)',
                                            transition: 'all 0.15s ease',
                                            whiteSpace: 'nowrap',
                                            overflow: 'hidden',
                                            textOverflow: 'ellipsis'
                                          }}
                                        >
                                          <Tag size={12} />
                                          <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis' }}>{tag}</span>
                                          {isSelected && (
                                            <span style={{ fontSize: '10px' }}>✓</span>
                                          )}
                                        </button>
                                      );
                                    })}
                                  </div>
                                )}
                              </div>

                              {selectedTags.length > 0 && (
                                <div style={{
                                  padding: '10px 12px',
                                  borderTop: '1px solid #e5e7eb',
                                  background: 'var(--bg-muted)',
                                  borderRadius: '0 0 8px 8px'
                                }}>
                                  <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '6px' }}>
                                     已选择的标签:
                                   </div>
                                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                                    {selectedTags.map(tag => (
                                      <span
                                        key={tag}
                                        style={{
                                           display: 'inline-flex',
                                           alignItems: 'center',
                                           gap: '4px',
                                           padding: '3px 8px',
                                           background: 'var(--accent-500)',
                                           color: 'white',
                                           borderRadius: '12px',
                                           fontSize: '11px'
                                         }}
                                      >
                                        {tag}
                                        <button
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            handleRemoveTag(tag);
                                          }}
                                          style={{
                                            background: 'none',
                                            border: 'none',
                                            padding: 0,
                                            cursor: 'pointer',
                                            color: 'white',
                                            display: 'flex',
                                            alignItems: 'center'
                                          }}
                                        >
                                          <X size={10} />
                                        </button>
                                      </span>
                                    ))}
                                  </div>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                <div className="selection-bar">
                  <button className="select-all-btn" onClick={toggleSelectAll}>
                    {selectedIds.size === selectedDocs.length && selectedDocs.length > 0 ? (
                      <CheckSquare size={18} />
                    ) : (
                      <Square size={18} />
                    )}
                    全选
                  </button>
                  <span className="selection-count">
                    已选择 {selectedIds.size} / {selectedDocs.length} 个文档
                  </span>
                </div>

                <div className="incomplete-docs-list">
                  {selectedDocs.map(doc => (
                    <div 
                      key={doc.id} 
                      className={`incomplete-doc-item ${selectedIds.has(doc.id) ? 'selected' : ''}`}
                    >
                      <div className="doc-checkbox">
                        <button onClick={() => toggleSelection(doc.id)}>
                          {selectedIds.has(doc.id) ? (
                            <CheckSquare size={20} className="checked" />
                          ) : (
                            <Square size={20} />
                          )}
                        </button>
                      </div>
                      
                      <div className="doc-info">
                        <div className="doc-title">
                          <FileText size={16} />
                          {doc.title}
                        </div>
                        {doc.author && (
                          <div className="doc-meta">
                            <span>作者: {doc.author}</span>
                          </div>
                        )}
                        {doc.tags && doc.tags.length > 0 && (
                          <div className="doc-tags">
                            {doc.tags.map((tag, i) => (
                              <span key={i} className="tag-item">
                                {tag}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>

                <div style={{ 
                  background: 'var(--warning-light)', 
                  border: '1px solid #fbbf24', 
                  borderRadius: '6px', 
                  padding: '12px', 
                  marginTop: '16px'
                }}>
                  <h4 style={{ margin: '0 0 8px 0', fontSize: '14px', fontWeight: 500 }}>注意事项：</h4>
                  <ul style={{ margin: 0, paddingLeft: '20px', fontSize: '13px' }}>
                    <li>生成过程在后台运行，您可以继续操作其他功能</li>
                    <li>进度窗口可以拖动到任意位置，也可以最小化</li>
                    <li>并发数越高处理越快，但可能触发API限流</li>
                    <li>生成的时间笔记会自动保存，默认标签会添加到所有事件</li>
                  </ul>
                </div>
              </>
            )}

            {!generating && results.length > 0 && (
              <div className="results-section">
                <div style={{ 
                  display: 'flex', 
                  alignItems: 'center', 
                  gap: '12px',
                  marginBottom: '16px'
                }}>
                  <Check size={20} style={{ color: 'var(--success-500)' }} />
                  <span style={{ fontWeight: 500 }}>处理完成</span>
                  <span style={{ color: 'var(--success-500)', fontSize: '13px' }}>成功: {successCount}</span>
                  {failedCount > 0 && (
                    <span style={{ color: 'var(--danger-500)', fontSize: '13px' }}>失败: {failedCount}</span>
                  )}
                </div>
                
                <div className="results-list" style={{ maxHeight: '300px', overflowY: 'auto' }}>
                  {results.map((result) => (
                    <div 
                      key={result.id} 
                      className={`result-item ${result.success ? 'success' : 'failed'}`}
                    >
                      <div className="result-icon">
                        {result.success ? (
                          <Check size={16} />
                        ) : (
                          <X size={16} />
                        )}
                      </div>
                      <div className="result-info">
                        <span className="result-title">{result.title || result.id}</span>
                        {result.success ? (
                          <span className="result-detail">
                            识别到 {result.eventCount} 个时间事件
                          </span>
                        ) : (
                          <span className="result-error">{result.error}</span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="modal-footer">
            {results.length === 0 && !generating && (
              <>
                <button className="btn btn-secondary" onClick={onClose}>
                  取消
                </button>
                <button 
                  className="btn btn-primary" 
                  onClick={handleGenerate}
                  disabled={selectedIds.size === 0}
                >
                  <Play size={16} />
                  开始生成 ({selectedIds.size})
                </button>
              </>
            )}

            {!generating && results.length > 0 && (
              <>
                <button className="btn btn-secondary" onClick={onClose}>
                  关闭
                </button>
                <button className="btn btn-primary" onClick={() => {
                  setResults([]);
                  setSelectedIds(new Set(selectedDocs.map(d => d.id)));
                }}>
                  继续生成
                </button>
              </>
            )}
          </div>
        </div>
      </div>
      )}

      <DraggableProgressWindow
        isOpen={showProgressWindow}
        onClose={handleCloseProgressWindow}
        title="批量生成时间笔记"
        items={progressItems}
        currentProcessing={currentProcessing}
        progress={progress}
        isProcessing={generating}
        isPaused={isPaused}
        onPause={handlePause}
        onContinue={handleContinue}
        onStop={handleStop}
      />

      <style>{`
        .spinning {
          animation: spin 1s linear infinite;
        }
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </>
  );
};

export default BatchTimelineGeneratePanel;
