import React, { useState, useEffect } from 'react';
import { duplicateApi } from '../api';
import { 
  Copy, AlertTriangle, CheckCircle, Loader2, 
  Trash2, RefreshCw, FileText, Hash, ChevronDown, ChevronUp
} from 'lucide-react';

interface DuplicateGroup {
  group_id: string;
  books: Array<{
    id: string;
    title: string;
    author: string | null;
    file_path: string;
    file_size?: number | null;
    is_primary: number;
    duplicate_status?: string;
  }>;
  primary_book_id: string;
}

interface DuplicateManagerProps {
  onClose?: () => void;
}

const DuplicateManager: React.FC<DuplicateManagerProps> = () => {
  const [loading, setLoading] = useState(false);
  const [computing, setComputing] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [groups, setGroups] = useState<DuplicateGroup[]>([]);
  const [stats, setStats] = useState({
    total_scanned: 0,
    exact_duplicates: 0,
    content_duplicates: 0,
    metadata_duplicates: 0
  });
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const [processing, setProcessing] = useState<string | null>(null);

  useEffect(() => {
    loadGroups();
  }, []);

  const loadGroups = async () => {
    setLoading(true);
    try {
      const response = await duplicateApi.getDuplicateGroups();
      setGroups(response.data.groups);
    } catch (error) {
      console.error('Failed to load duplicate groups:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleComputeHashes = async () => {
    setComputing(true);
    try {
      const response = await duplicateApi.computeHashes();
      alert(`哈希计算完成！\n处理了 ${response.data.processed}/${response.data.total} 本书\n错误: ${response.data.errors.length}`);
      loadGroups();
    } catch (error) {
      console.error('Failed to compute hashes:', error);
      alert('哈希计算失败');
    } finally {
      setComputing(false);
    }
  };

  const handleScanDuplicates = async () => {
    setScanning(true);
    try {
      const response = await duplicateApi.scanDuplicates();
      setStats({
        total_scanned: response.data.total_scanned,
        exact_duplicates: response.data.exact_duplicates,
        content_duplicates: response.data.content_duplicates,
        metadata_duplicates: response.data.metadata_duplicates
      });
      setGroups(response.data.duplicate_groups);
      alert(`扫描完成！\n总计: ${response.data.total_scanned} 本\n完全重复: ${response.data.exact_duplicates} 本\n内容重复: ${response.data.content_duplicates} 本`);
    } catch (error) {
      console.error('Failed to scan duplicates:', error);
      alert('扫描失败');
    } finally {
      setScanning(false);
    }
  };

  const handleResolveDuplicate = async (groupId: string, primaryBookId: string, duplicateBookIds: string[]) => {
    if (!window.confirm('确定要将这些书籍标记为重复吗？主书籍将保留，其他书籍将标记为重复。')) {
      return;
    }

    setProcessing(groupId);
    try {
      await duplicateApi.resolveDuplicate(primaryBookId, duplicateBookIds);
      alert('重复处理成功！');
      loadGroups();
    } catch (error) {
      console.error('Failed to resolve duplicate:', error);
      alert('处理失败');
    } finally {
      setProcessing(null);
    }
  };

  const handleDeleteBook = async (bookId: string, bookTitle: string, deleteFile: boolean) => {
    const message = deleteFile 
      ? `确定要删除书籍"${bookTitle}"及其文件吗？此操作不可恢复！`
      : `确定要删除书籍"${bookTitle}"吗？文件将保留。`;
    
    if (!window.confirm(message)) {
      return;
    }

    setProcessing(bookId);
    try {
      await duplicateApi.deleteBook(bookId, deleteFile);
      alert('删除成功！');
      loadGroups();
    } catch (error) {
      console.error('Failed to delete book:', error);
      alert('删除失败');
    } finally {
      setProcessing(null);
    }
  };

  const toggleGroup = (groupId: string) => {
    const newExpanded = new Set(expandedGroups);
    if (newExpanded.has(groupId)) {
      newExpanded.delete(groupId);
    } else {
      newExpanded.add(groupId);
    }
    setExpandedGroups(newExpanded);
  };

  const formatFileSize = (bytes: number | null) => {
    if (!bytes) return '未知';
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  };

  return (
    <div className="duplicate-manager" style={{ padding: 20 }}>
      <div className="duplicate-header" style={{ marginBottom: 20 }}>
        <h2 style={{ margin: '0 0 16px 0', display: 'flex', alignItems: 'center', gap: 8 }}>
          <Copy size={24} />
          重复书籍管理
        </h2>
        
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <button 
            className="btn btn-primary" 
            onClick={handleComputeHashes}
            disabled={computing || scanning}
          >
            {computing ? (
              <>
                <Loader2 size={14} className="spinning" style={{ marginRight: 4 }} />
                计算哈希中...
              </>
            ) : (
              <>
                <Hash size={14} style={{ marginRight: 4 }} />
                计算文件哈希
              </>
            )}
          </button>
          
          <button 
            className="btn btn-secondary" 
            onClick={handleScanDuplicates}
            disabled={computing || scanning}
          >
            {scanning ? (
              <>
                <Loader2 size={14} className="spinning" style={{ marginRight: 4 }} />
                扫描中...
              </>
            ) : (
              <>
                <RefreshCw size={14} style={{ marginRight: 4 }} />
                扫描重复
              </>
            )}
          </button>
        </div>
      </div>

      {stats.total_scanned > 0 && (
        <div style={{ 
          background: '#f8f9fa', 
          padding: 16, 
          borderRadius: 8, 
          marginBottom: 20,
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
          gap: 12
        }}>
          <div>
            <div style={{ fontSize: 12, color: '#666' }}>扫描总数</div>
            <div style={{ fontSize: 20, fontWeight: 'bold' }}>{stats.total_scanned}</div>
          </div>
          <div>
            <div style={{ fontSize: 12, color: '#666' }}>完全重复</div>
            <div style={{ fontSize: 20, fontWeight: 'bold', color: '#dc3545' }}>{stats.exact_duplicates}</div>
          </div>
          <div>
            <div style={{ fontSize: 12, color: '#666' }}>内容重复</div>
            <div style={{ fontSize: 20, fontWeight: 'bold', color: '#fd7e14' }}>{stats.content_duplicates}</div>
          </div>
          <div>
            <div style={{ fontSize: 12, color: '#666' }}>元数据重复</div>
            <div style={{ fontSize: 20, fontWeight: 'bold', color: '#ffc107' }}>{stats.metadata_duplicates}</div>
          </div>
        </div>
      )}

      <div className="duplicate-groups">
        {loading ? (
          <div style={{ textAlign: 'center', padding: 40 }}>
            <Loader2 size={32} className="spinning" />
            <p>加载中...</p>
          </div>
        ) : groups.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 40, color: '#666' }}>
            <CheckCircle size={48} style={{ marginBottom: 16, color: '#28a745' }} />
            <p>没有发现重复书籍</p>
            <p style={{ fontSize: 12 }}>点击"计算文件哈希"然后"扫描重复"来检测重复书籍</p>
          </div>
        ) : (
          groups.map(group => (
            <div 
              key={group.group_id} 
              style={{ 
                border: '1px solid #e9ecef', 
                borderRadius: 8, 
                marginBottom: 12,
                overflow: 'hidden'
              }}
            >
              <div 
                style={{ 
                  padding: '12px 16px',
                  background: '#f8f9fa',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  cursor: 'pointer'
                }}
                onClick={() => toggleGroup(group.group_id)}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <AlertTriangle size={16} color="#fd7e14" />
                  <span style={{ fontWeight: 500 }}>
                    重复组 ({group.books.length} 本书籍)
                  </span>
                </div>
                {expandedGroups.has(group.group_id) ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
              </div>
              
              {expandedGroups.has(group.group_id) && (
                <div style={{ padding: 16 }}>
                  {group.books.map(book => (
                    <div 
                      key={book.id}
                      style={{ 
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '12px',
                        marginBottom: 8,
                        background: book.is_primary ? '#d4edda' : '#fff3cd',
                        borderRadius: 4,
                        border: `1px solid ${book.is_primary ? '#c3e6cb' : '#ffc107'}`
                      }}
                    >
                      <div style={{ flex: 1 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <FileText size={16} />
                          <span style={{ fontWeight: 500 }}>{book.title}</span>
                          {book.is_primary === 1 && (
                            <span style={{ 
                              fontSize: 10, 
                              background: '#28a745', 
                              color: 'white', 
                              padding: '2px 6px', 
                              borderRadius: 4 
                            }}>
                              主版本
                            </span>
                          )}
                        </div>
                        <div style={{ fontSize: 12, color: '#666', marginTop: 4 }}>
                          {book.author && <span>作者: {book.author} | </span>}
                          <span>大小: {formatFileSize(book.file_size ?? null)}</span>
                        </div>
                        <div style={{ fontSize: 11, color: '#999', marginTop: 2 }}>
                          {book.file_path}
                        </div>
                      </div>
                      
                      <div style={{ display: 'flex', gap: 8 }}>
                        {book.is_primary !== 1 && (
                          <>
                            <button
                              className="btn btn-secondary"
                              style={{ padding: '4px 8px', fontSize: 12 }}
                              onClick={() => handleResolveDuplicate(
                                group.group_id, 
                                book.id, 
                                group.books.filter(b => b.id !== book.id).map(b => b.id)
                              )}
                              disabled={processing === group.group_id}
                            >
                              设为主版本
                            </button>
                            <button
                              className="btn btn-secondary"
                              style={{ padding: '4px 8px', fontSize: 12 }}
                              onClick={() => handleDeleteBook(book.id, book.title, false)}
                              disabled={processing === book.id}
                            >
                              <Trash2 size={12} />
                            </button>
                            <button
                              className="btn btn-danger"
                              style={{ padding: '4px 8px', fontSize: 12, background: '#dc3545', color: 'white' }}
                              onClick={() => handleDeleteBook(book.id, book.title, true)}
                              disabled={processing === book.id}
                            >
                              <Trash2 size={12} /> 删除文件
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))
        )}
      </div>

      <div style={{ 
        marginTop: 20, 
        padding: 16, 
        background: '#e7f3ff', 
        borderRadius: 8,
        fontSize: 13,
        color: '#0066cc'
      }}>
        <h4 style={{ margin: '0 0 8px 0' }}>重复检测说明</h4>
        <ul style={{ margin: 0, paddingLeft: 20 }}>
          <li><strong>完全重复</strong>：文件哈希完全相同，文件内容完全一致</li>
          <li><strong>内容重复</strong>：内容指纹相似，可能是同一本书的不同版本</li>
          <li><strong>元数据重复</strong>：标题/作者相似，需要人工确认</li>
        </ul>
        <p style={{ margin: '8px 0 0 0' }}>
          建议：先点击"计算文件哈希"为所有书籍生成哈希值，然后点击"扫描重复"检测重复。
        </p>
      </div>
    </div>
  );
};

export default DuplicateManager;
