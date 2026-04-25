import { Cloud, X, CheckCircle, XCircle, Copy, ExternalLink } from 'lucide-react';
import LoadingBook from './LoadingBook';
import { QuarkUploadResult, QuarkUploadProgress } from '../hooks/useQuarkUpload';
import { BookDocument } from '../types';

interface QuarkUploadModalProps {
  show?: boolean;
  isOpen?: boolean;
  uploading?: boolean;
  results?: QuarkUploadResult[];
  progress?: QuarkUploadProgress | null;
  onClose: () => void;
  onUpload?: () => void;
  onCopyShareUrl?: (url: string, password?: string) => void;
  onCopyAllShareUrls?: () => void;
  selectedTag?: string | null;
  displayBooks?: BookDocument[];
}

function QuarkUploadModal({
  show,
  isOpen,
  uploading: externalUploading,
  results: externalResults,
  progress: externalProgress,
  onClose,
  onUpload: externalOnUpload,
  onCopyShareUrl: externalOnCopyShareUrl,
  onCopyAllShareUrls: externalOnCopyAllShareUrls,
  selectedTag,
  displayBooks,
}: QuarkUploadModalProps) {
  const visible = show ?? isOpen ?? false;
  if (!visible) return null;

  const hasExternalState = externalUploading !== undefined || externalResults !== undefined;
  
  const uploading = hasExternalState ? externalUploading! : false;
  const results = hasExternalState ? externalResults! : [];
  const progress = hasExternalState ? externalProgress : null;

  const handleCopyShareUrl = (url: string, password?: string) => {
    if (externalOnCopyShareUrl) {
      externalOnCopyShareUrl(url, password);
    } else {
      const text = password ? `${url} 提取码: ${password}` : url;
      navigator.clipboard.writeText(text);
    }
  };

  const handleCopyAllShareUrls = () => {
    if (externalOnCopyAllShareUrls) {
      externalOnCopyAllShareUrls();
    } else {
      const successfulResults = results.filter(r => r.success && r.share_url);
      if (successfulResults.length === 0) {
        alert('没有可复制的链接');
        return;
      }
      const text = successfulResults.map(result => {
        const passwordText = result.share_password ? ` 提取码: ${result.share_password}` : '';
        return `${result.book_title}：${result.share_url}${passwordText}`;
      }).join('\n');
      navigator.clipboard.writeText(text).then(() => {
        alert(`已复制 ${successfulResults.length} 个链接到剪贴板`);
      });
    }
  };

  const handleUpload = () => {
    if (externalOnUpload) {
      externalOnUpload();
    }
  };

  const getUploadInfo = () => {
    if (selectedTag && displayBooks) {
      const count = displayBooks.filter(b => !b.quark_upload_status || b.quark_upload_status === 'not_uploaded').length;
      return {
        description: `将"${selectedTag}"标签下的书籍上传到夸克网盘，按标签分类存储。`,
        count
      };
    }
    return {
      description: '将所有书籍上传到夸克网盘，按标签分类存储。',
      count: null
    };
  };

  const info = getUploadInfo();

  return (
    <div className="modal-overlay" onClick={() => !uploading && onClose()}>
      <div className="quark-modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 600, maxHeight: '80vh', overflow: 'auto' }}>
        <div className="modal-header">
          <h3>
            <Cloud size={18} />
            上传到夸克网盘
          </h3>
          <button className="close-btn" onClick={() => !uploading && onClose()} disabled={uploading}>
            <X size={20} />
          </button>
        </div>

        <div className="modal-body">
          {progress ? (
            <div className="quark-progress-container">
              <div className="quark-progress-header">
                <LoadingBook size={20} />
                <span>正在上传中...</span>
              </div>
              
              <div className="quark-progress-bar-wrapper">
                <div className="quark-progress-bar">
                  <div 
                    className="quark-progress-fill"
                    style={{ width: `${progress.percentage}%` }}
                  />
                </div>
                <span className="quark-progress-percentage">{progress.percentage}%</span>
              </div>
              
              <div className="quark-progress-details">
                <div className="quark-progress-item">
                  <span className="quark-progress-label">当前标签：</span>
                  <span className="quark-progress-value">{progress.currentTag}</span>
                </div>
                <div className="quark-progress-item">
                  <span className="quark-progress-label">进度：</span>
                  <span className="quark-progress-value">{progress.current} / {progress.total}</span>
                </div>
                <div className="quark-progress-item">
                  <span className="quark-progress-label">已用时间：</span>
                  <span className="quark-progress-value">
                    {Math.floor((Date.now() - progress.startTime) / 1000)}秒
                  </span>
                </div>
              </div>
            </div>
          ) : results.length === 0 ? (
            <>
              <div className="quark-upload-info" style={{ marginBottom: 16 }}>
                <p style={{ margin: '0 0 8px 0', color: '#666' }}>
                  {info.description}
                </p>
                {info.count !== null && (
                  <p style={{ margin: 0, color: '#666' }}>
                    将上传 {info.count} 本未上传的书籍
                  </p>
                )}
              </div>

              <div style={{ background: '#f8f9fa', padding: 12, borderRadius: 8, marginBottom: 16 }}>
                <h4 style={{ margin: '0 0 8px 0', fontSize: 14 }}>上传说明：</h4>
                <ul style={{ margin: 0, paddingLeft: 20, fontSize: 13, color: '#666' }}>
                  <li>书籍将按标签分类到「我的电子图书馆/标签名」文件夹</li>
                  <li>每个标签文件夹会生成一个分享链接</li>
                  <li>相同标签的书籍共享同一个文件夹链接</li>
                </ul>
              </div>
            </>
          ) : (
            <div className="quark-upload-results">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <h4 style={{ margin: 0, fontSize: 14 }}>上传结果：</h4>
                {results.filter(r => r.success && r.share_url).length > 0 && (
                  <button
                    className="btn btn-primary"
                    style={{ padding: '6px 12px', fontSize: 12, display: 'flex', alignItems: 'center', gap: 4 }}
                    onClick={handleCopyAllShareUrls}
                  >
                    <Copy size={14} />
                    一键复制所有链接
                  </button>
                )}
              </div>
              {results.map((result, index) => (
                <div 
                  key={index}
                  style={{ 
                    padding: 12, 
                    marginBottom: 8, 
                    borderRadius: 8,
                    background: result.success ? '#d4edda' : '#f8d7da',
                    border: `1px solid ${result.success ? '#c3e6cb' : '#f5c6cb'}`
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                    {result.success ? (
                      <CheckCircle size={16} color="#155724" />
                    ) : (
                      <XCircle size={16} color="#721c24" />
                    )}
                    <span style={{ fontWeight: 500, color: result.success ? '#155724' : '#721c24' }}>
                      {result.book_title}
                    </span>
                  </div>
                  
                  {result.success && result.share_url && (
                    <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      <a 
                        href={result.share_url} 
                        target="_blank" 
                        rel="noopener noreferrer"
                        style={{ color: '#0066cc', fontSize: 12 }}
                      >
                        {result.share_url}
                        <ExternalLink size={10} style={{ marginLeft: 4, verticalAlign: 'middle' }} />
                      </a>
                      {result.share_password && (
                        <span style={{ fontSize: 12, color: '#666' }}>
                          提取码: {result.share_password}
                        </span>
                      )}
                      <button
                        className="btn btn-secondary"
                        style={{ padding: '2px 8px', fontSize: 11 }}
                        onClick={() => handleCopyShareUrl(result.share_url!, result.share_password)}
                      >
                        <Copy size={12} />
                        复制
                      </button>
                    </div>
                  )}
                  
                  {!result.success && (
                    <div style={{ fontSize: 12, color: '#721c24', marginTop: 4 }}>
                      {result.message}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="modal-footer">
          <button 
            className="btn btn-secondary" 
            onClick={onClose}
            disabled={uploading}
          >
            {results.length > 0 ? '关闭' : '取消'}
          </button>
          {results.length === 0 && externalOnUpload && (
            <button 
              className="btn btn-primary" 
              onClick={handleUpload}
              disabled={uploading}
            >
              {uploading ? (
                <>
                  <LoadingBook size={14} />
                  上传中...
                </>
              ) : (
                <>
                  <Cloud size={14} style={{ marginRight: 4 }} />
                  开始上传
                </>
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export default QuarkUploadModal;
