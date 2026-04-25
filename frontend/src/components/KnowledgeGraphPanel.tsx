import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Graph } from '@antv/g6';
import { knowledgeGraphApi } from '../api/knowledgeGraph';
import { bookApi } from '../api';
import ConfirmDialog from './ConfirmDialog';
import '../styles/knowledge-graph-panel.css';

interface KnowledgeGraphPanelProps {
  bookTitle?: string;
  bookId?: string;
  onNodeClick?: (node: GraphNodeData | null) => void;
  onNodeChapterClick?: (chapterIndex: number) => void;
  onTextSelect?: (text: string, action: 'ask' | 'refine', chapterIndex?: number, knowledgeNodeId?: string | number) => void;
  refreshKey?: number;
}

interface GraphNodeData {
  id: string | number;
  name: string;
  labels?: string[];
  description?: string;
  entity_type?: string;
  book_title?: string;
  concept?: string;
  definition?: string;
  node_type?: string;
  chapter_index?: number;
  source_chapter_index?: number;
  domain?: string;
  confidence?: number;
}

interface GraphEdgeData {
  source: string | number;
  target: string | number;
  type?: string;
  edge_type?: string;
  description?: string;
}

const ENTITY_COLORS_HEX: Record<string, string> = {
  Philosopher: '#8b5cf6',
  Concept: '#06b6d4',
  Theory: '#22c55e',
  Work: '#f59e0b',
  Argument: '#e879f9',
  School: '#38bdf8',
  Era: '#a78bfa',
  CognitiveNode: '#f472b6',
  RootConcept: '#ec4899',
  DerivedConcept: '#fb7185',
};

const BRANCH_COLORS = [
  '#8B7EC8', '#6CB2EB', '#68D391', '#F6AD55', '#FC8181',
  '#B794F4', '#4FD1C5', '#F687B3', '#63B3ED', '#FAF089',
];

const BRANCH_STROKES = [
  '#6B5B95', '#4299E1', '#48BB78', '#ED8936', '#E53E3E',
  '#9F7AEA', '#38B2AC', '#D53F8C', '#3182CE', '#D69E2E',
];

function truncate(str: string, maxLen: number = 10): string {
  if (!str) return '';
  if (str.length <= maxLen) return str;
  return str.substring(0, maxLen) + '...';
}

const KnowledgeGraphPanel: React.FC<KnowledgeGraphPanelProps> = ({
  bookTitle,
  bookId: _bookId,
  onNodeClick,
  onNodeChapterClick,
  onTextSelect,
  refreshKey,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const graphRef = useRef<Graph | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedNode, setSelectedNode] = useState<GraphNodeData | null>(null);
  const [cardPosition, setCardPosition] = useState({ x: 0, y: 0 });
  const [stats, setStats] = useState<{ total_nodes: number; total_relations: number } | null>(null);
  const [storageEnabled, setStorageEnabled] = useState(true);
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [cardContextMenu, setCardContextMenu] = useState<{x: number, y: number, text: string} | null>(null);
  
  const [allTags, setAllTags] = useState<string[]>([]);
  const [selectedTag, setSelectedTag] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'book' | 'tag'>('book');

  const handleCardContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const selection = window.getSelection();
    const selectedText = selection?.toString().trim();
    if (selectedText && selectedText.length > 0) {
      setCardContextMenu({ x: e.clientX, y: e.clientY, text: selectedText });
    }
  }, []);

  const checkHealth = useCallback(async () => {
    try {
      const res = await knowledgeGraphApi.healthCheck();
      const storage = res.data?.storage;
      const enabled = storage === 'sqlite';
      setStorageEnabled(enabled);
      return enabled;
    } catch {
      setStorageEnabled(false);
      return false;
    }
  }, []);

  const initGraph = useCallback(() => {
    if (!containerRef.current) return;

    const container = containerRef.current;
    const width = container.offsetWidth;
    const height = container.offsetHeight;

    if (graphRef.current) {
      graphRef.current.destroy();
      graphRef.current = null;
    }

    const graph = new Graph({
      container,
      width,
      height,
      autoFit: 'view',
      padding: 20,
      animation: true,
      node: {
        style: {
          size: (d: Record<string, unknown>) => {
            const data = d.data as Record<string, unknown>;
            const type = data?.entity_type as string;
            const nodeType = data?.node_type as string;
            if (nodeType === 'QuickSummary') return 40;
            if (type === 'RootConcept') return 36;
            if (type === 'ParentRoot') return 32;
            return 28;
          },
          fill: (d: Record<string, unknown>) => {
            const data = d.data as Record<string, unknown>;
            const nodeType = data?.node_type as string;
            if (nodeType === 'QuickSummary') return '#f59e0b';
            if (data?.entity_type === 'ParentRoot') return '#F0EDF7';
            const branch = (data?.branch as number) || 0;
            return BRANCH_COLORS[branch % BRANCH_COLORS.length];
          },
          stroke: (d: Record<string, unknown>) => {
            const data = d.data as Record<string, unknown>;
            const nodeType = data?.node_type as string;
            if (nodeType === 'QuickSummary') return '#d97706';
            if (data?.entity_type === 'ParentRoot') return '#8B7EC8';
            const branch = (data?.branch as number) || 0;
            return BRANCH_STROKES[branch % BRANCH_STROKES.length];
          },
          lineWidth: (d: Record<string, unknown>) => {
            const data = d.data as Record<string, unknown>;
            const nodeType = data?.node_type as string;
            if (nodeType === 'QuickSummary') return 3;
            return data?.entity_type === 'ParentRoot' ? 2 : 1.5;
          },
          cursor: 'grab',
          labelText: (d: Record<string, unknown>) => {
            const data = d.data as Record<string, unknown>;
            return truncate((data?.name as string) || '', 10);
          },
          labelFontSize: 11,
          labelFill: '#ffffff',
          labelPlacement: 'bottom',
          labelOffsetY: 8,
          labelBackground: true,
          labelBackgroundFill: 'rgba(0, 0, 0, 0.6)',
          labelBackgroundRadius: 4,
          labelPadding: [2, 4, 2, 4],
        },
        state: {
          selected: {
            lineWidth: 3,
            shadowColor: '#8b5cf6',
            shadowBlur: 10,
          },
          hover: {
            lineWidth: 2,
            shadowColor: '#8b5cf6',
            shadowBlur: 6,
          },
        },
        animation: {
          enter: 'fade',
          exit: 'fade',
        },
      },
      edge: {
        style: {
          stroke: (d: Record<string, unknown>) => {
            const data = d.data as Record<string, unknown>;
            const edgeType = data?.edge_type as string;
            if (edgeType === 'CHAPTER_SEQUENCE') return '#9ca3af';
            if (edgeType === 'SECTION_SEQUENCE') return '#a78bfa';
            if (edgeType === 'EXPLAINS' || edgeType === 'BRANCH_EXTEND' || edgeType === 'HAS_QUESTION') {
              const targetBranch = (data?.targetBranch as number) || 0;
              return BRANCH_STROKES[targetBranch % BRANCH_STROKES.length];
            }
            if (data?.isCrossDoc) return '#999999';
            if (data?.isDashed) return '#8B7EC8';
            const branch = (data?.branch as number) || 0;
            return BRANCH_STROKES[branch % BRANCH_STROKES.length];
          },
          lineWidth: (d: Record<string, unknown>) => {
            const data = d.data as Record<string, unknown>;
            const edgeType = data?.edge_type as string;
            if (edgeType === 'CHAPTER_SEQUENCE') return 3;
            if (edgeType === 'SECTION_SEQUENCE') return 1.5;
            if (edgeType === 'EXPLAINS' || edgeType === 'BRANCH_EXTEND' || edgeType === 'HAS_QUESTION') return 2;
            if (data?.isCrossDoc) return 2.5;
            return data?.isDashed ? 2 : 1.5;
          },
          lineDash: (d: Record<string, unknown>) => {
            const data = d.data as Record<string, unknown>;
            const edgeType = data?.edge_type as string;
            if (edgeType === 'CHAPTER_SEQUENCE') return [8, 4];
            if (edgeType === 'SECTION_SEQUENCE') return [4, 4];
            if (edgeType === 'EXPLAINS' || edgeType === 'BRANCH_EXTEND' || edgeType === 'HAS_QUESTION') return undefined;
            if (data?.isCrossDoc) return [10, 6];
            return data?.isDashed ? [6, 4] : undefined;
          },
          endArrow: (d: Record<string, unknown>) => {
            const data = d.data as Record<string, unknown>;
            const edgeType = data?.edge_type as string;
            if (edgeType === 'CHAPTER_SEQUENCE' || edgeType === 'SECTION_SEQUENCE') return false;
            return !(data?.isCrossDoc);
          },
        },
      },
      layout: {
        type: 'd3-force',
        collide: {
          radius: 24,
          strength: 0.8,
        },
        link: {
          distance: 150,
          strength: 0.5,
        },
        manyBody: {
          strength: -300,
          distanceMax: 400,
        },
        center: {
          strength: 0.1,
        },
        animation: true,
      },
      behaviors: [
        { type: 'drag-element-force', fixed: false },
        'zoom-canvas',
        'drag-canvas',
      ],
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    graph.on('node:click', (evt: any) => {
      const nodeId = evt?.target?.id || evt?.itemId;
      if (nodeId) {
        const nodeData = graph.getNodeData(nodeId);
        if (nodeData) {
          const data = nodeData.data as Record<string, unknown>;
          const nodeInfo: GraphNodeData = {
            id: nodeId,
            name: (data?.name as string) || '',
            description: (data?.description as string) || '',
            entity_type: (data?.entity_type as string) || '',
            book_title: (data?.book_title as string) || '',
            domain: (data?.domain as string) || '',
            confidence: (data?.confidence as number) || 0.8,
            source_chapter_index: data?.source_chapter_index as number | undefined,
          };

          const canvasRect = container.getBoundingClientRect();
          const clientX = evt?.clientX || canvasRect.left + canvasRect.width / 2;
          const clientY = evt?.clientY || canvasRect.top + canvasRect.height / 2;

          let cardX = clientX - canvasRect.left - 160;
          let cardY = clientY - canvasRect.top + 30;

          if (cardX < 10) cardX = 10;
          if (cardX + 320 > canvasRect.width) {
            cardX = canvasRect.width - 330;
          }
          if (cardY + 420 > canvasRect.height) {
            cardY = clientY - canvasRect.top - 200;
          }
          if (cardY < 10) cardY = 10;

          setCardPosition({ x: cardX, y: cardY });
          setSelectedNode(nodeInfo);
          onNodeClick?.(nodeInfo);
        }
      }
    });

    graph.on('canvas:click', () => {
      setSelectedNode(null);
      onNodeClick?.(null);
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    graph.on('node:dragstart', () => {
      setSelectedNode(null);
    });

    graphRef.current = graph;
  }, [onNodeClick]);

  const loadAllTags = useCallback(async () => {
    try {
      const res = await bookApi.list();
      const tagSet = new Set<string>();
      res.data.forEach((book) => {
        book.tags?.forEach(tag => tagSet.add(tag));
      });
      setAllTags(Array.from(tagSet).sort());
    } catch (err) {
      console.error('加载标签失败:', err);
    }
  }, []);

  const loadGraphData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      let res;
      if (viewMode === 'tag' && selectedTag) {
        res = await knowledgeGraphApi.getGraphDataByTag(selectedTag);
      } else {
        res = await knowledgeGraphApi.getGraphData(bookTitle);
      }
      const { nodes = [], edges = [] } = res.data;

      const g6Nodes = nodes
        .filter((n: GraphNodeData) => n.id != null && (n.name || n.concept))
        .map((n: GraphNodeData, index: number) => {
          const isCognitiveNode = n.labels?.includes('CognitiveNode') || n.node_type;
          const entityType = n.node_type || n.entity_type || (n.labels && n.labels[0]) || 'Concept';
          return {
            id: String(n.id),
            data: {
              name: n.name || n.concept || '',
              description: n.description || n.definition || '',
              entity_type: entityType,
              node_type: n.node_type || '',
              book_title: n.book_title || '',
              labels: n.labels || [],
              isCognitiveNode,
              source_chapter_index: n.chapter_index,
              domain: n.domain || '通用',
              confidence: n.confidence || 0.8,
              branch: index % BRANCH_COLORS.length,
            },
          };
        });

      const nodeIds = new Set(g6Nodes.map((n: { id: string }) => n.id));
      const nodeBranchMap = new Map<string, number>();
      g6Nodes.forEach((n: { id: string; data?: { branch?: number } }) => {
        nodeBranchMap.set(n.id, (n.data?.branch as number) || 0);
      });

      const g6Edges = edges
        .filter((e: GraphEdgeData) => {
          const sourceId = String(e.source);
          const targetId = String(e.target);
          return e.source != null && e.target != null && nodeIds.has(sourceId) && nodeIds.has(targetId);
        })
        .map((e: GraphEdgeData, i: number) => {
          const targetId = String(e.target);
          const edgeType = e.edge_type || '';
          const isSolidLine = edgeType === 'EXPLAINS' || edgeType === 'BRANCH_EXTEND' || edgeType === 'HAS_QUESTION';
          return {
            id: `edge-${i}`,
            source: String(e.source),
            target: targetId,
            data: {
              relationType: e.type || '',
              edge_type: edgeType,
              isDashed: !isSolidLine && edgeType !== 'CHAPTER_SEQUENCE',
              targetBranch: isSolidLine ? (nodeBranchMap.get(targetId) ?? 0) : 0,
            },
          };
        });

      if (graphRef.current) {
        try {
          graphRef.current.clear();
          graphRef.current.setData({ nodes: g6Nodes, edges: g6Edges });
          await graphRef.current.render();
        } catch (renderErr) {
          console.warn('图谱渲染警告:', renderErr);
        }
      }

      setStats({
        total_nodes: g6Nodes.length,
        total_relations: g6Edges.length,
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : '加载图谱数据失败';
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, [bookTitle, viewMode, selectedTag]);

  useEffect(() => {
    checkHealth().then((enabled) => {
      if (enabled) {
        initGraph();
        loadAllTags();
        setTimeout(() => loadGraphData(), 0);
      }
    });

    const handleResize = () => {
      if (graphRef.current && containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect();
        if (rect.width > 0 && rect.height > 0) {
          graphRef.current.resize(rect.width, rect.height);
          graphRef.current.fitView();
        }
      }
    };

    window.addEventListener('resize', handleResize);

    const resizeObserver = new ResizeObserver(() => {
      handleResize();
    });

    if (containerRef.current) {
      resizeObserver.observe(containerRef.current);
    }

    return () => {
      window.removeEventListener('resize', handleResize);
      resizeObserver.disconnect();
      if (graphRef.current) {
        graphRef.current.destroy();
        graphRef.current = null;
      }
    };
  }, [initGraph, loadGraphData, loadAllTags, checkHealth]);

  useEffect(() => {
    if (refreshKey && refreshKey > 0) {
      loadGraphData();
    }
  }, [refreshKey, loadGraphData]);

  const handleRefresh = () => {
    loadGraphData();
  };

  const handleResetView = () => {
    if (graphRef.current) {
      graphRef.current.fitView();
    }
  };

  const handleCloseCard = () => {
    setSelectedNode(null);
    onNodeClick?.(null);
    setIsEditing(false);
  };

  const handleStartEdit = () => {
    if (selectedNode) {
      setEditName(selectedNode.name);
      setEditDescription(selectedNode.description || '');
      setIsEditing(true);
    }
  };

  const handleCancelEdit = () => {
    setIsEditing(false);
    setEditName('');
    setEditDescription('');
  };

  const handleSaveEdit = async () => {
    if (!selectedNode) return;
    
    setIsSaving(true);
    try {
      await knowledgeGraphApi.updateNode(String(selectedNode.id), {
        name: editName.trim() || undefined,
        description: editDescription.trim() || undefined,
      });
      
      setSelectedNode({
        ...selectedNode,
        name: editName.trim() || selectedNode.name,
        description: editDescription.trim() || selectedNode.description,
      });
      setIsEditing(false);
      loadGraphData();
    } catch (err) {
      console.error('更新节点失败:', err);
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteNode = async () => {
    if (!selectedNode) return;
    setDeleteConfirm(true);
  };

  const confirmDeleteNode = async () => {
    if (!selectedNode) return;
    try {
      await knowledgeGraphApi.deleteNode(String(selectedNode.id));
      setSelectedNode(null);
      onNodeClick?.(null);
      loadGraphData();
    } catch (err) {
      console.error('删除节点失败:', err);
    } finally {
      setDeleteConfirm(false);
    }
  };

  if (!storageEnabled) {
    return (
      <div className="kg-panel-disabled">
        <div className="kg-disabled-content">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="1.5">
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
          <h3>知识图谱未启用</h3>
          <p>数据库服务未连接</p>
        </div>
      </div>
    );
  }

  return (
    <div className="knowledge-graph-panel">
      <div className="kg-toolbar">
        <div className="kg-toolbar-left">
          {stats && (
            <span className="kg-stats">
              {stats.total_nodes} 节点 · {stats.total_relations} 关系
            </span>
          )}
        </div>
        <div className="kg-toolbar-right">
          <button className="kg-btn" onClick={handleResetView} title="重置视图">
            ⊡
          </button>
          <button className="kg-btn" onClick={handleRefresh} title="刷新" disabled={loading}>
            ↻
          </button>
        </div>
      </div>

      {allTags.length > 0 && (
        <div className="kg-tag-selector">
          <button
            className={`kg-tag-btn ${viewMode === 'book' ? 'active' : ''}`}
            onClick={() => { setViewMode('book'); setSelectedTag(null); }}
            title="当前书籍图谱"
          >
            本书
          </button>
          <div className="kg-tag-divider" />
          <select
            className="kg-tag-select"
            value={selectedTag || ''}
            onChange={(e) => {
              if (e.target.value) {
                setSelectedTag(e.target.value);
                setViewMode('tag');
              }
            }}
          >
            <option value="">选择标签...</option>
            {allTags.map(tag => (
              <option key={tag} value={tag}>{tag}</option>
            ))}
          </select>
          {viewMode === 'tag' && selectedTag && (
            <span className="kg-tag-current">标签: {selectedTag}</span>
          )}
        </div>
      )}

      <div className="kg-graph-container" ref={containerRef}>
        {loading && (
          <div className="kg-loading">
            <div className="kg-spinner" />
            <span>加载知识图谱...</span>
          </div>
        )}
        {error && (
          <div className="kg-error">
            <span>{error}</span>
            <button onClick={handleRefresh}>重试</button>
          </div>
        )}

        {selectedNode && (
          <div
            className="kg-detail-card"
            style={{
              left: cardPosition.x,
              top: cardPosition.y,
            }}
            onWheel={(e) => e.stopPropagation()}
            onContextMenu={handleCardContextMenu}
          >
            <button className="kg-detail-close" onClick={handleCloseCard}>
              ✕
            </button>
            
            {isEditing ? (
              <>
                <div className="kg-detail-edit-section">
                  <label className="kg-detail-edit-label">名称</label>
                  <input
                    type="text"
                    className="kg-detail-edit-input"
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    placeholder="节点名称"
                  />
                </div>
                <div className="kg-detail-edit-section">
                  <label className="kg-detail-edit-label">描述</label>
                  <textarea
                    className="kg-detail-edit-textarea"
                    value={editDescription}
                    onChange={(e) => setEditDescription(e.target.value)}
                    placeholder="节点描述"
                    rows={4}
                  />
                </div>
                <div className="kg-detail-edit-actions">
                  <button 
                    className="kg-detail-btn kg-detail-btn-cancel"
                    onClick={handleCancelEdit}
                    disabled={isSaving}
                  >
                    取消
                  </button>
                  <button 
                    className="kg-detail-btn kg-detail-btn-save"
                    onClick={handleSaveEdit}
                    disabled={isSaving}
                  >
                    {isSaving ? '保存中...' : '保存'}
                  </button>
                </div>
              </>
            ) : (
              <>
                <div className="kg-detail-name">{selectedNode.name}</div>
                <div className="kg-detail-meta">
                  <span
                    className="kg-detail-domain"
                    style={{
                      backgroundColor: ENTITY_COLORS_HEX[selectedNode.entity_type || 'Concept'] || '#8b5cf6',
                      color: '#fff',
                    }}
                  >
                    {selectedNode.domain || selectedNode.entity_type || '通用'}
                  </span>
                </div>
                {selectedNode.description && (
                  <>
                    <div className="kg-detail-label">定义</div>
                    <div className="kg-detail-def">{selectedNode.description}</div>
                  </>
                )}
                {selectedNode.book_title && (
                  <div className="kg-detail-doc">
                    <span className="kg-detail-doc-label">来源：</span>
                    {selectedNode.book_title}
                  </div>
                )}
                {selectedNode.source_chapter_index !== undefined && selectedNode.source_chapter_index !== null && (
                  <div className="kg-detail-chapter">
                    <span className="kg-detail-chapter-label">章节：</span>
                    <button
                      className="kg-detail-chapter-btn"
                      onClick={(e) => {
                        e.stopPropagation();
                        console.log('点击章节按钮, chapterIndex:', selectedNode.source_chapter_index);
                        if (selectedNode.source_chapter_index !== undefined) {
                          onNodeChapterClick?.(selectedNode.source_chapter_index);
                        }
                      }}
                      title={`跳转到第 ${selectedNode.source_chapter_index} 章`}
                    >
                      第 {selectedNode.source_chapter_index} 章 →
                    </button>
                  </div>
                )}
                <div className="kg-detail-actions">
                  <button 
                    className="kg-detail-action-btn kg-detail-action-edit"
                    onClick={handleStartEdit}
                    title="编辑节点"
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                    </svg>
                    编辑
                  </button>
                  <button 
                    className="kg-detail-action-btn kg-detail-action-delete"
                    onClick={handleDeleteNode}
                    title="删除节点"
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="3 6 5 6 21 6"/>
                      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                      <line x1="10" y1="11" x2="10" y2="17"/>
                      <line x1="14" y1="11" x2="14" y2="17"/>
                    </svg>
                    删除
                  </button>
                </div>
              </>
            )}
          </div>
        )}
      </div>

      <ConfirmDialog
        isOpen={deleteConfirm}
        title="删除节点"
        message={`确定要删除节点「${selectedNode?.name}」吗？此操作不可撤销。`}
        confirmText="删除"
        cancelText="取消"
        type="delete"
        onConfirm={confirmDeleteNode}
        onCancel={() => setDeleteConfirm(false)}
      />

      {cardContextMenu && (
        <div
          className="kg-card-context-menu"
          style={{ left: cardContextMenu.x, top: cardContextMenu.y }}
          onMouseLeave={() => setCardContextMenu(null)}
        >
          <div className="kg-card-context-item" onClick={() => {
            onTextSelect?.(cardContextMenu.text, 'ask', selectedNode?.source_chapter_index, selectedNode?.id);
            setCardContextMenu(null);
            window.getSelection()?.removeAllRanges();
          }}>
            <span>追问选中内容</span>
          </div>
          <div className="kg-card-context-item" onClick={() => {
            onTextSelect?.(cardContextMenu.text, 'refine', selectedNode?.source_chapter_index, selectedNode?.id);
            setCardContextMenu(null);
            window.getSelection()?.removeAllRanges();
          }}>
            <span>细化概念</span>
          </div>
          <div className="kg-card-context-divider" />
          <div className="kg-card-context-item" onClick={() => setCardContextMenu(null)}>
            <span>取消</span>
          </div>
        </div>
      )}
    </div>
  );
};

export default React.memo(KnowledgeGraphPanel);
