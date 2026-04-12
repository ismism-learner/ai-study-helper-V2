import React, { useState, useCallback, useEffect } from 'react';
import { Upload, X, FileText, Check, Loader, MapPin, AlertTriangle, AlertCircle, FolderOpen } from 'lucide-react';
import { countryApi } from '../api';
import { Country } from '../types';

interface BatchUploadModalProps {
  countryId?: string;
  folderId?: string | null;
  onClose: () => void;
  onSuccess: () => void;
}

interface UploadingFile {
  file: File;
  id: string;
  status: 'pending' | 'checking' | 'duplicate' | 'uploading' | 'success' | 'error';
  error?: string;
  relativePath?: string; // 文件相对路径，用于保留文件夹结构
  duplicateInfo?: {
    duplicate_type: string;
    existing_book_title: string;
    existing_book_author?: string;
    similarity_score: number;
  };
}

interface DuplicateCheckResult {
  total_files: number;
  unique_files: Array<{
    filename: string;
    title: string;
    file_hash: string;
    file_size: number;
    page_count: number;
  }>;
  duplicate_files: Array<{
    filename: string;
    title: string;
    duplicate_type: string;
    existing_book_id: string;
    existing_book_title: string;
    existing_book_author: string | null;
    similarity_score: number;
    file_size: number;
    page_count: number;
  }>;
  check_details: Array<{
    filename: string;
    status: string;
    duplicate_type?: string;
    existing_book_title?: string;
    reason?: string;
  }>;
}

const BatchUploadModal: React.FC<BatchUploadModalProps> = ({ countryId, folderId: _folderId, onClose, onSuccess }) => {
  const [files, setFiles] = useState<UploadingFile[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [isChecking, setIsChecking] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [countries, setCountries] = useState<Country[]>([]);
  const [selectedCountryId, setSelectedCountryId] = useState<string>(countryId || '');
  const [duplicateCheckResult, setDuplicateCheckResult] = useState<DuplicateCheckResult | null>(null);
  const [showDuplicateDialog, setShowDuplicateDialog] = useState(false);

  useEffect(() => {
    loadCountries();
  }, []);

  useEffect(() => {
    if (countryId) {
      setSelectedCountryId(countryId);
    }
  }, [countryId]);

  const loadCountries = async () => {
    try {
      const response = await countryApi.list();
      setCountries(response.data);
    } catch (error) {
      console.error('Failed to load countries:', error);
    }
  };

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    
    const droppedFiles = Array.from(e.dataTransfer.files).filter(
      file => file.type === 'application/pdf' || 
              file.type === 'application/epub+zip' ||
              file.type === 'text/plain' ||
              file.type === 'application/msword' ||
              file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
              file.name.endsWith('.pdf') ||
              file.name.endsWith('.epub') ||
              file.name.endsWith('.txt') ||
              file.name.endsWith('.doc') ||
              file.name.endsWith('.docx')
    );
    
    addFiles(droppedFiles);
  }, []);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const selectedFiles = Array.from(e.target.files);
      addFiles(selectedFiles);
    }
  };

  const handleFolderSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    console.log('handleFolderSelect called');
    console.log('e.target.files:', e.target.files);
    console.log('e.target.files length:', e.target.files?.length);
    
    if (e.target.files) {
      const selectedFiles = Array.from(e.target.files);
      console.log('selectedFiles:', selectedFiles);
      console.log('Total files selected:', selectedFiles.length);
      
      // 打印所有文件的相对路径
      selectedFiles.forEach((file, index) => {
        const relativePath = (file as any).webkitRelativePath || file.name;
        console.log(`File ${index}:`, file.name, '-> Relative path:', relativePath);
      });
      
      const validFiles: UploadingFile[] = [];
      
      selectedFiles.forEach(file => {
        console.log('Checking file:', file.name, 'type:', file.type);
        const isValid = file.type === 'application/pdf' || 
                       file.type === 'application/epub+zip' ||
                       file.type === 'text/plain' ||
                       file.type === 'application/msword' ||
                       file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
                       file.name.endsWith('.pdf') ||
                       file.name.endsWith('.epub') ||
                       file.name.endsWith('.txt') ||
                       file.name.endsWith('.doc') ||
                       file.name.endsWith('.docx');
        
        console.log('File valid:', isValid);
        
        if (isValid) {
          // 提取相对路径，webkitRelativePath 格式为 "文件夹名/子文件夹/文件名.pdf"
          const relativePath = (file as any).webkitRelativePath || file.name;
          console.log('Adding file with relative path:', relativePath);
          validFiles.push({
            file,
            id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            status: 'pending' as const,
            relativePath
          });
        }
      });
      
      console.log('validFiles count:', validFiles.length);
      console.log('validFiles:', validFiles);
      setFiles(prev => [...prev, ...validFiles]);
      setDuplicateCheckResult(null);
      setShowDuplicateDialog(false);
    }
  };

  const addFiles = (newFiles: File[]) => {
    const uploadingFiles: UploadingFile[] = newFiles.map(file => ({
      file,
      id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      status: 'pending' as const,
    }));
    setFiles(prev => [...prev, ...uploadingFiles]);
    setDuplicateCheckResult(null);
    setShowDuplicateDialog(false);
  };

  const removeFile = (id: string) => {
    setFiles(prev => prev.filter(f => f.id !== id));
  };

  const checkDuplicates = async (): Promise<DuplicateCheckResult | null> => {
    const pendingFiles = files.filter(f => f.status === 'pending');
    if (pendingFiles.length === 0) return null;

    setIsChecking(true);
    
    setFiles(prev => prev.map(f => 
      f.status === 'pending' ? { ...f, status: 'checking' } : f
    ));

    // 只发送文件名列表进行快速检测
    const filenames = pendingFiles.map(f => f.file.name);

    try {
      const response = await fetch('/api/documents/check-duplicates-by-name', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ filenames }),
      });
      
      const result = await response.json();
      setDuplicateCheckResult(result);
      
      setFiles(prev => prev.map(f => {
        if (f.status !== 'checking') return f;
        
        const dupInfo = result.duplicate_files.find((d: any) => d.filename === f.file.name);
        if (dupInfo) {
          return {
            ...f,
            status: 'duplicate' as const,
            duplicateInfo: {
              duplicate_type: dupInfo.duplicate_type,
              existing_book_title: dupInfo.existing_title,
              existing_book_author: dupInfo.existing_author,
              similarity_score: 1.0,
            }
          };
        }
        
        return { ...f, status: 'pending' };
      }));

      return result;
    } catch (error) {
      console.error('Failed to check duplicates:', error);
      setFiles(prev => prev.map(f => 
        f.status === 'checking' ? { ...f, status: 'pending' } : f
      ));
      return null;
    } finally {
      setIsChecking(false);
    }
  };

  const handleUpload = async () => {
    if (files.length === 0) return;
    
    const pendingFiles = files.filter(f => f.status === 'pending');
    if (pendingFiles.length === 0) {
      alert('没有可上传的文件（所有文件都是重复的）');
      return;
    }

    if (!duplicateCheckResult) {
      const result = await checkDuplicates();
      if (result && result.duplicate_files.length > 0) {
        setShowDuplicateDialog(true);
        return;
      }
    }
    
    await performUpload();
  };

  const performUpload = async () => {
    const pendingFiles = files.filter(f => f.status === 'pending');
    if (pendingFiles.length === 0) return;

    setIsUploading(true);
    setUploadProgress(0);
    setShowDuplicateDialog(false);
    
    let successCount = 0;
    let errorCount = 0;
    
    for (let i = 0; i < pendingFiles.length; i++) {
      const file = pendingFiles[i];
      
      setFiles(prev => prev.map(f => 
        f.id === file.id ? { ...f, status: 'uploading' } : f
      ));
      
      try {
        const title = file.file.name.replace(/\.[^/.]+$/, '');
        
        // 创建FormData并添加相对路径信息
        const formData = new FormData();
        formData.append('file', file.file);
        formData.append('title', title);
        if (file.relativePath) {
          formData.append('relative_path', file.relativePath);
        }
        
        // 使用文档上传API而不是书籍上传API
        const response = await fetch('/api/documents/upload-with-path', {
          method: 'POST',
          body: formData
        });
        
        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          throw new Error(errorData.detail || `Upload failed: ${response.statusText}`);
        }
        
        setFiles(prev => prev.map(f => 
          f.id === file.id ? { ...f, status: 'success' } : f
        ));
        successCount++;
      } catch (error: any) {
        let errorMessage = error.message;
        console.error(`Upload failed for ${file.file.name}:`, errorMessage, error);
        setFiles(prev => prev.map(f => 
          f.id === file.id ? { ...f, status: 'error', error: errorMessage } : f
        ));
        errorCount++;
      }
      
      setUploadProgress(((i + 1) / pendingFiles.length) * 100);
    }
    
    setIsUploading(false);
    
    if (successCount > 0) {
      onSuccess();
    }
  };

  const handleForceUpload = () => {
    setShowDuplicateDialog(false);
    performUpload();
  };

  const pendingFiles = files.filter(f => f.status === 'pending');
  const successFiles = files.filter(f => f.status === 'success');
  const errorFiles = files.filter(f => f.status === 'error');
  const duplicateFiles = files.filter(f => f.status === 'duplicate');

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="batch-upload-modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 700 }}>
        <div className="modal-header">
          <h2>
            <Upload size={20} />
            批量上传图书
          </h2>
          <button className="close-btn" onClick={onClose} disabled={isUploading || isChecking}>
            <X size={20} />
          </button>
        </div>

        <div className="modal-body">
          <div
            className={`drop-zone ${isDragging ? 'dragging' : ''}`}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
          >
            <div className="drop-zone-content">
              <Upload size={48} strokeWidth={1.5} />
              <p className="drop-zone-title">拖拽文件到此处上传</p>
              <p className="drop-zone-hint">支持 PDF、EPUB、TXT、DOC、DOCX 格式（自动检测重复）</p>
              <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
                <label className="file-select-btn">
                  <input
                    type="file"
                    multiple
                    accept=".pdf,.epub,.txt,.doc,.docx"
                    onChange={handleFileSelect}
                    style={{ display: 'none' }}
                    disabled={isUploading || isChecking}
                  />
                  选择文件
                </label>
                <label className="file-select-btn" style={{ background: 'var(--success-500)', borderColor: 'var(--success-500)' }}>
                  <input
                    type="file"
                    multiple
                    // @ts-expect-error webkitdirectory is not in the type definition
                    webkitdirectory=""
                    directory=""
                    onChange={handleFolderSelect}
                    style={{ display: 'none' }}
                    disabled={isUploading || isChecking}
                  />
                  <FolderOpen size={14} style={{ marginRight: 4 }} />
                  选择文件夹
                </label>
              </div>
            </div>
          </div>

          <div className="country-select-section" style={{ 
            padding: '16px', 
            background: '#f8f9fa', 
            borderRadius: 8, 
            marginBottom: 16 
          }}>
            <label style={{ 
              display: 'flex', 
              alignItems: 'center', 
              gap: 8, 
              marginBottom: 8,
              fontWeight: 500,
              color: '#495057'
            }}>
              <MapPin size={16} />
              所属国家/地区
            </label>
            <select
              value={selectedCountryId}
              onChange={(e) => setSelectedCountryId(e.target.value)}
              disabled={isUploading || isChecking}
              style={{
                width: '100%',
                padding: '10px 12px',
                border: '1px solid #dee2e6',
                borderRadius: 6,
                fontSize: 14,
                background: 'white'
              }}
            >
              <option value="">选择国家/地区（可选）</option>
              {countries.map(country => (
                <option key={country.id} value={country.id}>{country.name}</option>
              ))}
            </select>
          </div>

          {duplicateFiles.length > 0 && (
            <div style={{ 
              padding: 16, 
              background: '#fff3cd', 
              borderRadius: 8, 
              marginBottom: 16,
              border: '1px solid #ffc107'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                <AlertTriangle size={18} color="#856404" />
                <span style={{ fontWeight: 500, color: '#856404' }}>
                  检测到 {duplicateFiles.length} 本重复书籍
                </span>
              </div>
              <div style={{ maxHeight: 150, overflow: 'auto' }}>
                {duplicateFiles.map(file => (
                  <div key={file.id} style={{ 
                    padding: '8px 12px', 
                    background: '#fff', 
                    borderRadius: 4, 
                    marginBottom: 4,
                    fontSize: 13
                  }}>
                    <div style={{ fontWeight: 500 }}>{file.file.name}</div>
                    <div style={{ color: '#666', fontSize: 12, marginTop: 2 }}>
                      与《{file.duplicateInfo?.existing_book_title}》重复
                      {file.duplicateInfo?.duplicate_type === 'exact' && ' (完全相同)'}
                      {file.duplicateInfo?.duplicate_type === 'content' && ' (内容相似)'}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {files.length > 0 && (
            <div className="file-list-section">
              <div className="file-list-header">
                <h3>待上传文件 ({files.length})</h3>
                <div className="file-stats">
                  {successFiles.length > 0 && (
                    <span className="stat success">
                      <Check size={14} />
                      {successFiles.length} 成功
                    </span>
                  )}
                  {duplicateFiles.length > 0 && (
                    <span className="stat" style={{ color: '#856404' }}>
                      <AlertTriangle size={14} />
                      {duplicateFiles.length} 重复
                    </span>
                  )}
                  {errorFiles.length > 0 && (
                    <span className="stat error">
                      <X size={14} />
                      {errorFiles.length} 失败
                    </span>
                  )}
                </div>
              </div>
              
              <div className="file-list" style={{ maxHeight: 250, overflow: 'auto' }}>
                {files.map(file => (
                  <div key={file.id} className={`file-item ${file.status}`} style={{
                    opacity: file.status === 'duplicate' ? 0.6 : 1,
                    background: file.status === 'duplicate' ? '#fff3cd' : undefined
                  }}>
                    <div className="file-icon">
                      <FileText size={20} />
                    </div>
                    <div className="file-info" style={{ flex: 1 }}>
                      <span className="file-name">{file.file.name}</span>
                      {file.relativePath && file.relativePath !== file.file.name && (
                        <span style={{
                          display: 'block',
                          fontSize: '11px',
                          color: 'var(--text-muted)',
                          marginTop: '2px'
                        }}>
                          📁 {file.relativePath}
                        </span>
                      )}
                      <span className="file-size">
                        {formatFileSize(file.file.size)}
                        {file.status === 'duplicate' && file.duplicateInfo && (
                          <span style={{ color: '#856404', marginLeft: 8 }}>
                            → 与《{file.duplicateInfo.existing_book_title}》重复
                          </span>
                        )}
                      </span>
                    </div>
                    <div className="file-actions">
                      {file.status === 'pending' && !isUploading && !isChecking && (
                        <button
                          className="remove-btn"
                          onClick={() => removeFile(file.id)}
                        >
                          <X size={16} />
                        </button>
                      )}
                      {file.status === 'checking' && (
                        <Loader size={16} className="spinning" />
                      )}
                      {file.status === 'uploading' && (
                        <Loader size={16} className="spinning" />
                      )}
                      {file.status === 'success' && (
                        <Check size={16} className="success-icon" />
                      )}
                      {file.status === 'error' && (
                        <span className="error-text" title={file.error}>
                          失败
                        </span>
                      )}
                      {file.status === 'duplicate' && (
                        <AlertCircle size={16} color="#856404" />
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {(isUploading || isChecking) && (
            <div className="upload-progress">
              <div className="progress-bar">
                <div 
                  className="progress-fill" 
                  style={{ width: `${uploadProgress}%` }}
                />
              </div>
              <span className="progress-text">
                {isChecking ? '检测重复中...' : '上传中...'} {Math.round(uploadProgress)}%
              </span>
            </div>
          )}
        </div>

        <div className="modal-footer">
          <button
            className="btn btn-secondary"
            onClick={onClose}
            disabled={isUploading || isChecking}
          >
            取消
          </button>
          <button
            className="btn btn-primary"
            onClick={handleUpload}
            disabled={isUploading || isChecking || pendingFiles.length === 0}
          >
            {isChecking ? (
              <>
                <Loader size={14} className="spinning" style={{ marginRight: 4 }} />
                检测重复中...
              </>
            ) : isUploading ? (
              '上传中...'
            ) : duplicateFiles.length > 0 ? (
              `上传 ${pendingFiles.length} 本（跳过 ${duplicateFiles.length} 本重复）`
            ) : (
              `上传 ${pendingFiles.length} 个文件`
            )}
          </button>
        </div>

        {showDuplicateDialog && duplicateCheckResult && (
          <div className="modal-overlay" style={{ zIndex: 1001 }} onClick={e => e.stopPropagation()}>
            <div style={{ 
              background: 'white', 
              borderRadius: 12, 
              padding: 24, 
              maxWidth: 500,
              width: '90%',
              boxShadow: '0 20px 60px rgba(0,0,0,0.3)'
            }} onClick={e => e.stopPropagation()}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
                <AlertTriangle size={24} color="#ffc107" />
                <h3 style={{ margin: 0 }}>发现重复书籍</h3>
              </div>
              
              <p style={{ color: '#666', marginBottom: 16 }}>
                在待上传的 {duplicateCheckResult.total_files} 本书中，检测到 {duplicateCheckResult.duplicate_files.length} 本与已归档书籍重复。
              </p>

              <div style={{ 
                background: '#f8f9fa', 
                borderRadius: 8, 
                padding: 12, 
                marginBottom: 16,
                maxHeight: 200,
                overflow: 'auto'
              }}>
                {duplicateCheckResult.duplicate_files.map((dup, i) => (
                  <div key={i} style={{ 
                    padding: '8px 0', 
                    borderBottom: i < duplicateCheckResult.duplicate_files.length - 1 ? '1px solid #e9ecef' : 'none'
                  }}>
                    <div style={{ fontWeight: 500 }}>{dup.filename}</div>
                    <div style={{ fontSize: 12, color: '#666', marginTop: 2 }}>
                      与已归档的《{dup.existing_book_title}》
                      {dup.duplicate_type === 'exact' && ' 完全相同'}
                      {dup.duplicate_type === 'content' && ' 内容相似'}
                    </div>
                  </div>
                ))}
              </div>

              <div style={{ 
                background: '#d4edda', 
                padding: 12, 
                borderRadius: 8, 
                marginBottom: 16,
                fontSize: 14
              }}>
                <Check size={16} style={{ verticalAlign: 'middle', marginRight: 4 }} />
                将上传 {duplicateCheckResult.unique_files.length} 本非重复书籍
              </div>

              <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
                <button 
                  className="btn btn-secondary"
                  onClick={() => setShowDuplicateDialog(false)}
                >
                  取消
                </button>
                <button 
                  className="btn btn-primary"
                  onClick={handleForceUpload}
                >
                  继续上传 {duplicateCheckResult.unique_files.length} 本
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default BatchUploadModal;
