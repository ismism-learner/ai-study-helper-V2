import React, { useState, useMemo, useCallback } from 'react';
import { Folder } from '../types';
import { folderApi } from '../api';
import { FolderPlus, Edit2, Trash2, ChevronRight, ChevronDown, Folder as FolderIcon, FolderOpen, Home } from 'lucide-react';

interface FolderManagerProps {
  folders: Folder[];
  selectedFolderId: string | null;
  onSelectFolder: (id: string | null) => void;
  onFoldersChange: () => void;
  onDrop?: (targetFolderId: string | null, e: React.DragEvent) => void;
  isDragging?: boolean;
}

interface FolderNode extends Folder {
  children: FolderNode[];
}

const FolderManager: React.FC<FolderManagerProps> = ({
  folders,
  selectedFolderId,
  onSelectFolder,
  onFoldersChange,
  onDrop,
  isDragging = false,
}) => {
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());
  const [creatingFolder, setCreatingFolder] = useState<string | null>(null);
  const [editingFolder, setEditingFolder] = useState<string | null>(null);
  const [newFolderName, setNewFolderName] = useState('');
  const [editFolderName, setEditFolderName] = useState('');
  const [contextMenu, setContextMenu] = useState<{ id: string; x: number; y: number } | null>(null);
  const [hoveredFolder, setHoveredFolder] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  const [draggingFolderId, setDraggingFolderId] = useState<string | null>(null);

  const buildTree = useCallback((folders: Folder[]): FolderNode[] => {
    const folderMap = new Map<string, FolderNode>();
    const roots: FolderNode[] = [];

    folders.forEach(folder => {
      folderMap.set(folder.id, { ...folder, children: [] });
    });

    folders.forEach(folder => {
      const node = folderMap.get(folder.id)!;
      if (folder.parent_id) {
        const parent = folderMap.get(folder.parent_id);
        if (parent) {
          parent.children.push(node);
        }
      } else {
        roots.push(node);
      }
    });

    const sortChildren = (nodes: FolderNode[]) => {
      nodes.sort((a, b) => {
        const aNum = parseFloat(a.name) || 0;
        const bNum = parseFloat(b.name) || 0;
        if (!isNaN(aNum) && !isNaN(bNum)) {
          return aNum - bNum;
        }
        return a.name.localeCompare(b.name, 'zh-CN');
      });
      nodes.forEach(node => sortChildren(node.children));
    };
    sortChildren(roots);

    return roots;
  }, []);

  const folderTree = useMemo(() => buildTree(folders), [folders, buildTree]);

  const toggleExpand = (id: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setExpandedFolders(prev => {
      const newExpanded = new Set(prev);
      if (newExpanded.has(id)) {
        newExpanded.delete(id);
      } else {
        newExpanded.add(id);
      }
      return newExpanded;
    });
  };

  const handleCreateFolder = async (parentId: string | null) => {
    if (!newFolderName.trim()) return;

    try {
      await folderApi.create(newFolderName.trim(), parentId || undefined);
      setNewFolderName('');
      setCreatingFolder(null);
      onFoldersChange();
    } catch (error) {
      console.error('Failed to create folder:', error);
      alert('创建文件夹失败');
    }
  };

  const handleRenameFolder = async (id: string) => {
    if (!editFolderName.trim()) return;

    try {
      await folderApi.update(id, { name: editFolderName.trim() });
      setEditFolderName('');
      setEditingFolder(null);
      onFoldersChange();
    } catch (error) {
      console.error('Failed to rename folder:', error);
      alert('重命名失败');
    }
  };

  const handleDeleteFolder = async (id: string) => {
    if (!window.confirm('确定要删除这个文件夹吗？子文件夹和文档不会被删除。')) return;

    try {
      await folderApi.delete(id);
      if (selectedFolderId === id) {
        onSelectFolder(null);
      }
      onFoldersChange();
    } catch (error) {
      console.error('Failed to delete folder:', error);
      alert('删除失败');
    }
  };

  const handleContextMenu = (e: React.MouseEvent, id: string) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({ id, x: e.clientX, y: e.clientY });
  };

  const handleDragOver = (e: React.DragEvent, folderId: string | null) => {
    e.preventDefault();
    e.stopPropagation();
    if (isDragging || draggingFolderId) {
      setDropTarget(folderId);
    }
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDropTarget(null);
  };

  const handleDrop = (e: React.DragEvent, folderId: string | null) => {
    e.preventDefault();
    e.stopPropagation();
    setDropTarget(null);
    
    if (draggingFolderId && draggingFolderId !== folderId) {
      moveFolder(draggingFolderId, folderId);
    } else if (onDrop) {
      onDrop(folderId, e);
    }
    
    setDraggingFolderId(null);
  };

  const handleFolderDragStart = (e: React.DragEvent, folderId: string) => {
    e.stopPropagation();
    setDraggingFolderId(folderId);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', `folder:${folderId}`);
  };

  const handleFolderDragEnd = () => {
    setDraggingFolderId(null);
    setDropTarget(null);
  };

  const moveFolder = async (folderId: string, targetParentId: string | null) => {
    if (folderId === targetParentId) return;
    
    const folder = folders.find(f => f.id === folderId);
    if (!folder) return;
    
    if (targetParentId) {
      let current: Folder | undefined = folders.find(f => f.id === targetParentId);
      while (current) {
        if (current.id === folderId) {
          alert('不能将文件夹移动到其子文件夹中');
          return;
        }
        current = current.parent_id ? folders.find(f => f.id === current!.parent_id) : undefined;
      }
    }
    
    try {
      await folderApi.update(folderId, { parent_id: targetParentId || undefined });
      onFoldersChange();
    } catch (error) {
      console.error('Failed to move folder:', error);
      alert('移动文件夹失败');
    }
  };

  const handleFolderClick = (node: FolderNode) => {
    onSelectFolder(node.id);
    if (node.children.length > 0) {
      toggleExpand(node.id);
    }
  };

  const renderFolderNode = (node: FolderNode, level: number = 0): React.ReactNode => {
    const isExpanded = expandedFolders.has(node.id);
    const isSelected = selectedFolderId === node.id;
    const isEditing = editingFolder === node.id;
    const hasChildren = node.children.length > 0;
    const isHovered = hoveredFolder === node.id;
    const isDropTarget = dropTarget === node.id;
    const isDraggingThis = draggingFolderId === node.id;

    return (
      <div key={node.id} className="folder-node">
        <div
          className={`folder-item ${isSelected ? 'selected' : ''} ${isHovered && !isSelected ? 'hovered' : ''} ${isDropTarget ? 'drop-target' : ''} ${isDraggingThis ? 'dragging-folder' : ''}`}
          style={{ paddingLeft: 12 + level * 16 }}
          onClick={() => handleFolderClick(node)}
          onContextMenu={(e) => handleContextMenu(e, node.id)}
          onMouseEnter={() => setHoveredFolder(node.id)}
          onMouseLeave={() => setHoveredFolder(null)}
          onDragOver={(e) => handleDragOver(e, node.id)}
          onDragLeave={handleDragLeave}
          onDrop={(e) => handleDrop(e, node.id)}
          draggable
          onDragStart={(e) => handleFolderDragStart(e, node.id)}
          onDragEnd={handleFolderDragEnd}
        >
          <span 
            className="folder-toggle" 
            onClick={(e) => { e.stopPropagation(); toggleExpand(node.id); }}
          >
            {hasChildren ? (
              isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />
            ) : (
              <span style={{ width: 14, display: 'inline-block' }} />
            )}
          </span>
          
          <span className="folder-icon-wrapper">
            {isSelected ? <FolderOpen size={16} className="folder-icon" /> : <FolderIcon size={16} className="folder-icon" />}
          </span>

          {isEditing ? (
            <input
              type="text"
              value={editFolderName}
              onChange={(e) => setEditFolderName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleRenameFolder(node.id);
                if (e.key === 'Escape') setEditingFolder(null);
              }}
              onClick={(e) => e.stopPropagation()}
              autoFocus
              className="folder-edit-input"
            />
          ) : (
            <span className="folder-name">{node.name}</span>
          )}

          {!isEditing && (isHovered || isSelected) && (
            <div className="folder-actions" onClick={(e) => e.stopPropagation()}>
              <button
                onClick={() => { setEditingFolder(node.id); setEditFolderName(node.name); }}
                title="重命名"
                className="folder-action-btn"
              >
                <Edit2 size={12} />
              </button>
              <button
                onClick={() => setCreatingFolder(node.id)}
                title="新建子文件夹"
                className="folder-action-btn"
              >
                <FolderPlus size={12} />
              </button>
              <button
                onClick={() => handleDeleteFolder(node.id)}
                title="删除"
                className="folder-action-btn delete"
              >
                <Trash2 size={12} />
              </button>
            </div>
          )}
        </div>

        {creatingFolder === node.id && (
          <div className="folder-create-input" style={{ paddingLeft: 28 + level * 16 }}>
            <input
              type="text"
              value={newFolderName}
              onChange={(e) => setNewFolderName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleCreateFolder(node.id);
                if (e.key === 'Escape') { setCreatingFolder(null); setNewFolderName(''); }
              }}
              onBlur={() => { if (!newFolderName.trim()) setCreatingFolder(null); }}
              placeholder="子文件夹名称..."
              autoFocus
            />
          </div>
        )}

        {isExpanded && hasChildren && (
          <div className="folder-children">
            {node.children.map(child => renderFolderNode(child, level + 1))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="folder-manager">
      <div className="folder-header">
        <span className="folder-title">
          <FolderIcon size={14} style={{ marginRight: 6, opacity: 0.7 }} />
          文件夹
        </span>
        <button
          onClick={() => setCreatingFolder('root')}
          className="folder-add-btn"
          title="新建文件夹"
        >
          <FolderPlus size={14} />
        </button>
      </div>

      <div className="folder-list">
        <div
          className={`folder-item root-folder ${selectedFolderId === null ? 'selected' : ''} ${hoveredFolder === 'root' && selectedFolderId !== null ? 'hovered' : ''} ${dropTarget === null && (isDragging || draggingFolderId) ? 'drop-target' : ''}`}
          onClick={() => onSelectFolder(null)}
          onMouseEnter={() => setHoveredFolder('root')}
          onMouseLeave={() => setHoveredFolder(null)}
          onDragOver={(e) => handleDragOver(e, null)}
          onDragLeave={handleDragLeave}
          onDrop={(e) => handleDrop(e, null)}
        >
          <span className="folder-icon-wrapper">
            <Home size={16} className="folder-icon" />
          </span>
          <span className="folder-name">根目录</span>
          {(isDragging || draggingFolderId) && dropTarget === null && (
            <span className="drop-hint">释放以移动到此处</span>
          )}
        </div>

        {creatingFolder === 'root' && (
          <div className="folder-create-input" style={{ paddingLeft: 12 }}>
            <input
              type="text"
              value={newFolderName}
              onChange={(e) => setNewFolderName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleCreateFolder(null);
                if (e.key === 'Escape') { setCreatingFolder(null); setNewFolderName(''); }
              }}
              onBlur={() => { if (!newFolderName.trim()) setCreatingFolder(null); }}
              placeholder="文件夹名称..."
              autoFocus
            />
          </div>
        )}

        <div className="folder-tree">
          {folderTree.map(node => renderFolderNode(node))}
        </div>
      </div>

      {contextMenu && (
        <>
          <div className="context-menu-overlay" onClick={() => setContextMenu(null)} />
          <div
            className="context-menu show"
            style={{ left: contextMenu.x, top: contextMenu.y }}
          >
            <button onClick={() => { setEditingFolder(contextMenu.id); setContextMenu(null); }}>
              <Edit2 size={14} /> 重命名
            </button>
            <button onClick={() => { setCreatingFolder(contextMenu.id); setContextMenu(null); }}>
              <FolderPlus size={14} /> 新建子文件夹
            </button>
            <button onClick={() => { handleDeleteFolder(contextMenu.id); setContextMenu(null); }} className="danger">
              <Trash2 size={14} /> 删除
            </button>
          </div>
        </>
      )}
    </div>
  );
};

export default FolderManager;
