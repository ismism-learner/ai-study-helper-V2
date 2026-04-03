import React, { useState, useEffect, useCallback } from 'react';
import { 
  X, 
  RefreshCw, 
  Check, 
  AlertTriangle, 
  Play, 
  Pause, 
  CheckSquare, 
  Square,
  FileText,
  Loader
} from 'lucide-react';
import { documentApi } from '../api';

interface IncompleteDocument {
  id: string;
  title: string;
  original_content_length: number;
  framework_content_length: number;
  issues: string[];
  created_at: string | null;
  updated_at: string | null;
}

interface RegenerateResult {
  id: string;
  success: boolean;
  title?: string;
  old_length?: number;
  new_length?: number;
  error?: string;
  error_type?: string;
  skipped?: boolean;
  message?: string;
}

interface BatchRegeneratePanelProps {
  onClose: () => void;
  onComplete?: () => void;
}

const BatchRegeneratePanel: React.FC<BatchRegeneratePanelProps> = ({
  onClose,
  onComplete
}) => {
  const [incompleteDocs, setIncompleteDocs] = useState<IncompleteDocument[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [regenerating, setRegenerating] = useState(false);
  const [results, setResults] = useState<RegenerateResult[]>([]);
  const [currentProcessing, setCurrentProcessing] = useState<string | null>(null);
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  const [isPaused, setIsPaused] = useState(false);
  const [shouldStop, setShouldStop] = useState(false);
  const [minLength, setMinLength] = useState(100);

  const fetchIncompleteDocs = useCallback(async () => {
    setLoading(true);
    try {
      const response = await documentApi.getIncompleteGenerations(minLength);
      setIncompleteDocs(response.data.documents);
      setSelectedIds(new Set(response.data.documents.map(d => d.id)));
    } catch (error) {
      console.error('Failed to fetch incomplete documents:', error);
    } finally {
      setLoading(false);
    }
  }, [minLength]);

  useEffect(() => {
    fetchIncompleteDocs();
  }, [fetchIncompleteDocs]);

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
    if (selectedIds.size === incompleteDocs.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(incompleteDocs.map(d => d.id)));
    }
  };

  const handleRegenerate = async () => {
    if (selectedIds.size === 0) return;
    
    setRegenerating(true);
    setResults([]);
    setIsPaused(false);
    setShouldStop(false);
    setProgress({ current: 0, total: selectedIds.size });
    
    const ids = Array.from(selectedIds);
    const newResults: RegenerateResult[] = [];
    
    for (let i = 0; i < ids.length; i++) {
      if (shouldStop) break;
      
      while (isPaused) {
        await new Promise(resolve => setTimeout(resolve, 500));
        if (shouldStop) break;
      }
      if (shouldStop) break;
      
      const docId = ids[i];
      const doc = incompleteDocs.find(d => d.id === docId);
      setCurrentProcessing(doc?.title || docId);
      setProgress({ current: i + 1, total: ids.length });
      
      try {
        const response = await documentApi.batchRegenerateContent([docId], true);
        const result = response.data.results[0];
        newResults.push(result);
        setResults([...newResults]);
      } catch (error) {
        newResults.push({
          id: docId,
          success: false,
          title: doc?.title,
          error: '请求失败'
        });
        setResults([...newResults]);
      }
      
      if (i < ids.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    }
    
    setRegenerating(false);
    setCurrentProcessing(null);
    
    if (onComplete && !shouldStop) {
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
    setIsPaused(false);
  };

  const successCount = results.filter(r => r.success).length;
  const failedCount = results.filter(r => !r.success).length;
  const isComplete = !regenerating && results.length > 0;

  return (
    <div className="modal-overlay">
      <div className="batch-regenerate-modal">
        <div className="modal-header">
          <h3>
            <RefreshCw size={20} />
            批量重新生成正文
          </h3>
          <button className="close-btn" onClick={onClose}>
            <X size={20} />
          </button>
        </div>

        <div className="modal-body">
          {!regenerating && results.length === 0 && (
            <>
              <div className="filter-row">
                <label>最小正文长度阈值：</label>
                <input
                  type="number"
                  value={minLength}
                  onChange={(e) => setMinLength(parseInt(e.target.value) || 100)}
                  min={10}
                  max={10000}
                />
                <span>字符</span>
                <button className="btn btn-secondary btn-sm" onClick={fetchIncompleteDocs}>
                  刷新列表
                </button>
              </div>

              <div className="selection-bar">
                <button className="select-all-btn" onClick={toggleSelectAll}>
                  {selectedIds.size === incompleteDocs.length && incompleteDocs.length > 0 ? (
                    <CheckSquare size={18} />
                  ) : (
                    <Square size={18} />
                  )}
                  全选
                </button>
                <span className="selection-count">
                  已选择 {selectedIds.size} / {incompleteDocs.length} 个文档
                </span>
              </div>

              {loading ? (
                <div className="loading-state">
                  <Loader size={24} className="spinning" />
                  <span>正在扫描生成不完整的文档...</span>
                </div>
              ) : incompleteDocs.length === 0 ? (
                <div className="empty-state">
                  <Check size={48} />
                  <p>没有发现生成不完整的文档</p>
                  <span>所有文档的正文都已正常生成</span>
                </div>
              ) : (
                <div className="incomplete-docs-list">
                  {incompleteDocs.map(doc => (
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
                        <div className="doc-meta">
                          <span>原文: {doc.original_content_length} 字符</span>
                          <span>正文: {doc.framework_content_length} 字符</span>
                        </div>
                        <div className="doc-issues">
                          {doc.issues.map((issue, i) => (
                            <span key={i} className="issue-tag">
                              <AlertTriangle size={12} />
                              {issue}
                            </span>
                          ))}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}

          {(regenerating || results.length > 0) && (
            <>
              <div className="progress-section">
                <div className="progress-header">
                  <span>
                    {regenerating ? (
                      isPaused ? '已暂停' : `正在处理: ${currentProcessing || '...'}`
                    ) : (
                      '处理完成'
                    )}
                  </span>
                  <span>{progress.current} / {progress.total}</span>
                </div>
                <div className="progress-bar">
                  <div 
                    className="progress-fill"
                    style={{ width: `${(progress.current / progress.total) * 100}%` }}
                  />
                </div>
                <div className="progress-stats">
                  <span className="success">
                    <Check size={14} /> 成功: {successCount}
                  </span>
                  <span className="failed">
                    <X size={14} /> 失败: {failedCount}
                  </span>
                </div>
              </div>

              <div className="results-list">
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
                          {result.old_length} → {result.new_length} 字符
                        </span>
                      ) : (
                        <span className="result-error">{result.error}</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>

        <div className="modal-footer">
          {results.length === 0 && !regenerating && (
            <>
              <button className="btn btn-secondary" onClick={onClose}>
                取消
              </button>
              <button 
                className="btn btn-primary" 
                onClick={handleRegenerate}
                disabled={selectedIds.size === 0 || loading}
              >
                <Play size={16} />
                开始重新生成 ({selectedIds.size})
              </button>
            </>
          )}

          {regenerating && (
            <>
              {isPaused ? (
                <button className="btn btn-primary" onClick={handleContinue}>
                  <Play size={16} />
                  继续
                </button>
              ) : (
                <button className="btn btn-secondary" onClick={handlePause}>
                  <Pause size={16} />
                  暂停
                </button>
              )}
              <button className="btn btn-danger" onClick={handleStop}>
                <X size={16} />
                停止
              </button>
            </>
          )}

          {isComplete && (
            <>
              <button className="btn btn-secondary" onClick={onClose}>
                关闭
              </button>
              <button className="btn btn-primary" onClick={() => {
                setResults([]);
                fetchIncompleteDocs();
              }}>
                <RefreshCw size={16} />
                继续检查
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default BatchRegeneratePanel;
