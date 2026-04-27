import React from 'react';
import {
  Upload, Tag,
  X, MousePointer, Tag as TagIcon
} from 'lucide-react';

interface TagLibraryHeaderProps {
  selectedTag: string | null;
  isSelectionMode: boolean;
  selectedBookIdsSize: number;
  onToggleSelectionMode: () => void;
  onExitSelectionMode: () => void;
  onShowUploadModal: () => void;
  onShowQuickTagModal: (initialTag?: string) => void;
}

const TagLibraryHeader: React.FC<TagLibraryHeaderProps> = ({
  selectedTag,
  isSelectionMode,
  selectedBookIdsSize,
  onToggleSelectionMode,
  onExitSelectionMode,
  onShowUploadModal,
  onShowQuickTagModal,
}) => {
  return (
    <div className="tag-library-header-bar" style={{
      padding: '8px 24px',
      background: 'var(--bg-white)',
      borderBottom: '1px solid var(--border-color)'
    }}>
      <div className="header-content" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '16px' }}>
        <div className="header-left" style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <h2 style={{ fontSize: '16px', fontWeight: 600, margin: 0, color: 'var(--text-primary)', whiteSpace: 'nowrap' }}>
            {selectedTag ? (
              <>
                <Tag size={16} style={{ marginRight: 6, verticalAlign: 'middle' }} />
                标签：{selectedTag}
              </>
            ) : '图书馆'}
          </h2>
          {isSelectionMode && (
            <span style={{
              fontSize: '12px', fontWeight: 600,
              color: 'var(--primary-600)', background: 'var(--primary-50)',
              padding: '2px 10px', borderRadius: '10px'
            }}>
              已选 {selectedBookIdsSize} 本
            </span>
          )}
        </div>
        <div className="header-right" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <button
            className={`btn ${isSelectionMode ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => isSelectionMode ? onExitSelectionMode() : onToggleSelectionMode()}
            title={isSelectionMode ? "退出选择模式" : "框选多本操作"}
            style={{
              padding: '4px 10px', fontSize: '12px',
              display: 'flex', alignItems: 'center', gap: '4px',
              background: isSelectionMode ? 'var(--primary-600)' : 'var(--bg-light)',
              border: isSelectionMode ? '1px solid var(--primary-600)' : '1px solid var(--border-color)',
              borderRadius: '4px', color: isSelectionMode ? 'var(--text-on-primary)' : 'var(--text-primary)', cursor: 'pointer',
              transition: 'all 0.15s ease'
            }}
          >
            <MousePointer size={13} />
            {isSelectionMode ? `${selectedBookIdsSize > 0 ? `已选${selectedBookIdsSize}` : '选择中'}` : '选择'}
          </button>

          {!isSelectionMode && (
            <>
              <button className="btn btn-primary"
                onClick={onShowUploadModal}
                style={{
                  padding: '4px 8px', fontSize: '12px',
                  display: 'flex', alignItems: 'center', gap: '3px',
                  background: 'var(--primary-color)', border: '1px solid var(--primary-color)',
                  borderRadius: '4px', color: 'white', cursor: 'pointer'
                }}
              >
                <Upload size={12} />上传书籍
              </button>
              <button 
                className="btn btn-quick-tag"
                onClick={() => onShowQuickTagModal('')}
                title="快速打标签"
                style={{
                  padding: '4px 10px', fontSize: '12px',
                  display: 'flex', alignItems: 'center', gap: '4px',
                  background: 'var(--primary-color)',
                  border: 'none', borderRadius: '4px', color: 'white', cursor: 'pointer',
                  fontWeight: 500
                }}
              >
                <TagIcon size={12} />快速打标
              </button>
            </>
          )}

          {isSelectionMode && selectedBookIdsSize > 0 && (
            <button className="btn btn-secondary"
              onClick={onExitSelectionMode}
              title="取消选择"
              style={{
                padding: '4px 8px', fontSize: '12px',
                display: 'flex', alignItems: 'center', gap: '3px',
                background: 'var(--bg-light)', border: '1px solid var(--border-color)',
                borderRadius: '4px', color: 'var(--text-primary)', cursor: 'pointer'
              }}
            >
              <X size={12} />取消选择 ({selectedBookIdsSize})
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default TagLibraryHeader;
