/**
 * 可视化节点画布组件
 * 使用ReactFlow实现ComfyUI风格的节点编辑器
 */
import React, { useCallback, useEffect, useState, useMemo } from 'react';
import ReactFlow, {
  Node,
  Controls,
  Background,
  useNodesState,
  useEdgesState,
  addEdge,
  Connection,
  NodeTypes,
  Position,
  Handle,
  NodeProps,
} from 'reactflow';
import 'reactflow/dist/style.css';
import { X, Code, FunctionSquare, BarChart3, Hexagon, Sparkles, Save } from 'lucide-react';

import { VisualizationNode, createNode, normalizeContent, updateNode, batchSaveNodes, listNodes as listNodesApi, CreateNodeRequest, NormalizeResult } from '../api/visualizationNodes';

// ========== 节点类型定义 ==========

interface NodeData {
  label: string;
  description?: string;
  sourceContent: string;
  normalizedContent?: string;
  renderConfig?: Record<string, unknown>;
  language?: string;
  nodeType: 'formula' | 'code' | 'chart' | 'geometry';
  onNormalize?: () => void;
  onDelete?: () => void;
}

// ========== 自定义节点组件 ==========

const FormulaNode: React.FC<NodeProps<NodeData>> = ({ data, selected }) => (
  <div className={`viz-node viz-node-formula ${selected ? 'selected' : ''}`}>
    <Handle type="target" position={Position.Top} />
    <div className="viz-node-header">
      <FunctionSquare size={14} />
      <span>{data.label}</span>
      <button className="viz-node-action" onClick={data.onNormalize} title="AI规范化">
        <Sparkles size={12} />
      </button>
    </div>
    <div className="viz-node-content">
      <div className="viz-node-formula-content" dangerouslySetInnerHTML={{ __html: data.normalizedContent || data.sourceContent }} />
    </div>
    <Handle type="source" position={Position.Bottom} />
  </div>
);

const CodeNode: React.FC<NodeProps<NodeData>> = ({ data, selected }) => (
  <div className={`viz-node viz-node-code ${selected ? 'selected' : ''}`}>
    <Handle type="target" position={Position.Top} />
    <div className="viz-node-header">
      <Code size={14} />
      <span>{data.label}</span>
      <span className="viz-node-lang">{data.language}</span>
      <button className="viz-node-action" onClick={data.onNormalize} title="AI规范化">
        <Sparkles size={12} />
      </button>
    </div>
    <div className="viz-node-content">
      <pre><code>{data.normalizedContent || data.sourceContent}</code></pre>
    </div>
    <Handle type="source" position={Position.Bottom} />
  </div>
);

const ChartNode: React.FC<NodeProps<NodeData>> = ({ data, selected }) => (
  <div className={`viz-node viz-node-chart ${selected ? 'selected' : ''}`}>
    <Handle type="target" position={Position.Top} />
    <div className="viz-node-header">
      <BarChart3 size={14} />
      <span>{data.label}</span>
      <button className="viz-node-action" onClick={data.onNormalize} title="AI规范化">
        <Sparkles size={12} />
      </button>
    </div>
    <div className="viz-node-content">
      <div className="viz-node-chart-placeholder">
        <BarChart3 size={32} />
        <span>图表预览</span>
      </div>
    </div>
    <Handle type="source" position={Position.Bottom} />
  </div>
);

const GeometryNode: React.FC<NodeProps<NodeData>> = ({ data, selected }) => (
  <div className={`viz-node viz-node-geometry ${selected ? 'selected' : ''}`}>
    <Handle type="target" position={Position.Top} />
    <div className="viz-node-header">
      <Hexagon size={14} />
      <span>{data.label}</span>
      <button className="viz-node-action" onClick={data.onNormalize} title="AI规范化">
        <Sparkles size={12} />
      </button>
    </div>
    <div className="viz-node-content">
      <div className="viz-node-geometry-placeholder">
        <Hexagon size={32} />
        <span>几何图形</span>
      </div>
    </div>
    <Handle type="source" position={Position.Bottom} />
  </div>
);

const nodeTypes: NodeTypes = {
  formula: FormulaNode,
  code: CodeNode,
  chart: ChartNode,
  geometry: GeometryNode,
};

// ========== 主组件 ==========

interface NodeCanvasProps {
  bookId?: string;
  chapterNoteId?: string;
  initialNodes?: VisualizationNode[];
  onClose?: () => void;
}

const NodeCanvas: React.FC<NodeCanvasProps> = ({
  bookId: _bookId,
  chapterNoteId: _chapterNoteId,
  initialNodes = [],
  onClose,
}) => {
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [dbNodes, setDbNodes] = useState<VisualizationNode[]>(initialNodes);
  const [isSaving, setIsSaving] = useState(false);

  // 将数据库节点转换为ReactFlow节点
  const convertToFlowNodes = useCallback((dbNodes: VisualizationNode[]): Node<NodeData>[] => {
    return dbNodes.map((node) => ({
      id: node.id,
      type: node.node_type,
      position: { x: node.position_x, y: node.position_y },
      data: {
        label: node.title,
        description: node.description || undefined,
        sourceContent: node.source_content,
        normalizedContent: node.normalized_content || undefined,
        renderConfig: node.render_config || undefined,
        language: node.language || undefined,
        nodeType: node.node_type,
      },
    }));
  }, []);

  // 初始化节点
  useEffect(() => {
    if (dbNodes.length > 0) {
      setNodes(convertToFlowNodes(dbNodes));
    }
  }, [dbNodes, setNodes, convertToFlowNodes]);

  // 连接节点
  const onConnect = useCallback(
    (params: Connection) => setEdges((eds) => addEdge(params, eds)),
    [setEdges]
  );

  // AI规范化节点
  const handleNormalizeNode = useCallback(async (nodeId: string) => {
    const node = dbNodes.find((n) => n.id === nodeId);
    if (!node) return;

    try {
      const result = await normalizeContent(
        node.source_content,
        node.node_type,
        node.language || undefined
      );

      // 更新节点
      await updateNode(nodeId, {
        description: result.description,
      });

      setDbNodes((prev) =>
        prev.map((n) =>
          n.id === nodeId
            ? { ...n, normalized_content: result.normalized_content, render_config: result.render_config }
            : n
        )
      );
    } catch (error) {
      console.error('规范化失败:', error);
    }
  }, [dbNodes]);

  // 保存所有节点位置
  const handleSave = useCallback(async () => {
    setIsSaving(true);
    try {
      await batchSaveNodes(
        nodes.map((node) => ({
          id: node.id,
          position: {
            x: node.position.x,
            y: node.position.y,
            width: node.data.width || 300,
            height: node.data.height || 200,
          },
        }))
      );
    } catch (error) {
      console.error('保存失败:', error);
    } finally {
      setIsSaving(false);
    }
  }, [nodes]);

  // 删除节点
  const handleDeleteNode = useCallback((nodeId: string) => {
    setNodes((nds) => nds.filter((n) => n.id !== nodeId));
    setDbNodes((prev) => prev.filter((n) => n.id !== nodeId));
  }, [setNodes]);

  // 更新节点数据，添加回调
  const nodesWithCallbacks = useMemo(() => {
    return nodes.map((node) => ({
      ...node,
      data: {
        ...node.data,
        onNormalize: () => handleNormalizeNode(node.id),
        onDelete: () => handleDeleteNode(node.id),
      },
    }));
  }, [nodes, handleNormalizeNode, handleDeleteNode]);

  return (
    <div className="node-canvas-container">
      <div className="node-canvas-toolbar">
        <h3>节点画布</h3>
        <div className="node-canvas-actions">
          <button
            className="node-canvas-btn save"
            onClick={handleSave}
            disabled={isSaving}
          >
            <Save size={14} />
            <span>{isSaving ? '保存中...' : '保存'}</span>
          </button>
          {onClose && (
            <button className="node-canvas-btn close" onClick={onClose}>
              <X size={14} />
            </button>
          )}
        </div>
      </div>

      <div className="node-canvas-flow">
        <ReactFlow
          nodes={nodesWithCallbacks}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          nodeTypes={nodeTypes}
          fitView
          attributionPosition="bottom-left"
        >
          <Controls />
          <Background gap={16} size={1} />
        </ReactFlow>
      </div>
    </div>
  );
};

// 导出工具函数供外部使用
export { createNode, normalizeContent, listNodesApi as listNodes, batchSaveNodes };
export type { VisualizationNode, CreateNodeRequest, NormalizeResult };
export default NodeCanvas;
