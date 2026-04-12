import React from 'react';
import {
  Upload, Tag, Layers, Settings,
  Edit3, ZoomOut, ZoomIn,
  RotateCcw, Cloud, X, Eye, EyeOff,
  MousePointer, Tag as TagIcon
} from 'lucide-react';

interface TagLibraryHeaderProps {
  selectedTag: string | null;
  isSelectionMode: boolean;
  selectedBookIdsSize: number;
  filterYear: number | null;
  allYears: (number | null)[];
  viewMode: 'timeline' | 'grid';
  editMode: boolean;
  scale: number;
  showBooks: boolean;
  onFilterYearChange: (year: number | null) => void;
  onToggleSelectionMode: () => void;
  onExitSelectionMode: () => void;
  onShowBatchUploadModal: () => void;
  onShowUploadModal: () => void;
  onShowManageView: () => void;
  onShowQuarkModal: () => void;
  onShowQuickTagModal: (initialTag?: string) => void;
  onToggleEditMode: () => void;
  onZoomOut: () => void;
  onZoomIn: () => void;
  onResetZoom: () => void;
  onToggleShowBooks: () => void;
}

const TagLibraryHeader: React.FC<TagLibraryHeaderProps> = ({
  selectedTag,
  isSelectionMode,
  selectedBookIdsSize,
  filterYear,
  allYears,
  viewMode,
  editMode,
  scale,
  showBooks,
  onFilterYearChange,
  onToggleSelectionMode,
  onExitSelectionMode,
  onShowBatchUploadModal,
  onShowUploadModal,
  onShowManageView,
  onShowQuarkModal,
  onShowQuickTagModal,
  onToggleEditMode,
  onZoomOut,
  onZoomIn,
  onResetZoom,
  onToggleShowBooks,
}) => {
  return (
    <div className="country-header" style={{
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
          <select value={filterYear || ''}
            onChange={(e) => onFilterYearChange(e.target.value ? parseInt(e.target.value) : null)}
            className="year-filter"
            style={{
              padding: '4px 8px', fontSize: '12px',
              border: '1px solid var(--border-color)', borderRadius: '4px',
              background: 'var(--bg-white)', color: 'var(--text-primary)'
            }}
          >
            <option value="">全部年份</option>
            {allYears.map(year => (
              <option key={year ?? ''} value={year ?? ''}>{year}年</option>
            ))}
          </select>

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
              <button className="btn btn-secondary"
                onClick={onShowBatchUploadModal}
                title="批量上传"
                style={{
                  padding: '4px 8px', fontSize: '12px',
                  display: 'flex', alignItems: 'center', gap: '3px',
                  background: 'var(--bg-light)', border: '1px solid var(--border-color)',
                  borderRadius: '4px', color: 'var(--text-primary)', cursor: 'pointer'
                }}
              >
                <Layers size={12} />批量上传
              </button>
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
              <button className="btn btn-secondary"
                onClick={onShowManageView}
                title="图书管理"
                style={{
                  padding: '4px 8px', fontSize: '12px',
                  display: 'flex', alignItems: 'center', gap: '3px',
                  background: 'var(--bg-light)', border: '1px solid var(--border-color)',
                  borderRadius: '4px', color: 'var(--text-primary)', cursor: 'pointer'
                }}
              >
                <Settings size={12} />管理
              </button>
              <button className="btn btn-secondary"
                onClick={onShowQuarkModal}
                title="上传到夸克网盘"
                style={{
                  padding: '4px 8px', fontSize: '12px',
                  display: 'flex', alignItems: 'center', gap: '3px',
                  background: 'var(--bg-light)', border: '1px solid var(--border-color)',
                  borderRadius: '4px', color: 'var(--text-primary)', cursor: 'pointer'
                }}
              >
                <Cloud size={12} />夸克网盘
              </button>
              <button 
                className="btn btn-quick-tag"
                onClick={() => onShowQuickTagModal('')}
                title="快速打标签"
                style={{
                  padding: '4px 10px', fontSize: '12px',
                  display: 'flex', alignItems: 'center', gap: '4px',
                  background: 'var(--gradient-primary)',
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

          {viewMode === 'timeline' && selectedTag && (
            <div className="timeline-controls-inline" style={{
              display: 'flex', alignItems: 'center', gap: '6px',
              paddingLeft: '8px', borderLeft: '1px solid var(--border-color)'
            }}>
              <button className="btn btn-secondary btn-sm"
                onClick={onToggleEditMode}
                style={{
                  padding: '4px 8px', fontSize: '12px',
                  display: 'flex', alignItems: 'center', gap: '3px',
                  background: editMode ? 'var(--primary-color)' : 'var(--bg-light)',
                  border: '1px solid var(--border-color)', borderRadius: '4px',
                  color: editMode ? 'white' : 'var(--text-primary)', cursor: 'pointer'
                }}
              >
                <Edit3 size={12} />{editMode ? '完成' : '编辑'}
              </button>
              <button className="zoom-btn" onClick={onZoomOut} title="缩小"
                style={{
                  width: '24px', height: '24px', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  background: 'var(--bg-light)', border: '1px solid var(--border-color)',
                  borderRadius: '4px', color: 'var(--text-secondary)', cursor: 'pointer'
                }}
              ><ZoomOut size={12} /></button>
              <span className="zoom-level" style={{ fontSize: '11px', color: 'var(--text-muted)', minWidth: '35px', textAlign: 'center' }}>{Math.round(scale * 100)}%</span>
              <button className="zoom-btn" onClick={onZoomIn} title="放大"
                style={{
                  width: '24px', height: '24px', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  background: 'var(--bg-light)', border: '1px solid var(--border-color)',
                  borderRadius: '4px', color: 'var(--text-secondary)', cursor: 'pointer'
                }}
              ><ZoomIn size={12} /></button>
              <button className="zoom-btn" onClick={onResetZoom} title="重置"
                style={{
                  width: '24px', height: '24px', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  background: 'var(--bg-light)', border: '1px solid var(--border-color)',
                  borderRadius: '4px', color: 'var(--text-secondary)', cursor: 'pointer'
                }}
              ><RotateCcw size={12} /></button>
              <button className="toggle-books-btn" onClick={onToggleShowBooks}
                title={showBooks ? "隐藏书籍" : "显示书籍"}
                style={{
                  width: 'auto', height: '24px', padding: '0 8px',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px',
                  background: showBooks ? 'var(--primary-color)' : 'var(--bg-light)',
                  border: '1px solid var(--border-color)', borderRadius: '4px',
                  color: showBooks ? 'white' : 'var(--text-secondary)', cursor: 'pointer',
                  fontSize: '11px', whiteSpace: 'nowrap'
                }}
              >
                {showBooks ? <Eye size={12} /> : <EyeOff size={12} />}
                {showBooks ? '书籍' : '已隐藏'}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default TagLibraryHeader;
