import React, { useState, useEffect } from 'react';
import { documentSourceApi } from '../api';
import { RefreshCw, FolderOpen, Book, FileText, AlertCircle, Settings, Edit2, Save, X } from 'lucide-react';

interface Source {
  id: string;
  name: string;
  type: string;
  path: string;
  enabled: boolean;
  file_extensions: string[];
  auto_sync_on_startup: boolean;
}

interface SyncResult {
  total_scanned: number;
  books_added: number;
  books_existing: number;
  documents_added: number;
  documents_existing: number;
  errors: string[];
  sources: Array<{
    id: string;
    name: string;
    type: string;
    result: {
      scanned: number;
      books_added: number;
      books_existing: number;
      documents_added: number;
      documents_existing: number;
      errors: string[];
    };
  }>;
}

interface DocumentSourceManagerProps {
  onSyncComplete?: () => void;
}

const DocumentSourceManager: React.FC<DocumentSourceManagerProps> = ({ onSyncComplete }) => {
  const [sources, setSources] = useState<Source[]>([]);
  const [syncSettings, setSyncSettings] = useState({
    sync_on_startup: true,
    remove_orphans: false,
    update_existing: false,
  });
  const [isLoading, setIsLoading] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastSyncResult, setLastSyncResult] = useState<SyncResult | null>(null);
  const [editingSource, setEditingSource] = useState<string | null>(null);
  const [editPath, setEditPath] = useState('');

  useEffect(() => {
    loadSources();
  }, []);

  const loadSources = async () => {
    setIsLoading(true);
    try {
      const response = await documentSourceApi.list();
      setSources(response.data.sources);
      setSyncSettings(response.data.sync_settings);
    } catch (error) {
      console.error('Failed to load sources:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSync = async () => {
    setIsSyncing(true);
    setLastSyncResult(null);
    try {
      const response = await documentSourceApi.sync();
      setLastSyncResult(response.data);
      if (onSyncComplete) {
        onSyncComplete();
      }
    } catch (error) {
      console.error('Sync failed:', error);
    } finally {
      setIsSyncing(false);
    }
  };

  const handleToggleEnabled = async (sourceId: string, enabled: boolean) => {
    try {
      await documentSourceApi.update(sourceId, { enabled });
      setSources(sources.map(s => s.id === sourceId ? { ...s, enabled } : s));
    } catch (error) {
      console.error('Failed to update source:', error);
    }
  };

  const handleEditPath = (source: Source) => {
    setEditingSource(source.id);
    setEditPath(source.path);
  };

  const handleSavePath = async (sourceId: string) => {
    try {
      await documentSourceApi.update(sourceId, { path: editPath });
      setSources(sources.map(s => s.id === sourceId ? { ...s, path: editPath } : s));
      setEditingSource(null);
    } catch (error) {
      console.error('Failed to update path:', error);
    }
  };

  const handleCancelEdit = () => {
    setEditingSource(null);
    setEditPath('');
  };

  const getTypeIcon = (type: string) => {
    return type === 'book' ? <Book size={18} /> : <FileText size={18} />;
  };

  return (
    <div className="document-source-manager">
      <div className="manager-header">
        <div className="header-title">
          <Settings size={24} />
          <h2>文档源管理</h2>
        </div>
        <p className="header-desc">
          配置固定的文档路径，系统启动时会自动同步这些路径下的文档到数据库
        </p>
      </div>

      <div className="sync-section">
        <div className="sync-actions">
          <button
            className="btn btn-primary sync-btn"
            onClick={handleSync}
            disabled={isSyncing}
          >
            {isSyncing ? (
              <>
                <RefreshCw size={16} className="spin" />
                同步中...
              </>
            ) : (
              <>
                <RefreshCw size={16} />
                立即同步所有源
              </>
            )}
          </button>
          <span className="sync-hint">
            自动同步: {syncSettings.sync_on_startup ? '已开启' : '已关闭'}
            (系统启动时自动同步)
          </span>
        </div>

        {lastSyncResult && (
          <div className="sync-result">
            <h4>同步结果</h4>
            <div className="result-stats">
              <div className="stat-item">
                <span className="stat-value">{lastSyncResult.total_scanned}</span>
                <span className="stat-label">扫描文件</span>
              </div>
              <div className="stat-item success">
                <span className="stat-value">{lastSyncResult.books_added}</span>
                <span className="stat-label">新增书籍</span>
              </div>
              <div className="stat-item success">
                <span className="stat-value">{lastSyncResult.documents_added}</span>
                <span className="stat-label">新增文档</span>
              </div>
              <div className="stat-item">
                <span className="stat-value">{lastSyncResult.books_existing}</span>
                <span className="stat-label">已存在书籍</span>
              </div>
              <div className="stat-item">
                <span className="stat-value">{lastSyncResult.documents_existing}</span>
                <span className="stat-label">已存在文档</span>
              </div>
            </div>
            {lastSyncResult.errors.length > 0 && (
              <div className="sync-errors">
                <h5><AlertCircle size={14} /> 错误</h5>
                <ul>
                  {lastSyncResult.errors.slice(0, 5).map((err, i) => (
                    <li key={i}>{err}</li>
                  ))}
                  {lastSyncResult.errors.length > 5 && (
                    <li>...还有 {lastSyncResult.errors.length - 5} 个错误</li>
                  )}
                </ul>
              </div>
            )}
          </div>
        )}
      </div>

      <div className="sources-list">
        <h3>配置的文档源</h3>
        {isLoading ? (
          <div className="loading">加载中...</div>
        ) : (
          <div className="source-items">
            {sources.map(source => (
              <div key={source.id} className={`source-item ${source.enabled ? 'enabled' : 'disabled'}`}>
                <div className="source-icon">
                  {getTypeIcon(source.type)}
                </div>
                <div className="source-info">
                  <div className="source-name">{source.name}</div>
                  <div className="source-type">
                    类型: {source.type === 'book' ? '书籍' : '文档'}
                    {' | '}
                    格式: {source.file_extensions.join(', ')}
                  </div>
                  {editingSource === source.id ? (
                    <div className="path-edit">
                      <input
                        type="text"
                        value={editPath}
                        onChange={(e) => setEditPath(e.target.value)}
                        placeholder="输入路径..."
                      />
                      <button className="btn-icon" onClick={() => handleSavePath(source.id)}>
                        <Save size={14} />
                      </button>
                      <button className="btn-icon" onClick={handleCancelEdit}>
                        <X size={14} />
                      </button>
                    </div>
                  ) : (
                    <div className="source-path">
                      <FolderOpen size={12} />
                      <span>{source.path || '(未设置路径)'}</span>
                      <button className="btn-icon" onClick={() => handleEditPath(source)}>
                        <Edit2 size={12} />
                      </button>
                    </div>
                  )}
                </div>
                <div className="source-actions">
                  <label className="toggle">
                    <input
                      type="checkbox"
                      checked={source.enabled}
                      onChange={(e) => handleToggleEnabled(source.id, e.target.checked)}
                    />
                    <span className="toggle-label">{source.enabled ? '启用' : '禁用'}</span>
                  </label>
                  {source.auto_sync_on_startup && (
                    <span className="badge">启动同步</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="help-section">
        <h4>使用说明</h4>
        <ul>
          <li><strong>自动同步</strong>: 系统启动时会自动扫描启用的文档源并同步到数据库</li>
          <li><strong>手动同步</strong>: 点击"立即同步所有源"按钮手动触发同步</li>
          <li><strong>路径设置</strong>: 可以设置绝对路径或相对于 backend 目录的相对路径</li>
          <li><strong>文件格式</strong>: 每个源只同步指定扩展名的文件</li>
        </ul>
      </div>
    </div>
  );
};

export default DocumentSourceManager;
