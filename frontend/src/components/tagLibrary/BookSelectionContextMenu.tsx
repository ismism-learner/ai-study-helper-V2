import React from 'react';
import { createPortal } from 'react-dom';
import {
  X, CheckSquare, Tag as TagIcon, Edit3, Trash2, CheckCircle
} from 'lucide-react';

interface TagCount {
  tag: string;
  count: number;
}

interface BookSelectionContextMenuProps {
  contextMenu: { x: number; y: number } | null;
  selectedBookIds: Set<string>;
  selectedBooksTags: TagCount[];
  availableToAddForSelected: string[];
  taggingFromMenu: boolean;
  editingTitle: boolean;
  editTitleValue: string;
  selectedCount: number;
  onBatchAddTag: (tag: string) => void;
  onBatchRemoveTag: (tag: string) => void;
  onBatchDelete: () => void;
  onStartEditingTitle: () => void;
  onUpdateTitle: () => void;
  onSetEditTitleValue: (value: string) => void;
  onSetTaggingFromMenu: (value: boolean) => void;
  onSetEditingTitle: (value: boolean) => void;
  onExitSelectionMode: () => void;
}

const BookSelectionContextMenu: React.FC<BookSelectionContextMenuProps> = ({
  contextMenu,
  selectedBookIds,
  selectedBooksTags,
  availableToAddForSelected,
  taggingFromMenu,
  editingTitle,
  editTitleValue,
  selectedCount,
  onBatchAddTag,
  onBatchRemoveTag,
  onBatchDelete,
  onStartEditingTitle,
  onUpdateTitle,
  onSetEditTitleValue,
  onSetTaggingFromMenu,
  onSetEditingTitle,
  onExitSelectionMode,
}) => {
  if (!contextMenu) return null;

  return createPortal(
    <div 
      className="taglib-context-menu" 
      style={{
        position: 'fixed',
        left: contextMenu.x,
        top: contextMenu.y,
        zIndex: 2147483647,
      }} 
      onClick={(e) => e.stopPropagation()}
    >
      <div className="taglib-cm-header">
        <CheckSquare size={14} />
        <span>已选 {selectedCount} 本书籍</span>
      </div>
      <div className="taglib-cm-divider" />
      <button className="taglib-cm-item taglib-cm-item-primary" onClick={() => onSetTaggingFromMenu(true)}>
        <TagIcon size={15} />
        <span>编辑标签</span>
        <span className="taglib-cm-hint">为选中书籍添加或移除标签</span>
      </button>
      <button className="taglib-cm-item" onClick={onStartEditingTitle}>
        <Edit3 size={15} />
        <span>编辑名称</span>
        <span className="taglib-cm-hint">修改显示名称</span>
      </button>
      <button className="taglib-cm-item taglib-cm-item-danger" onClick={onBatchDelete}>
        <Trash2 size={15} />
        <span>删除数据</span>
        <span className="taglib-cm-hint">永久删除 {selectedCount} 本书籍</span>
      </button>
      <div className="taglib-cm-divider" />
      <button className="taglib-cm-item" onClick={onExitSelectionMode}>
        <X size={15} />
        <span>取消选择</span>
      </button>

      {taggingFromMenu && (
        <div className="taglib-cm-tag-panel" onClick={(e) => e.stopPropagation()}>
          <div className="taglib-cm-tag-label">
            <TagIcon size={14} /> 选择或输入标签：
          </div>
          <div className="taglib-cm-tag-input-row">
            <input
              type="text"
              placeholder="输入新标签..."
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  const target = e.target as HTMLInputElement;
                  if (target.value.trim()) {
                    onBatchAddTag(target.value.trim());
                    target.value = '';
                  }
                }
              }}
              className="taglib-cm-tag-input"
            />
          </div>
          {selectedBooksTags.length > 0 && (
            <div className="taglib-cm-tag-section">
              <div className="taglib-cm-tag-section-label">已有标签（点击移除）：</div>
              <div className="taglib-cm-tag-list">
                {selectedBooksTags.map(({ tag, count }) => (
                  <button key={tag} className="taglib-cm-tag-btn taglib-cm-tag-btn-remove"
                    onClick={() => onBatchRemoveTag(tag)}
                    title={`移除标签「${tag}」(${count}/${selectedBookIds.size}本)`}
                  >
                    − {tag} <span className="tag-count">({count})</span>
                  </button>
                ))}
              </div>
            </div>
          )}
          <div className="taglib-cm-tag-section">
            <div className="taglib-cm-tag-section-label">可添加标签：</div>
            <div className="taglib-cm-tag-list">
              {availableToAddForSelected.length === 0 ? (
                <div className="taglib-cm-tag-empty">所有标签都已拥有</div>
              ) : (
                availableToAddForSelected.map(tag => (
                  <button key={tag} className="taglib-cm-tag-btn"
                    onClick={() => onBatchAddTag(tag)}>
                    + {tag}
                  </button>
                ))
              )}
            </div>
          </div>
          <button className="taglib-cm-tag-close" onClick={() => onSetTaggingFromMenu(false)}>
            <X size={14} /> 关闭
          </button>
        </div>
      )}

      {editingTitle && (
        <div className="taglib-cm-title-panel" onClick={(e) => e.stopPropagation()}>
          <div className="taglib-cm-title-label">
            <Edit3 size={14} /> 修改显示名称：
          </div>
          <input
            className="taglib-cm-title-input"
            type="text"
            value={editTitleValue}
            onChange={(e) => onSetEditTitleValue(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') onUpdateTitle(); }}
            placeholder="输入新的显示名称..."
            autoFocus
          />
          <div className="taglib-cm-title-actions">
            <button className="taglib-cm-title-save" onClick={onUpdateTitle}>
              <CheckCircle size={14} /> 保存
            </button>
            <button className="taglib-cm-title-cancel" onClick={() => onSetEditingTitle(false)}>
              <X size={14} /> 取消
            </button>
          </div>
          {selectedBookIds.size > 1 && (
            <div className="taglib-cm-title-hint">将同时修改 {selectedBookIds.size} 本书籍的名称</div>
          )}
        </div>
      )}
    </div>,
    document.body
  );
};

export default BookSelectionContextMenu;
