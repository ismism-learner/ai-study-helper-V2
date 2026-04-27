import React, { useState } from 'react';
import { bookApi } from '../api';
import { X, Upload, FileText, FolderOpen } from 'lucide-react';
import LoadingBook from './LoadingBook';

interface BookUploadModalProps {
  onClose: () => void;
  onSuccess: () => void;
}

const BookUploadModal: React.FC<BookUploadModalProps> = ({ onClose, onSuccess }) => {
  const [files, setFiles] = useState<File[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);

  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = Array.from(e.target.files || []);
    const pdfFiles = selectedFiles.filter(f => f.type === 'application/pdf' || f.name.endsWith('.pdf'));

    if (pdfFiles.length !== selectedFiles.length) {
      alert('只支持 PDF 文件');
    }

    setFiles(pdfFiles);
  };

  const handleFolderSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const selectedFiles = Array.from(e.target.files);
      const pdfFiles = selectedFiles.filter(f => f.type === 'application/pdf' || f.name.endsWith('.pdf'));

      if (pdfFiles.length === 0) {
        alert('所选文件夹中没有 PDF 文件');
        return;
      }

      setFiles(pdfFiles);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);

    const droppedFiles = Array.from(e.dataTransfer.files);
    const pdfFiles = droppedFiles.filter(f => f.type === 'application/pdf');

    if (pdfFiles.length !== droppedFiles.length) {
      alert('只支持 PDF 文件');
    }

    setFiles(pdfFiles);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(true);
  };

  const handleDragLeave = () => {
    setDragOver(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (files.length === 0) {
      alert('请选择要上传的文件');
      return;
    }

    setIsUploading(true);

    try {
      if (files.length === 1) {
        const fileName = files[0].name.replace(/\.pdf$/i, '');
        await bookApi.upload({
          file: files[0],
          title: fileName,
        });
      } else {
        await bookApi.uploadBatch(files, undefined);
      }

      onSuccess();
    } catch (error: any) {
      console.error('Upload failed:', error);
      const errorMsg = error.response?.data?.detail || error.message || '上传失败，请重试';
      alert(`上传失败: ${errorMsg}`);
    } finally {
      setIsUploading(false);
    }
  };

  const removeFile = (index: number) => {
    setFiles(files.filter((_, i) => i !== index));
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content book-upload-modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2>
            <Upload size={20} />
            上传书籍
          </h2>
          <button className="close-btn" onClick={onClose}>
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="modal-body">
            <div
              className={`file-drop-zone ${dragOver ? 'drag-over' : ''}`}
              onDrop={handleDrop}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
            >
              {files.length === 0 ? (
                <div className="drop-zone-content">
                  <FileText size={48} strokeWidth={1} />
                  <p>拖拽 PDF 文件到此处，或点击选择文件</p>
                  <span className="hint">支持单个或批量上传</span>
                  <div style={{ display: 'flex', gap: 8, justifyContent: 'center', marginTop: 12 }}>
                    <label className="file-select-btn" onClick={(e) => e.stopPropagation()}>
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept=".pdf"
                        multiple
                        onChange={handleFileSelect}
                        style={{ display: 'none' }}
                      />
                      选择文件
                    </label>
                    <label className="file-select-btn" style={{ background: 'var(--success-500)', borderColor: 'var(--success-500)' }} onClick={(e) => e.stopPropagation()}>
                      <input
                        type="file"
                        // @ts-expect-error webkitdirectory is not in the type definition
                        webkitdirectory=""
                        onChange={handleFolderSelect}
                        style={{ display: 'none' }}
                      />
                      <FolderOpen size={14} style={{ marginRight: 4 }} />
                      选择文件夹
                    </label>
                  </div>
                </div>
              ) : (
                <div className="selected-files">
                  <p className="files-header">已选择 {files.length} 个文件</p>
                  <div className="files-list">
                    {files.map((file, index) => (
                      <div key={index} className="file-item">
                        <FileText size={16} />
                        <span className="file-name">{file.name}</span>
                        <span className="file-size">{formatFileSize(file.size)}</span>
                        <button
                          type="button"
                          className="remove-file-btn"
                          onClick={(e) => {
                            e.stopPropagation();
                            removeFile(index);
                          }}
                        >
                          <X size={14} />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {files.length > 1 && (
              <div className="batch-info">
                <p>批量上传模式：将使用文件名作为书籍标题</p>
                <p>上传后可在书籍详情页编辑其他信息</p>
              </div>
            )}
          </div>

          <div className="modal-footer">
            <button type="button" className="btn btn-secondary" onClick={onClose}>
              取消
            </button>
            <button
              type="submit"
              className="btn btn-primary"
              disabled={files.length === 0 || isUploading}
            >
              {isUploading ? (
                <>
                  <LoadingBook size={16} />
                  上传中...
                </>
              ) : (
                <>
                  <Upload size={16} />
                  上传 {files.length > 0 ? `(${files.length} 本)` : ''}
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default BookUploadModal;
