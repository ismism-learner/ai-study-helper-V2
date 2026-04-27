import React, { useState, useRef, useEffect } from 'react';
import { CreateDocumentRequest } from '../types';
import { Upload, FileText, X, Check } from 'lucide-react';
import { documentApi } from '../api';
import LoadingBook from './LoadingBook';

interface CreateDocumentModalProps {
  onClose: () => void;
  onCreate: (data: CreateDocumentRequest) => void;
  onUpload: (file: File) => void;
  onBatchUploadComplete: () => void;
  folderId?: string | null;
  isLoading: boolean;
}

interface UploadingFile {
  file: File;
  id: string;
  status: 'pending' | 'uploading' | 'success' | 'error';
  error?: string;
}

const CreateDocumentModal: React.FC<CreateDocumentModalProps> = ({
  onClose,
  onCreate,
  onUpload,
  onBatchUploadComplete,
  folderId,
  isLoading,
}) => {
  const [activeTab, setActiveTab] = useState<'upload' | 'input'>('upload');
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [dragOver, setDragOver] = useState(false);
  const [files, setFiles] = useState<UploadingFile[]>([]);
  const [isBatchUploading, setIsBatchUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const closeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (closeTimeoutRef.current) {
        clearTimeout(closeTimeoutRef.current);
      }
    };
  }, []);

  const handleFileSelect = (file: File) => {
    const ext = file.name.split('.').pop()?.toLowerCase();
    if (ext === 'md' || ext === 'markdown' || ext === 'docx') {
      onUpload(file);
    } else {
      alert('只支持 .md, .markdown, .docx 格式的文件');
    }
  };

  const addFiles = (newFiles: File[]) => {
    const uploadingFiles: UploadingFile[] = newFiles.map(file => ({
      file,
      id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      status: 'pending' as const,
    }));
    setFiles(prev => [...prev, ...uploadingFiles]);
  };

  const removeFile = (id: string) => {
    setFiles(prev => prev.filter(f => f.id !== id));
  };

  const handleBatchUpload = async () => {
    if (files.length === 0) return;
    
    setIsBatchUploading(true);
    setUploadProgress(0);
    
    const pendingFilesList = files.filter(f => f.status === 'pending');
    
    for (let i = 0; i < pendingFilesList.length; i++) {
      const fileItem = pendingFilesList[i];
      
      setFiles(prev => prev.map(f => 
        f.id === fileItem.id ? { ...f, status: 'uploading' } : f
      ));
    }
    
    try {
      const filesToUpload = pendingFilesList.map(f => f.file);
      await documentApi.uploadBatch(filesToUpload, folderId || undefined);
      
      pendingFilesList.forEach(fileItem => {
        setFiles(prev => prev.map(f => 
          f.id === fileItem.id ? { ...f, status: 'success' } : f
        ));
      });
      
      setUploadProgress(100);
      
      onBatchUploadComplete();
      
      if (closeTimeoutRef.current) {
        clearTimeout(closeTimeoutRef.current);
      }
      closeTimeoutRef.current = setTimeout(() => onClose(), 500);
      
    } catch (error: any) {
      console.error('Batch upload error:', error);
      
      pendingFilesList.forEach(fileItem => {
        setFiles(prev => prev.map(f => 
          f.id === fileItem.id ? { ...f, status: 'error', error: error.message || '上传失败' } : f
        ));
      });
      
      alert('批量上传失败: ' + (error.response?.data?.detail || error.message));
    }
    
    setIsBatchUploading(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const droppedFiles = Array.from(e.dataTransfer.files);
    if (droppedFiles.length > 0) {
      if (droppedFiles.length === 1) {
        handleFileSelect(droppedFiles[0]);
      } else {
        const validFiles = droppedFiles.filter(file => {
          const ext = file.name.split('.').pop()?.toLowerCase();
          return ext === 'md' || ext === 'markdown' || ext === 'docx';
        });
        if (validFiles.length > 0) {
          addFiles(validFiles);
        } else {
          alert('只支持 .md, .markdown, .docx 格式的文件');
        }
      }
    }
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = e.target.files ? Array.from(e.target.files) : [];
    if (selectedFiles.length === 1) {
      handleFileSelect(selectedFiles[0]);
    } else if (selectedFiles.length > 1) {
      const validFiles = selectedFiles.filter(file => {
        const ext = file.name.split('.').pop()?.toLowerCase();
        return ext === 'md' || ext === 'markdown' || ext === 'docx';
      });
      if (validFiles.length > 0) {
        addFiles(validFiles);
      } else {
        alert('只支持 .md, .markdown, .docx 格式的文件');
      }
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !content.trim()) {
      alert('请填写标题和内容');
      return;
    }
    onCreate({ title: title.trim(), original_content: content.trim() });
  };

  const pendingFiles = files.filter(f => f.status === 'pending');
  const successFiles = files.filter(f => f.status === 'success');
  const errorFiles = files.filter(f => f.status === 'error');

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ minWidth: files.length > 0 ? 560 : 'auto' }}>
        <h2>创建新文档</h2>

        <div className="tabs">
          <button
            className={`tab ${activeTab === 'upload' ? 'active' : ''}`}
            onClick={() => setActiveTab('upload')}
          >
            <Upload size={16} style={{ marginRight: 6, verticalAlign: 'middle' }} />
            上传文件
          </button>
          <button
            className={`tab ${activeTab === 'input' ? 'active' : ''}`}
            onClick={() => setActiveTab('input')}
          >
            <FileText size={16} style={{ marginRight: 6, verticalAlign: 'middle' }} />
            手动输入
          </button>
        </div>

        {activeTab === 'upload' ? (
          <div style={{ padding: '20px 0' }}>
            <div
              style={{
                border: '2px dashed #dee2e6',
                borderRadius: 12,
                padding: 40,
                textAlign: 'center',
                background: dragOver ? 'var(--bg-muted)' : 'white',
                transition: 'all 0.2s ease',
                cursor: 'pointer',
              }}
              onDragOver={(e) => {
                e.preventDefault();
                setDragOver(true);
              }}
              onDragLeave={() => setDragOver(false)}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
            >
              <Upload size={48} style={{ color: 'var(--text-muted)', marginBottom: 16 }} />
              <p style={{ fontSize: 16, color: 'var(--text-primary)', marginBottom: 8 }}>
                拖拽文件到此处，或点击选择文件
              </p>
              <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                支持 .md, .markdown, .docx 格式（支持多选批量上传）
              </p>
            </div>

            <input
              ref={fileInputRef}
              type="file"
              accept=".md,.markdown,.docx"
              multiple
              style={{ display: 'none' }}
              onChange={handleFileInputChange}
            />

            {files.length > 0 && (
              <div style={{ marginTop: 20 }}>
                <div style={{ 
                  display: 'flex', 
                  justifyContent: 'space-between', 
                  alignItems: 'center',
                  marginBottom: 12 
                }}>
                  <h4 style={{ margin: 0, fontSize: 14, color: 'var(--text-primary)' }}>
                    待上传文件 ({files.length})
                  </h4>
                  <div style={{ display: 'flex', gap: 12, fontSize: 12 }}>
                    {successFiles.length > 0 && (
                      <span style={{ color: 'var(--success-500)', display: 'flex', alignItems: 'center', gap: 4 }}>
                        <Check size={14} />
                        {successFiles.length} 成功
                      </span>
                    )}
                    {errorFiles.length > 0 && (
                      <span style={{ color: 'var(--danger-500)', display: 'flex', alignItems: 'center', gap: 4 }}>
                        <X size={14} />
                        {errorFiles.length} 失败
                      </span>
                    )}
                  </div>
                </div>
                
                <div style={{ 
                  maxHeight: 200, 
                  overflowY: 'auto',
                  border: '1px solid #e9ecef',
                  borderRadius: 8,
                  padding: 8
                }}>
                  {files.map(fileItem => (
                    <div 
                      key={fileItem.id} 
                      style={{ 
                        display: 'flex', 
                        alignItems: 'center', 
                        padding: '8px 12px',
                        background: fileItem.status === 'success' ? 'var(--success-light)' : 
                                   fileItem.status === 'error' ? 'var(--danger-light)' : 'white',
                        borderRadius: 6,
                        marginBottom: 4,
                        gap: 12
                      }}
                    >
                      <FileText size={18} style={{ color: 'var(--text-muted)' }} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ 
                          fontSize: 13, 
                          color: '#333',
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis'
                        }}>
                          {fileItem.file.name}
                        </div>
                        <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                          {(fileItem.file.size / 1024).toFixed(1)} KB
                        </div>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        {fileItem.status === 'pending' && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              removeFile(fileItem.id);
                            }}
                            disabled={isBatchUploading}
                            style={{
                              background: 'none',
                              border: 'none',
                              cursor: 'pointer',
                              padding: 4,
                              color: 'var(--text-muted)',
                              display: 'flex',
                              alignItems: 'center',
                            }}
                          >
                            <X size={16} />
                          </button>
                        )}
                        {fileItem.status === 'uploading' && (
                          <LoadingBook size={16} />
                        )}
                        {fileItem.status === 'success' && (
                          <Check size={16} style={{ color: 'var(--success-500)' }} />
                        )}
                        {fileItem.status === 'error' && (
                          <span style={{ fontSize: 11, color: 'var(--danger-500)' }} title={fileItem.error}>
                            失败
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>

                {isBatchUploading && (
                  <div style={{ marginTop: 12 }}>
                    <div style={{ 
                      height: 6, 
                      background: 'var(--border-default)', 
                      borderRadius: 3,
                      overflow: 'hidden'
                    }}>
                      <div 
                        style={{ 
                          height: '100%', 
                          background: 'var(--accent-500)',
                          width: `${uploadProgress}%`,
                          transition: 'width 0.3s ease'
                        }} 
                      />
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4, textAlign: 'center' }}>
                      上传中... {Math.round(uploadProgress)}%
                    </div>
                  </div>
                )}
              </div>
            )}

            <div style={{ marginTop: 20, display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button
                className="btn btn-secondary"
                onClick={onClose}
                disabled={isLoading || isBatchUploading}
              >
                取消
              </button>
              {files.length > 0 && (
                <button
                  className="btn btn-primary"
                  onClick={handleBatchUpload}
                  disabled={isLoading || isBatchUploading || pendingFiles.length === 0}
                >
                  {isBatchUploading ? '上传中...' : `上传 ${pendingFiles.length} 个文件`}
                </button>
              )}
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit}>
            <div className="form-group">
              <label>文档标题</label>
              <input
                type="text"
                className="input"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="输入文档标题..."
                autoFocus
              />
            </div>

            <div className="form-group">
              <label>文档内容（支持Markdown格式）</label>
              <textarea
                className="input textarea"
                value={content}
                onChange={(e) => setContent(e.target.value)}
                placeholder="输入或粘贴文档内容..."
                style={{ minHeight: 300 }}
              />
            </div>

            <div className="modal-actions">
              <button
                type="button"
                className="btn btn-secondary"
                onClick={onClose}
                disabled={isLoading}
              >
                取消
              </button>
              <button
                type="submit"
                className="btn btn-primary"
                disabled={isLoading}
              >
                {isLoading ? '创建中...' : '创建文档'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};

export default CreateDocumentModal;
