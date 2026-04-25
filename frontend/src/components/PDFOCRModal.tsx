import React, { useState, useEffect, useCallback, useRef } from 'react';
import { X, CheckCircle, AlertCircle, FileText, XCircle, Cpu, Edit3, Save, Sparkles } from 'lucide-react';
import { pdfOcrApi, chapterNoteApi } from '../api';
import ChapterNoteViewer from './ChapterNoteViewer';
import LoadingBook from './LoadingBook';

interface PDFOCRModalProps {
  isOpen: boolean;
  onClose: () => void;
  filePath: string;
  bookTitle: string;
  bookId?: string;
  documentId?: string;
  onOCRComplete: (textContent: string) => void;
}

interface OCRStatus {
  status: string;
  progress: number;
  current_page: number;
  total_pages: number;
  error: string | null;
  message: string;
  had_text: boolean;
  text_content: string | null;
  text_file_path: string | null;
}

interface GPUStatus {
  gpu_utilization: number;
  memory_used: number;
  memory_total: number;
  memory_percent: number;
  concurrent_workers: number;
}

const PDFOCRModal: React.FC<PDFOCRModalProps> = ({
  isOpen,
  onClose,
  filePath,
  bookTitle,
  bookId,
  documentId,
  onOCRComplete
}) => {
  const onOCRCompleteRef = useRef(onOCRComplete);
  
  useEffect(() => {
    onOCRCompleteRef.current = onOCRComplete;
  }, [onOCRComplete]);
  
  const [status, setStatus] = useState<OCRStatus>({
    status: 'idle',
    progress: 0,
    current_page: 0,
    total_pages: 0,
    error: null,
    message: '准备开始 OCR 处理...',
    had_text: false,
    text_content: null,
    text_file_path: null
  });
  const [isProcessing, setIsProcessing] = useState(false);
  const [gpuStatus, setGpuStatus] = useState<GPUStatus | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [editedText, setEditedText] = useState('');
  const [concurrency, setConcurrency] = useState(1);

  const [noteViewMode, setNoteViewMode] = useState(false);
  const [chapterNoteId, setChapterNoteId] = useState<string | null>(null);
  const [markdownContent, setMarkdownContent] = useState<string | null>(null);
  const [isGeneratingNote, setIsGeneratingNote] = useState(false);

  const notStartedRetryCount = useRef(0);
  const NOT_STARTED_MAX_RETRIES = 3;

  const startOCR = useCallback(async () => {
    if (!filePath) return;
    
    setIsProcessing(true);
    notStartedRetryCount.current = 0;
    setStatus({
      status: 'initializing',
      progress: 0,
      current_page: 0,
      total_pages: 0,
      error: null,
      message: '正在启动 OCR 处理...',
      had_text: false,
      text_content: null,
      text_file_path: null
    });

    try {
      await pdfOcrApi.extractTextAsync(filePath, { concurrency });
    } catch (error: any) {
      setStatus(prev => ({
        ...prev,
        status: 'failed',
        error: error.response?.data?.detail || error.message || '启动 OCR 处理失败'
      }));
      setIsProcessing(false);
    }
  }, [filePath, concurrency]);

  const cancelOCR = useCallback(async () => {
    if (!filePath) return;
    
    try {
      await pdfOcrApi.cancelOcr(filePath);
      setStatus(prev => ({
        ...prev,
        status: 'cancelled',
        message: '已取消处理'
      }));
      setIsProcessing(false);
    } catch (error: any) {
      console.error('Failed to cancel OCR:', error);
    }
  }, [filePath]);

  const pollStatus = useCallback(async () => {
    if (!filePath) return;

    try {
      const response = await pdfOcrApi.getExtractTextStatus(filePath);
      const newStatus = response.data;
      
      setStatus({
        status: newStatus.status,
        progress: newStatus.progress,
        current_page: newStatus.current_page,
        total_pages: newStatus.total_pages,
        error: newStatus.error,
        message: newStatus.message,
        had_text: newStatus.had_text || false,
        text_content: newStatus.text_content,
        text_file_path: newStatus.text_file_path || null
      });

      if (newStatus.status === 'not_started') {
        notStartedRetryCount.current += 1;
        
        if (notStartedRetryCount.current <= NOT_STARTED_MAX_RETRIES) {
          try {
            await pdfOcrApi.extractTextAsync(filePath, { concurrency });
          } catch (retryError: any) {
            if (notStartedRetryCount.current >= NOT_STARTED_MAX_RETRIES) {
              setStatus(prev => ({
                ...prev,
                status: 'failed',
                error: 'OCR 任务启动失败，请重试'
              }));
              setIsProcessing(false);
            }
          }
        } else {
          setStatus(prev => ({
            ...prev,
            status: 'failed',
            error: 'OCR 任务未能成功启动，请重试'
          }));
          setIsProcessing(false);
        }
      } else if (newStatus.status === 'completed') {
        setIsProcessing(false);
        notStartedRetryCount.current = 0;
        
        let textToUse = newStatus.text_content;
        
        if (!textToUse && newStatus.text_file_path) {
          try {
            const textResponse = await pdfOcrApi.getOcrText(filePath);
            textToUse = textResponse.data;
          } catch (e) {
            console.error('[前端OCR] 读取OCR文本文件失败:', e);
          }
        }
        
        if (textToUse && typeof textToUse === 'string') {
          setEditedText(textToUse);
          setStatus(prev => ({ ...prev, text_content: textToUse }));
          setTimeout(() => {
            onOCRCompleteRef.current(textToUse);
          }, 300);
        } else {
          setTimeout(() => {
            onOCRCompleteRef.current('');
          }, 300);
        }
      } else if (newStatus.status === 'failed' || newStatus.status === 'cancelled') {
        setIsProcessing(false);
        notStartedRetryCount.current = 0;
      } else {
        notStartedRetryCount.current = 0;
      }
    } catch (error: any) {
      console.error('[前端OCR] 轮询状态失败:', error);
    }
  }, [filePath, concurrency]);

  const pollGpuStatus = useCallback(async () => {
    try {
      const response = await pdfOcrApi.getGpuStatus();
      setGpuStatus(response.data);
    } catch (error) {
      console.error('Failed to get GPU status:', error);
    }
  }, []);

  const handleSaveText = useCallback(async () => {
    if (!filePath || !editedText) return;
    
    try {
      await pdfOcrApi.saveOcrText(filePath, editedText);
      onOCRCompleteRef.current(editedText);
      setIsEditing(false);
    } catch (error) {
      console.error('Failed to save OCR text:', error);
    }
  }, [filePath, editedText]);

  const handleGenerateNote = useCallback(async () => {
    const textContent = status.text_content || editedText;
    if (!textContent) return;

    setIsGeneratingNote(true);
    setMarkdownContent(null);

    try {
      const createResponse = await chapterNoteApi.create({
        book_id: bookId,
        document_id: documentId,
        chapter_title: bookTitle,
        original_text: textContent,
      });
      
      const noteId = createResponse.data.id;
      setChapterNoteId(noteId);

      const generateResponse = await chapterNoteApi.generate({
        original_text: textContent,
        chapter_title: bookTitle,
      });

      const mdContent = generateResponse.data.markdown_content;
      setMarkdownContent(mdContent);

      await chapterNoteApi.update(noteId, {
        markdown_content: mdContent,
        status: 'completed',
      });

      setNoteViewMode(true);
    } catch (error: any) {
      console.error('Failed to generate chapter note:', error);
      alert('生成笔记失败: ' + (error.response?.data?.detail || error.message));
    } finally {
      setIsGeneratingNote(false);
    }
  }, [status.text_content, editedText, bookTitle, bookId, documentId]);

  useEffect(() => {
    if (isOpen && isProcessing) {
      const interval = setInterval(pollStatus, 1000);
      const gpuInterval = setInterval(pollGpuStatus, 2000);
      return () => {
        clearInterval(interval);
        clearInterval(gpuInterval);
      };
    }
  }, [isOpen, isProcessing, pollStatus, pollGpuStatus]);

  useEffect(() => {
    if (!isOpen) {
      setStatus({
        status: 'idle',
        progress: 0,
        current_page: 0,
        total_pages: 0,
        error: null,
        message: '准备开始 OCR 处理...',
        had_text: false,
        text_content: null,
        text_file_path: null
      });
      setIsProcessing(false);
      setIsEditing(false);
      setNoteViewMode(false);
      setChapterNoteId(null);
      setMarkdownContent(null);
      setIsGeneratingNote(false);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const getStatusIcon = () => {
    switch (status.status) {
      case 'idle':
        return <FileText size={48} className="status-icon" />;
      case 'not_started':
      case 'initializing':
      case 'loading_model':
      case 'processing':
        return <LoadingBook size={40} />;
      case 'completed':
        return <CheckCircle size={48} className="status-icon success" />;
      case 'failed':
      case 'cancelled':
        return <AlertCircle size={48} className="status-icon error" />;
      default:
        return <LoadingBook size={40} />;
    }
  };

  const getStatusColor = () => {
    switch (status.status) {
      case 'idle':
        return 'var(--color-text-secondary)';
      case 'not_started':
      case 'initializing':
      case 'loading_model':
      case 'processing':
        return 'var(--color-primary)';
      case 'completed':
        return 'var(--color-success)';
      case 'failed':
      case 'cancelled':
        return 'var(--color-error)';
      default:
        return 'var(--color-primary)';
    }
  };

  const getStatusMessage = () => {
    if (status.status === 'idle') {
      return '请选择并行数量，然后点击"开始处理"';
    }
    if (status.had_text) {
      return 'PDF 已包含文字层，无需 OCR 处理';
    }
    switch (status.status) {
      case 'not_started':
        return '正在准备启动 OCR 任务...';
      case 'initializing':
        return status.message || '正在初始化 OCR 处理...';
      case 'loading_model':
        return status.message || '正在加载 OCR 模型，请稍候...';
      case 'processing':
        return status.message || '正在处理中...';
      default:
        return status.message;
    }
  };

  if (noteViewMode) {
    return (
      <div className="pdf-ocr-modal-overlay">
        <div className="pdf-ocr-modal" style={{ width: '90vw', maxWidth: 1200, height: '85vh' }}>
          <ChapterNoteViewer
            chapterTitle={bookTitle}
            originalText={status.text_content || editedText}
            markdownContent={markdownContent}
            isGenerating={isGeneratingNote}
            onBack={() => setNoteViewMode(false)}
            bookId={bookId}
            noteId={chapterNoteId}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="pdf-ocr-modal-overlay">
      <div className="pdf-ocr-modal">
        <div className="pdf-ocr-modal-header">
          <h3>
            <FileText size={20} />
            OCR 文字识别
          </h3>
          <button 
            className="close-btn" 
            onClick={onClose}
            disabled={isProcessing && status.status !== 'completed' && status.status !== 'failed' && status.status !== 'cancelled'}
          >
            <X size={20} />
          </button>
        </div>

        <div className="pdf-ocr-modal-content">
          <div className="book-info">
            <span className="label">文档：</span>
            <span className="title">{bookTitle}</span>
          </div>

          {gpuStatus && isProcessing && (
            <div className="gpu-status-panel">
              <div className="gpu-status-header">
                <Cpu size={16} />
                <span>GPU 状态</span>
              </div>
              <div className="gpu-status-content">
                <div className="gpu-metric">
                  <span className="metric-label">GPU 使用率</span>
                  <div className="metric-bar">
                    <div 
                      className="metric-fill gpu-util" 
                      style={{ width: `${gpuStatus.gpu_utilization}%` }}
                    />
                  </div>
                  <span className="metric-value">{gpuStatus.gpu_utilization.toFixed(1)}%</span>
                </div>
                <div className="gpu-metric">
                  <span className="metric-label">显存使用</span>
                  <div className="metric-bar">
                    <div 
                      className="metric-fill gpu-mem" 
                      style={{ width: `${gpuStatus.memory_percent}%` }}
                    />
                  </div>
                  <span className="metric-value">
                    {(gpuStatus.memory_used / 1024).toFixed(1)}GB / {(gpuStatus.memory_total / 1024).toFixed(1)}GB
                  </span>
                </div>
                <div className="gpu-metric">
                  <span className="metric-label">并行数</span>
                  <span className="metric-value workers">{gpuStatus.concurrent_workers}</span>
                </div>
              </div>
            </div>
          )}

          <div className="status-display">
            {getStatusIcon()}
            
            <div className="status-message" style={{ color: getStatusColor() }}>
              {getStatusMessage()}
            </div>

            {status.error && (
              <div className="error-message">
                {status.error}
              </div>
            )}

            {isProcessing && status.total_pages > 0 && (
              <div className="progress-section">
                <div className="progress-bar-container">
                  <div 
                    className="progress-bar" 
                    style={{ width: `${status.progress}%` }}
                  />
                </div>
                <div className="progress-text">
                  {status.current_page} / {status.total_pages} 页 ({status.progress}%)
                </div>
              </div>
            )}

            {isProcessing && status.total_pages === 0 && (status.status === 'initializing' || status.status === 'loading_model') && (
              <div className="progress-section">
                <div className="progress-bar-container">
                  <div className="progress-bar indeterminate" />
                </div>
                <div className="progress-text">
                  {status.status === 'loading_model' ? '加载 OCR 模型中...' : '初始化中...'}
                </div>
              </div>
            )}
          </div>

          {status.status === 'idle' && !isProcessing && (
            <div className="concurrency-panel">
              <div className="concurrency-label">
                <Cpu size={18} />
                <span>并行数量</span>
              </div>
              <div className="concurrency-selector">
                {[1, 2, 3, 4, 5].map((num) => (
                  <button
                    key={num}
                    className={`concurrency-btn ${concurrency === num ? 'active' : ''}`}
                    onClick={() => setConcurrency(num)}
                    disabled={num > 1}
                    title={num > 1 ? '多并发模式暂不支持，后续版本将开放' : ''}
                  >
                    {num}
                  </button>
                ))}
              </div>
              <div className="concurrency-hint">
                当前仅支持单线程处理，确保精度和顺序正确
              </div>
            </div>
          )}

          {status.status === 'completed' && status.text_content && (
            <div className="ocr-text-preview">
              <div className="ocr-text-header">
                <span>识别结果</span>
                <div className="ocr-text-actions">
                  {isEditing ? (
                    <>
                      <button className="btn-icon" onClick={() => setIsEditing(false)}>
                        <X size={16} />
                        取消
                      </button>
                      <button className="btn-icon save" onClick={handleSaveText}>
                        <Save size={16} />
                        保存
                      </button>
                    </>
                  ) : (
                    <>
                      <button 
                        className="btn-icon generate-note-btn" 
                        onClick={handleGenerateNote}
                        disabled={isGeneratingNote}
                        style={{ 
                          display: 'flex', alignItems: 'center', gap: 4, 
                          background: 'linear-gradient(135deg, #8b5cf6, #6366f1)', 
                          color: 'white', border: 'none', borderRadius: 6, 
                          padding: '4px 10px', cursor: isGeneratingNote ? 'wait' : 'pointer',
                          fontSize: 12, fontWeight: 500
                        }}
                      >
                        <Sparkles size={14} />
                        {isGeneratingNote ? '整理中...' : '快速制作笔记'}
                      </button>
                      <button className="btn-icon" onClick={() => setIsEditing(true)}>
                        <Edit3 size={16} />
                        编辑
                      </button>
                    </>
                  )}
                </div>
              </div>
              {isEditing ? (
                <textarea
                  className="ocr-text-editor"
                  value={editedText}
                  onChange={(e) => setEditedText(e.target.value)}
                />
              ) : (
                <div className="ocr-text-content">
                  <pre>{status.text_content}</pre>
                </div>
              )}
            </div>
          )}

          <div className="ocr-info">
            <p>
              OCR 处理会识别扫描型 PDF 中的文字。
              处理完成后，可点击"快速制作笔记"将文本整理为结构清晰的Markdown笔记。
            </p>
          </div>
        </div>

        <div className="pdf-ocr-modal-footer">
          {status.status === 'idle' && !isProcessing && (
            <>
              <button className="btn btn-secondary" onClick={onClose}>
                取消
              </button>
              <button className="btn btn-primary" onClick={startOCR}>
                开始处理
              </button>
            </>
          )}
          {status.status === 'completed' && (
            <button className="btn btn-primary" onClick={onClose}>
              完成
            </button>
          )}
          {status.status === 'failed' && (
            <>
              <button className="btn btn-secondary" onClick={onClose}>
                取消
              </button>
              <button className="btn btn-primary" onClick={startOCR}>
                重试
              </button>
            </>
          )}
          {status.status === 'cancelled' && (
            <>
              <button className="btn btn-secondary" onClick={onClose}>
                关闭
              </button>
              <button className="btn btn-primary" onClick={startOCR}>
                继续处理
              </button>
            </>
          )}
          {isProcessing && !['completed', 'failed', 'cancelled'].includes(status.status) && (
            <button className="btn btn-danger" onClick={cancelOCR}>
              <XCircle size={16} />
              取消处理
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default PDFOCRModal;
