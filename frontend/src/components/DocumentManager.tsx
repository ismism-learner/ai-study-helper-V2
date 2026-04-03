import React, { useState, useEffect, useCallback } from 'react';
import { Document, Folder, Country, TimePeriod } from '../types';
import { documentApi, folderApi, countryApi, timePeriodApi } from '../api';
import BatchRegeneratePanel from './BatchRegeneratePanel';
import BatchTimelineGeneratePanel from './BatchTimelineGeneratePanel';
import { 
  FileText, 
  Folder as FolderIcon,
  FolderOpen,
  ChevronRight,
  ChevronDown,
  Search, 
  Trash2, 
  Edit2, 
  X,
  ArrowLeft,
  CheckSquare,
  Square,
  Link as LinkIcon,
  Save,
  BookOpen,
  User,
  Tag,
  Calendar,
  Globe,
  PlusCircle,
  XCircle,
  RefreshCw
} from 'lucide-react';

interface DocumentManagerProps {
  onBack?: () => void;
  onDocumentClick?: (doc: Document) => void;
}

interface TreeFolder {
  id: string;
  name: string;
  parent_id: string | null;
  created_at: string;
  updated_at: string;
  document_count: number;
  children: TreeFolder[];
  isExpanded?: boolean;
}

interface DocumentWithFolder extends Document {
  folderPath?: string;
}

const DocumentManager: React.FC<DocumentManagerProps> = ({ 
  onBack
}) => {
  const [folders, setFolders] = useState<TreeFolder[]>([]);
  const [documents, setDocuments] = useState<DocumentWithFolder[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);
  const [selectedDocs, setSelectedDocs] = useState<Set<string>>(new Set());
  const [showBulkEdit, setShowBulkEdit] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [editingDoc, setEditingDoc] = useState<Document | null>(null);

  // 批量编辑表单
  const [bulkEditForm, setBulkEditForm] = useState({
    tags: '',
    author: '',
    archive_status: '',
    addTags: '',
    removeTags: '',
    content_country_id: ''
  });

  // 单个编辑表单
  const [editForm, setEditForm] = useState({
    title: '',
    tags: '',
    author: '',
    external_link: '',
    content_country_id: '',
    content_year_start: '',
    content_year_end: ''
  });

  // 国家和标签数据
  const [countries, setCountries] = useState<Country[]>([]);
  const [allTags, setAllTags] = useState<string[]>([]);
  const [showTagInput, setShowTagInput] = useState(false);
  const [newTag, setNewTag] = useState('');
  const [timePeriods, setTimePeriods] = useState<TimePeriod[]>([]);
  const [showBatchRegenerate, setShowBatchRegenerate] = useState(false);
  const [showBatchTimeline, setShowBatchTimeline] = useState(false);

  const fetchFolders = useCallback(async () => {
    try {
      const response = await folderApi.list();
      console.log('Fetched folders:', response.data);
      const folderTree = buildFolderTree(response.data);
      console.log('Built folder tree:', folderTree);
      setFolders(folderTree);
    } catch (error) {
      console.error('Failed to fetch folders:', error);
    }
  }, []);

  const fetchCountries = useCallback(async () => {
    try {
      const response = await countryApi.list();
      setCountries(response.data);
    } catch (error) {
      console.error('Failed to fetch countries:', error);
    }
  }, []);

  const fetchTimePeriods = useCallback(async () => {
    try {
      const response = await timePeriodApi.list();
      setTimePeriods(response.data);
    } catch (error) {
      console.error('Failed to fetch time periods:', error);
    }
  }, []);

  const fetchAllTags = useCallback(async () => {
    try {
      const response = await documentApi.getTags();
      setAllTags(response.data);
    } catch (error) {
      console.error('Failed to fetch tags:', error);
    }
  }, []);

  const fetchDocuments = useCallback(async () => {
    setLoading(true);
    try {
      const params: any = {};
      if (selectedFolderId) {
        params.folder_id = selectedFolderId;
      }
      if (searchQuery) {
        params.search = searchQuery;
      }
      
      const response = await documentApi.list(params);
      const docsWithPath = response.data.map(doc => ({
        ...doc,
        folderPath: getFolderPath(doc.folder_id ?? undefined, folders)
      }));
      setDocuments(docsWithPath);
    } catch (error) {
      console.error('Failed to fetch documents:', error);
    } finally {
      setLoading(false);
    }
  }, [selectedFolderId, searchQuery, folders]);

  useEffect(() => {
    fetchFolders();
    fetchCountries();
    fetchAllTags();
    fetchTimePeriods();
  }, [fetchFolders, fetchCountries, fetchAllTags, fetchTimePeriods]);

  useEffect(() => {
    fetchDocuments();
  }, [fetchDocuments]);

  const buildFolderTree = (flatFolders: Folder[]): TreeFolder[] => {
    const folderMap = new Map<string, TreeFolder>();
    const roots: TreeFolder[] = [];

    // 首先创建所有文件夹的映射
    flatFolders.forEach(folder => {
      const treeFolder: TreeFolder = {
        id: folder.id,
        name: folder.name,
        parent_id: folder.parent_id,
        created_at: folder.created_at,
        updated_at: folder.updated_at,
        document_count: folder.document_count || 0,
        children: [],
        isExpanded: false
      };
      folderMap.set(folder.id, treeFolder);
    });

    // 构建树形结构
    flatFolders.forEach(folder => {
      const treeFolder = folderMap.get(folder.id)!;
      if (folder.parent_id && folderMap.has(folder.parent_id)) {
        folderMap.get(folder.parent_id)!.children.push(treeFolder);
      } else {
        roots.push(treeFolder);
      }
    });

    return roots;
  };

  const getFolderPath = (folderId: string | undefined, folders: TreeFolder[]): string => {
    if (!folderId) return '根目录';
    
    const findPath = (folders: TreeFolder[], targetId: string, path: string = ''): string | null => {
      for (const folder of folders) {
        const currentPath = path ? `${path} / ${folder.name}` : folder.name;
        if (folder.id === targetId) {
          return currentPath;
        }
        if (folder.children.length > 0) {
          const found = findPath(folder.children, targetId, currentPath);
          if (found) return found;
        }
      }
      return null;
    };

    return findPath(folders, folderId) || '未知目录';
  };

  const toggleFolder = (folderId: string) => {
    const updateFolders = (folders: TreeFolder[]): TreeFolder[] => {
      return folders.map(folder => {
        if (folder.id === folderId) {
          return { ...folder, isExpanded: !folder.isExpanded };
        }
        if (folder.children.length > 0) {
          return { ...folder, children: updateFolders(folder.children) };
        }
        return folder;
      });
    };
    setFolders(updateFolders(folders));
  };

  const selectFolder = (folderId: string | null) => {
    setSelectedFolderId(folderId);
    setSelectedDocs(new Set());
  };

  const toggleDocSelection = (docId: string) => {
    setSelectedDocs(prev => {
      const newSet = new Set(prev);
      if (newSet.has(docId)) {
        newSet.delete(docId);
      } else {
        newSet.add(docId);
      }
      return newSet;
    });
  };

  const selectAllDocs = () => {
    if (selectedDocs.size === documents.length) {
      setSelectedDocs(new Set());
    } else {
      setSelectedDocs(new Set(documents.map(d => d.id)));
    }
  };

  const handleBulkEdit = async () => {
    try {
      const updates: any = {};
      
      if (bulkEditForm.author) updates.author = bulkEditForm.author;
      if (bulkEditForm.archive_status) updates.archive_status = bulkEditForm.archive_status;
      if (bulkEditForm.content_country_id) updates.content_country_id = bulkEditForm.content_country_id;
      
      // 处理标签
      const selectedDocList = documents.filter(d => selectedDocs.has(d.id));
      
      for (const doc of selectedDocList) {
        let newTags = [...(doc.tags || [])];
        
        // 添加标签
        if (bulkEditForm.addTags) {
          const tagsToAdd = bulkEditForm.addTags.split(',').map(t => t.trim()).filter(Boolean);
          newTags = [...new Set([...newTags, ...tagsToAdd])];
        }
        
        // 移除标签
        if (bulkEditForm.removeTags) {
          const tagsToRemove = bulkEditForm.removeTags.split(',').map(t => t.trim()).filter(Boolean);
          newTags = newTags.filter(t => !tagsToRemove.includes(t));
        }
        
        if (newTags.length > 0) updates.tags = newTags;
        
        await documentApi.update(doc.id, updates);
      }
      
      setShowBulkEdit(false);
      setSelectedDocs(new Set());
      fetchDocuments();
    } catch (error) {
      console.error('Failed to bulk edit:', error);
    }
  };

  const handleSingleEdit = async () => {
    if (!editingDoc) return;
    
    try {
      const updates: any = {};
      
      if (editForm.title !== editingDoc.title) updates.title = editForm.title;
      if (editForm.author !== (editingDoc.author || '')) updates.author = editForm.author;
      if (editForm.external_link !== (editingDoc.external_link || '')) updates.external_link = editForm.external_link;
      
      if (editForm.content_country_id !== (editingDoc.content_country_id || '')) {
        updates.content_country_id = editForm.content_country_id || undefined;
      }
      
      const newYearStart = editForm.content_year_start ? parseInt(editForm.content_year_start) : undefined;
      const newYearEnd = editForm.content_year_end ? parseInt(editForm.content_year_end) : undefined;
      if (newYearStart !== editingDoc.content_year_start) {
        updates.content_year_start = newYearStart;
      }
      if (newYearEnd !== editingDoc.content_year_end) {
        updates.content_year_end = newYearEnd;
      }
      
      const newTags = editForm.tags.split(',').map(t => t.trim()).filter(Boolean);
      const oldTags = editingDoc.tags || [];
      if (JSON.stringify(newTags) !== JSON.stringify(oldTags)) {
        updates.tags = newTags.length > 0 ? newTags : undefined;
      }
      
      await documentApi.update(editingDoc.id, updates);
      setEditingDoc(null);
      fetchDocuments();
      fetchAllTags();
    } catch (error) {
      console.error('Failed to update document:', error);
    }
  };



  const handleDelete = async (docId: string) => {
    if (!confirm('确定要删除这个文档吗？')) return;
    
    try {
      await documentApi.delete(docId);
      fetchDocuments();
    } catch (error) {
      console.error('Failed to delete document:', error);
    }
  };

  const startEdit = (doc: Document) => {
    setEditingDoc(doc);
    setEditForm({
      title: doc.title,
      tags: doc.tags?.join(', ') || '',
      author: doc.author || '',
      external_link: doc.external_link || '',
      content_country_id: doc.content_country_id || '',
      content_year_start: doc.content_year_start?.toString() || '',
      content_year_end: doc.content_year_end?.toString() || ''
    });
    setShowTagInput(false);
    setNewTag('');
  };

  const handleCountryChange = (countryId: string) => {
    setEditForm({...editForm, content_country_id: countryId});
    
    if (countryId) {
      const relatedPeriods = timePeriods.filter(tp => tp.country_id === countryId);
      if (relatedPeriods.length > 0) {
        const earliestStart = Math.min(...relatedPeriods.map(tp => tp.start_year || 0).filter(y => y > 0));
        const latestEnd = Math.max(...relatedPeriods.map(tp => tp.end_year || 0).filter(y => y > 0));
        
        if (earliestStart && earliestStart !== Infinity) {
          setEditForm(prev => ({
            ...prev,
            content_country_id: countryId,
            content_year_start: prev.content_year_start || earliestStart.toString(),
            content_year_end: prev.content_year_end || latestEnd.toString()
          }));
        }
      }
    }
  };

  const getArchiveStatusLabel = (status?: string) => {
    switch (status) {
      case 'unarchived_book': return '未归档书籍';
      case 'archived_book': return '已归档书籍';
      case 'unarchived_doc': return '未归档文档';
      case 'archived_doc': return '已归档存档';
      default: return '未分类';
    }
  };

  const renderFolderTree = (folders: TreeFolder[], level: number = 0) => {
    if (folders.length === 0) {
      return (
        <div className="empty-folders" style={{ paddingLeft: `${level * 20 + 12}px` }}>
          <span className="empty-text">暂无子文件夹</span>
        </div>
      );
    }
    
    return folders.map(folder => (
      <div key={folder.id} className="folder-tree-item">
        <div 
          className={`folder-item ${selectedFolderId === folder.id ? 'selected' : ''}`}
          style={{ paddingLeft: `${level * 20 + 12}px` }}
          onClick={() => selectFolder(folder.id)}
        >
          {folder.children.length > 0 ? (
            <button 
              className="expand-btn"
              onClick={(e) => {
                e.stopPropagation();
                toggleFolder(folder.id);
              }}
            >
              {folder.isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
            </button>
          ) : (
            <span className="expand-placeholder" style={{ width: '20px' }}></span>
          )}
          <FolderIcon size={18} className="folder-icon" />
          <span className="folder-name">{folder.name}</span>
          <span className="doc-count">{folder.document_count || 0}</span>
        </div>
        {folder.isExpanded && folder.children.length > 0 && (
          <div className="folder-children">
            {renderFolderTree(folder.children, level + 1)}
          </div>
        )}
      </div>
    ));
  };

  return (
    <div className="document-manager-full">
      {/* 头部 */}
      <div className="manager-header">
        {onBack && (
          <button className="back-btn" onClick={onBack}>
            <ArrowLeft size={20} />
            返回地图
          </button>
        )}
        <h2>
          <FileText size={24} />
          文档管理
        </h2>
      </div>

      <div className="manager-body">
        {/* 左侧文件夹树 */}
        <div className="folder-sidebar">
          <div className="sidebar-header">
            <h3>文件夹</h3>
          </div>
          <div className="folder-tree">
            <div 
              className={`folder-item root ${selectedFolderId === null ? 'selected' : ''}`}
              onClick={() => selectFolder(null)}
            >
              <FolderOpen size={18} className="folder-icon" />
              <span className="folder-name">全部文档</span>
              <span className="doc-count">{documents.length}</span>
            </div>
            {folders.length === 0 ? (
              <div className="empty-folders" style={{ padding: '20px', textAlign: 'center', color: '#999' }}>
                <p>暂无文件夹</p>
                <p style={{ fontSize: '12px', marginTop: '8px' }}>请在文档系统中创建文件夹</p>
              </div>
            ) : (
              renderFolderTree(folders)
            )}
          </div>
        </div>

        {/* 右侧文档列表 */}
        <div className="documents-area">
          {/* 工具栏 */}
          <div className="toolbar">
            <div className="search-box">
              <Search size={18} />
              <input
                type="text"
                placeholder="搜索文档..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
              {searchQuery && (
                <button className="clear-btn" onClick={() => setSearchQuery('')}>
                  <X size={14} />
                </button>
              )}
            </div>

            <button 
              className="batch-regenerate-btn"
              onClick={() => setShowBatchRegenerate(true)}
              title="批量重新生成不完整的正文"
            >
              <RefreshCw size={16} />
              批量重新生成
            </button>

            {selectedDocs.size > 0 && (
              <>
                <button 
                  className="bulk-edit-btn"
                  onClick={() => setShowBulkEdit(true)}
                >
                  <Edit2 size={16} />
                  批量编辑 ({selectedDocs.size})
                </button>
                <button 
                  className="bulk-timeline-btn"
                  onClick={() => setShowBatchTimeline(true)}
                  title="为选中的文档批量生成时间笔记"
                >
                  <Calendar size={16} />
                  批量生成时间笔记 ({selectedDocs.size})
                </button>
              </>
            )}
          </div>

          {/* 批量操作栏 */}
          <div className="bulk-actions-bar">
            <button className="select-all-btn" onClick={selectAllDocs}>
              {selectedDocs.size === documents.length && documents.length > 0 ? (
                <CheckSquare size={18} />
              ) : (
                <Square size={18} />
              )}
              全选
            </button>
          </div>

          {/* 文档列表 */}
          <div className="documents-list">
            {loading ? null : documents.length === 0 ? (
              <div className="empty-state">
                <FileText size={48} strokeWidth={1} />
                <p>暂无文档</p>
                <span>该文件夹下没有文档</span>
              </div>
            ) : (
              documents.map(doc => (
                <div 
                  key={doc.id} 
                  className={`document-card ${selectedDocs.has(doc.id) ? 'selected' : ''}`}
                >
                  <div className="doc-checkbox">
                    <button 
                      className="checkbox-btn"
                      onClick={() => toggleDocSelection(doc.id)}
                    >
                      {selectedDocs.has(doc.id) ? (
                        <CheckSquare size={20} className="checked" />
                      ) : (
                        <Square size={20} />
                      )}
                    </button>
                  </div>

                  <div 
                    className="doc-content"
                    onClick={() => {}}
                  >
                    <div className="doc-header">
                      <h4 className="doc-title">{doc.title}</h4>
                      <span className="doc-status">
                        {getArchiveStatusLabel(doc.archive_status ?? undefined)}
                      </span>
                    </div>
                    
                    <div className="doc-path">
                      <FolderIcon size={12} />
                      {doc.folderPath}
                    </div>
                    
                    {doc.description && (
                      <p className="doc-description">{doc.description}</p>
                    )}
                    
                    {doc.author && (
                      <span className="doc-author">作者: {doc.author}</span>
                    )}
                    
                    {doc.tags && doc.tags.length > 0 && (
                      <div className="doc-tags">
                        {doc.tags.map((tag, i) => (
                          <span key={i} className="doc-tag">{tag}</span>
                        ))}
                      </div>
                    )}

                    {doc.external_link && (
                      <a 
                        href={doc.external_link}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="doc-link"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <LinkIcon size={12} />
                        {doc.external_link}
                      </a>
                    )}
                  </div>
                  
                  <div className="doc-actions">
                    <button 
                      className="action-btn"
                      onClick={() => startEdit(doc)}
                      title="编辑"
                    >
                      <Edit2 size={16} />
                    </button>
                    <button 
                      className="action-btn danger"
                      onClick={() => handleDelete(doc.id)}
                      title="删除"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* 批量编辑弹窗 */}
      {showBulkEdit && (
        <div className="modal-overlay">
          <div className="modal-content bulk-edit-modal">
            <div className="modal-header">
              <h3>批量编辑 ({selectedDocs.size} 个文档)</h3>
              <button className="close-btn" onClick={() => setShowBulkEdit(false)}>
                <X size={20} />
              </button>
            </div>
            <div className="modal-body">
              <div className="form-group">
                <label>作者</label>
                <input
                  type="text"
                  value={bulkEditForm.author}
                  onChange={(e) => setBulkEditForm({...bulkEditForm, author: e.target.value})}
                  placeholder="设置所有选中文档的作者"
                />
              </div>
              
              <div className="form-group">
                <label><Globe size={14} /> 内容发生地（国家/地区）</label>
                <select
                  value={bulkEditForm.content_country_id}
                  onChange={(e) => setBulkEditForm({...bulkEditForm, content_country_id: e.target.value})}
                >
                  <option value="">保持不变</option>
                  {countries.map(country => (
                    <option key={country.id} value={country.id}>{country.name}</option>
                  ))}
                </select>
              </div>
              
              <div className="form-group">
                <label>归档状态</label>
                <select
                  value={bulkEditForm.archive_status}
                  onChange={(e) => setBulkEditForm({...bulkEditForm, archive_status: e.target.value})}
                >
                  <option value="">保持不变</option>
                  <option value="unarchived_book">未归档书籍</option>
                  <option value="archived_book">已归档书籍</option>
                  <option value="unarchived_doc">未归档文档</option>
                  <option value="archived_doc">已归档存档</option>
                </select>
              </div>
              
              <div className="form-group">
                <label>添加标签 (用逗号分隔)</label>
                <input
                  type="text"
                  value={bulkEditForm.addTags}
                  onChange={(e) => setBulkEditForm({...bulkEditForm, addTags: e.target.value})}
                  placeholder="如: 历史, 金融"
                />
              </div>
              
              <div className="form-group">
                <label>移除标签 (用逗号分隔)</label>
                <input
                  type="text"
                  value={bulkEditForm.removeTags}
                  onChange={(e) => setBulkEditForm({...bulkEditForm, removeTags: e.target.value})}
                  placeholder="如: 临时, 草稿"
                />
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn-secondary" onClick={() => setShowBulkEdit(false)}>
                取消
              </button>
              <button className="btn-primary" onClick={handleBulkEdit}>
                保存修改
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 单个编辑弹窗 */}
      {editingDoc && (
        <div className="modal-overlay" onClick={() => setEditingDoc(null)}>
          <div className="edit-doc-modal" onClick={e => e.stopPropagation()}>
            <div className="edit-doc-header">
              <h3>
                <Edit2 size={18} />
                编辑文档信息
              </h3>
              <button className="close-btn" onClick={() => setEditingDoc(null)}>
                <X size={20} />
              </button>
            </div>

            <div className="edit-doc-body">
              <div className="form-group">
                <label><BookOpen size={14} /> 文档标题</label>
                <input
                  type="text"
                  value={editForm.title}
                  onChange={(e) => setEditForm({...editForm, title: e.target.value})}
                />
              </div>

              <div className="form-group">
                <label><User size={14} /> 作者</label>
                <input
                  type="text"
                  value={editForm.author}
                  onChange={(e) => setEditForm({...editForm, author: e.target.value})}
                  placeholder="如：张三"
                />
              </div>

              {/* 标签选择 - 带历史标签快捷选择 */}
              <div className="form-group">
                <label><Tag size={14} /> 标签</label>
                <div className="tags-input-container">
                  <div className="selected-tags">
                    {editForm.tags.split(',').map(t => t.trim()).filter(Boolean).map((tag, idx) => (
                      <span key={idx} className="tag-item">
                        {tag}
                        <button 
                          className="remove-tag-btn"
                          onClick={() => {
                            const currentTags = editForm.tags.split(',').map(t => t.trim()).filter(Boolean);
                            const newTags = currentTags.filter((_, i) => i !== idx);
                            setEditForm({...editForm, tags: newTags.join(', ')});
                          }}
                        >
                          <XCircle size={14} />
                        </button>
                      </span>
                    ))}
                    <button 
                      className="add-tag-btn"
                      onClick={() => setShowTagInput(true)}
                    >
                      <PlusCircle size={16} />
                      添加标签
                    </button>
                  </div>
                  
                  {showTagInput && (
                    <div className="tag-input-popup">
                      <input
                        type="text"
                        value={newTag}
                        onChange={(e) => setNewTag(e.target.value)}
                        placeholder="输入新标签"
                        onKeyPress={(e) => {
                          if (e.key === 'Enter' && newTag.trim()) {
                            const currentTags = editForm.tags.split(',').map(t => t.trim()).filter(Boolean);
                            if (!currentTags.includes(newTag.trim())) {
                              setEditForm({...editForm, tags: [...currentTags, newTag.trim()].join(', ')});
                            }
                            setNewTag('');
                            setShowTagInput(false);
                          }
                        }}
                        autoFocus
                      />
                      <button 
                        className="confirm-tag-btn"
                        onClick={() => {
                          if (newTag.trim()) {
                            const currentTags = editForm.tags.split(',').map(t => t.trim()).filter(Boolean);
                            if (!currentTags.includes(newTag.trim())) {
                              setEditForm({...editForm, tags: [...currentTags, newTag.trim()].join(', ')});
                            }
                            setNewTag('');
                            setShowTagInput(false);
                          }
                        }}
                      >
                        添加
                      </button>
                    </div>
                  )}
                  
                  {/* 历史标签快捷选择 */}
                  {allTags.length > 0 && (
                    <div className="history-tags">
                      <span className="history-label">历史标签：</span>
                      {allTags.filter(tag => !editForm.tags.split(',').map(t => t.trim()).filter(Boolean).includes(tag)).slice(0, 8).map(tag => (
                        <button
                          key={tag}
                          className="history-tag-btn"
                          onClick={() => {
                            const currentTags = editForm.tags.split(',').map(t => t.trim()).filter(Boolean);
                            setEditForm({...editForm, tags: [...currentTags, tag].join(', ')});
                          }}
                        >
                          {tag}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* 内容发生地 - 国家选择 */}
              <div className="form-group">
                <label><Globe size={14} /> 内容发生地（国家/地区）</label>
                <select
                  value={editForm.content_country_id}
                  onChange={(e) => handleCountryChange(e.target.value)}
                >
                  <option value="">请选择国家/地区</option>
                  {countries.map(country => (
                    <option key={country.id} value={country.id}>
                      {country.name}
                    </option>
                  ))}
                </select>
                {editForm.content_country_id && timePeriods.filter(tp => tp.country_id === editForm.content_country_id).length > 0 && (
                  <small className="form-hint">
                    已根据该国家/地区的历史时期自动填充年代范围
                  </small>
                )}
              </div>

              {/* 内容发生时间 */}
              <div className="form-row">
                <div className="form-group">
                  <label><Calendar size={14} /> 内容起始年代</label>
                  <input
                    type="number"
                    value={editForm.content_year_start}
                    onChange={(e) => setEditForm({...editForm, content_year_start: e.target.value})}
                    placeholder="如：-500（公元前）"
                  />
                </div>

                <div className="form-group">
                  <label><Calendar size={14} /> 内容结束年代</label>
                  <input
                    type="number"
                    value={editForm.content_year_end}
                    onChange={(e) => setEditForm({...editForm, content_year_end: e.target.value})}
                    placeholder="如：2024"
                  />
                </div>
              </div>

              <div className="form-group">
                <label><LinkIcon size={14} /> 外部链接</label>
                <input
                  type="text"
                  value={editForm.external_link}
                  onChange={(e) => setEditForm({...editForm, external_link: e.target.value})}
                  placeholder="https://..."
                />
              </div>
            </div>

            <div className="edit-doc-footer">
              <button className="btn btn-secondary" onClick={() => setEditingDoc(null)}>
                取消
              </button>
              <button className="btn btn-primary" onClick={handleSingleEdit}>
                <Save size={16} />
                保存
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 批量重新生成弹窗 */}
      {showBatchRegenerate && (
        <BatchRegeneratePanel
          onClose={() => setShowBatchRegenerate(false)}
          onComplete={() => {
            fetchDocuments();
            fetchAllTags();
          }}
        />
      )}

      {/* 批量生成时间笔记弹窗 */}
      {showBatchTimeline && (
        <BatchTimelineGeneratePanel
          onClose={() => setShowBatchTimeline(false)}
          selectedDocs={documents.filter(d => selectedDocs.has(d.id))}
          onComplete={() => {
            fetchDocuments();
          }}
        />
      )}
    </div>
  );
};

export default DocumentManager;
