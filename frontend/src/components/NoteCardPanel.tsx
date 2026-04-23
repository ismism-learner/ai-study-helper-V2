import React, { useState, useCallback, useMemo, lazy, Suspense } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import rehypeRaw from 'rehype-raw';
import rehypeHighlight from 'rehype-highlight';
import { ChevronRight, ChevronDown, Sparkles, X, Box, Code, FunctionSquare, Type, LayoutGrid, RefreshCw, Eye } from 'lucide-react';
import 'katex/dist/katex.min.css';
import 'highlight.js/styles/github-dark.css';
import { createNode, VisualizationNode as VizNode } from './NodeCanvas';
const NodeCanvas = lazy(() => import('./NodeCanvas'));
import '../styles/node-canvas.css';

interface ChapterNoteData {
  chapterTitle: string;
  chapterIndex: number;
  markdownContent: string | null;
  isGenerating: boolean;
  noteId: string | null;
}

interface NoteCardPanelProps {
  chapters: string[];
  currentChapter: number;
  notes: Map<number, ChapterNoteData>;
  onGenerateNote: (chapterIndex: number) => void;
  onRegenerateNote?: (chapterIndex: number) => void;
  onGenerateAll?: () => void;
  isGeneratingStructure?: boolean;
  generateProgress?: string | null;
  bookStructure?: {
    book_title?: string;
    total_chapters?: number;
    chapters: { index: number; title: string; summary?: string; sections?: { title: string; summary: string; key_points?: string[] }[] }[];
  } | null;
  onBack?: () => void;
  hideHeader?: boolean;
}

interface SubSection {
  title: string;
  content: string;
  level: number;
  visualizableItems: VisualizableItem[];
}

interface VisualizableItem {
  type: 'formula' | 'code' | 'chart' | 'geometry';
  label: string;
  description: string;
  source: string;
  confidence: 'high' | 'medium';
}

/**
 * 检测可实体化的内容
 * 
 * 简化版：AI已经在整理时用 ``` 包裹了代码块，我们只需要检测代码块即可
 * 不再做复杂的语义分析，信任AI的判断
 */
function detectVisualizableItems(content: string): VisualizableItem[] {
  const items: VisualizableItem[] = [];

  // 1. 检测代码块（AI已经用 ``` 包裹好了）
  // 支持的类型：latex, python, javascript, typescript, chart, geometry, code, bash
  const applicableTypes = ['latex', 'python', 'javascript', 'typescript', 'chart', 'geometry', 'code', 'bash', 'r'];
  
  const codeBlockRegex = /```(\w+)\n([\s\S]*?)```/g;
  let match: RegExpExecArray | null;
  
  while ((match = codeBlockRegex.exec(content)) !== null) {
    const lang = match[1].toLowerCase();
    const code = match[2].trim();
    
    // 跳过空代码块
    if (!code || code.length < 10) continue;
    
    // 只处理可应用化的类型
    if (!applicableTypes.includes(lang)) continue;
    
    const firstLine = code.split('\n')[0];
    
    // 根据语言类型确定展示类型
    let type: VisualizableItem['type'] = 'code';
    let description = '代码块';
    
    if (lang === 'latex') {
      type = 'formula';
      description = '数学公式';
    } else if (lang === 'chart') {
      type = 'chart';
      description = '数据可视化';
    } else if (lang === 'geometry') {
      type = 'geometry';
      description = '几何图形';
    } else if (['python', 'javascript', 'typescript', 'r'].includes(lang)) {
      // 检测代码用途（简单判断，不做复杂分析）
      if (code.includes('plt.') || code.includes('matplotlib') || code.includes('plotly')) {
        type = 'chart';
        description = '数据可视化';
      } else if (code.includes('coordinate') || code.includes('plot(') || code.includes('graph')) {
        type = 'geometry';
        description = '几何图形';
      } else {
        type = 'code';
        description = '计算代码';
      }
    }
    
    items.push({
      type,
      label: firstLine.substring(0, 40) || description,
      description,
      source: match[0],
      confidence: 'high', // AI已经识别并包裹，置信度高
    });
  }

  // 2. 检测独立的LaTeX公式块（$$...$$）
  const latexBlockRegex = /\$\$([\s\S]*?)\$\$/g;
  let latexMatch: RegExpExecArray | null;
  while ((latexMatch = latexBlockRegex.exec(content)) !== null) {
    const formula = latexMatch[1].trim();
    if (formula.length < 5) continue;
    
    // 检查是否已经被代码块包裹（避免重复）
    const isWrapped = items.some(item => item.source.includes(latexMatch![0]));
    if (isWrapped) continue;
    
    const firstLine = formula.split('\\\\')[0] || formula.substring(0, 30);
    items.push({
      type: 'formula',
      label: firstLine.substring(0, 40),
      description: '数学公式',
      source: latexMatch[0],
      confidence: 'high',
    });
  }

  return items;
}

function parseMarkdownSections(markdown: string): SubSection[] {
  const lines = markdown.split('\n');
  const sections: SubSection[] = [];
  let currentTitle = '概述';
  let currentContent: string[] = [];
  let currentLevel = 0;

  const flushSection = () => {
    const content = currentContent.join('\n').trim();
    if (content || currentTitle !== '概述') {
      sections.push({
        title: currentTitle,
        content,
        level: currentLevel,
        visualizableItems: detectVisualizableItems(content),
      });
    }
  };

  for (const line of lines) {
    const headingMatch = line.match(/^(#{1,4})\s+(.+)/);
    if (headingMatch) {
      flushSection();
      currentLevel = headingMatch[1].length;
      currentTitle = headingMatch[2].trim();
      currentContent = [];
    } else {
      currentContent.push(line);
    }
  }
  flushSection();

  return sections;
}

const typeIcons: Record<string, React.ReactNode> = {
  formula: <FunctionSquare size={12} />,
  code: <Code size={12} />,
  chart: <Box size={12} />,
  geometry: <Type size={12} />,
};

const typeColors: Record<string, string> = {
  formula: '#8b5cf6',
  code: '#3b82f6',
  chart: '#10b981',
  geometry: '#f59e0b',
};

const NoteCardPanel: React.FC<NoteCardPanelProps> = ({
  chapters,
  currentChapter,
  notes,
  onGenerateNote,
  onRegenerateNote,
  onGenerateAll,
  isGeneratingStructure,
  generateProgress,
  bookStructure,
  onBack,
  hideHeader = false,
}) => {
  const [expandedChapter, setExpandedChapter] = useState<number | null>(null);
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set());
  const [activeApps, setActiveApps] = useState<Map<string, VisualizableItem>>(new Map());
  const [showNodeCanvas, setShowNodeCanvas] = useState(false);
  const [canvasNodes, setCanvasNodes] = useState<VizNode[]>([]);
  // 每个章节的视图模式：'original' = 原文，'rewritten' = 改写
  const [viewModes, setViewModes] = useState<Map<number, 'original' | 'rewritten'>>(new Map());

  const chapterNotesList = useMemo(() => {
    const list: { index: number; title: string; hasNote: boolean; note: ChapterNoteData | undefined; structureTitle?: string; structureSummary?: string }[] = [];
    for (let i = 0; i < chapters.length; i++) {
      const chapterText = chapters[i];
      const titleLine = chapterText.split('\n')[0] || `第${i + 1}章`;
      const title = titleLine.startsWith('====') ? titleLine.substring(4).trim() : titleLine.trim();
      const note = notes.get(i);
      const structChapter = bookStructure?.chapters?.[i];
      list.push({
        index: i,
        title: structChapter?.title || title || `第${i + 1}章`,
        hasNote: !!note?.markdownContent,
        note,
        structureTitle: structChapter?.title,
        structureSummary: structChapter?.summary,
      });
    }
    return list;
  }, [chapters, notes, bookStructure]);

  const getChapterSections = useCallback((chapterIndex: number): SubSection[] => {
    const note = notes.get(chapterIndex);
    if (!note?.markdownContent) return [];
    return parseMarkdownSections(note.markdownContent);
  }, [notes]);

  const getChapterVisualizableCount = useCallback((chapterIndex: number): number => {
    const note = notes.get(chapterIndex);
    if (!note?.markdownContent) return 0;
    return detectVisualizableItems(note.markdownContent).length;
  }, [notes]);

  const toggleChapter = useCallback((index: number) => {
    setExpandedChapter(prev => prev === index ? null : index);
  }, []);

  // 切换视图模式（原文/改写）
  const toggleViewMode = useCallback((chapterIndex: number) => {
    setViewModes(prev => {
      const next = new Map(prev);
      const current = next.get(chapterIndex) || 'rewritten';
      next.set(chapterIndex, current === 'original' ? 'rewritten' : 'original');
      return next;
    });
  }, []);

  const toggleSection = useCallback((sectionKey: string) => {
    setExpandedSections(prev => {
      const next = new Set(prev);
      if (next.has(sectionKey)) {
        next.delete(sectionKey);
      } else {
        next.add(sectionKey);
      }
      return next;
    });
  }, []);

  const activateApp = useCallback((sectionKey: string, item: VisualizableItem) => {
    setActiveApps(prev => {
      const next = new Map(prev);
      next.set(`${sectionKey}-${item.type}-${item.label}`, item);
      return next;
    });
  }, []);

  const deactivateApp = useCallback((appKey: string) => {
    setActiveApps(prev => {
      const next = new Map(prev);
      next.delete(appKey);
      return next;
    });
  }, []);

  // 将可实体化项目发送到节点画布
  const sendToCanvas = useCallback(async (item: VisualizableItem) => {
    try {
      const node = await createNode({
        node_type: item.type,
        title: item.label,
        description: item.description,
        source_content: item.source,
        confidence: item.confidence,
      });
      setCanvasNodes(prev => [...prev, node]);
      setShowNodeCanvas(true);
    } catch (error) {
      console.error('创建节点失败:', error);
    }
  }, [notes]);

  return (
    <div className="note-card-panel">
      {!hideHeader && (
        <div className="note-card-header">
          <h3>章节笔记</h3>
          <div className="note-card-header-actions">
            {onGenerateAll && (
              <button
                className="generate-all-btn"
                onClick={onGenerateAll}
                disabled={isGeneratingStructure}
                title="两阶段整理：先分析全文结构，再逐章填充内容"
              >
                <Sparkles size={14} />
                <span>{isGeneratingStructure ? '整理中...' : '一键整理全部'}</span>
              </button>
            )}
            {canvasNodes.length > 0 && (
              <button 
                className="note-card-canvas-btn" 
                onClick={() => setShowNodeCanvas(!showNodeCanvas)}
                title="打开节点画布"
              >
                <LayoutGrid size={16} />
                <span>{canvasNodes.length}</span>
              </button>
            )}
            {onBack && (
              <button className="note-card-close" onClick={(e) => { e.stopPropagation(); onBack(); }}>
                <X size={16} />
              </button>
            )}
          </div>
        </div>
      )}

      {generateProgress && (
        <div className="generate-progress-bar">
          <div className="generate-progress-text">{generateProgress}</div>
          <div className="generate-progress-track">
            <div className="generate-progress-fill" />
          </div>
        </div>
      )}

      <div className="note-card-list">
        {chapterNotesList.map((chapter) => {
          const isExpanded = expandedChapter === chapter.index;
          const vizCount = getChapterVisualizableCount(chapter.index);
          const sections = isExpanded ? getChapterSections(chapter.index) : [];

          return (
            <div key={chapter.index} className={`chapter-card ${isExpanded ? 'expanded' : ''} ${chapter.index === currentChapter ? 'current' : ''}`}>
              <div
                className="chapter-card-header"
                onClick={() => toggleChapter(chapter.index)}  // 改为单击展开
              >
                <div className="chapter-card-title-row">
                  <span className="chapter-expand-icon">
                    {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                  </span>
                  <span className="chapter-card-title">{chapter.title}</span>
                </div>
                <div className="chapter-card-meta">
                  {vizCount > 0 && (
                    <div className="viz-indicators">
                      {Array.from({ length: vizCount }, (_, i) => (
                        <span key={i} className="viz-dot">{i + 1}</span>
                      ))}
                    </div>
                  )}
                  {/* 已生成笔记时显示"切换原文/改写"按钮，未生成时显示"AI改写"按钮 */}
                  {chapter.hasNote ? (
                    <button
                      className="toggle-view-btn"
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleViewMode(chapter.index);
                      }}
                      title={viewModes.get(chapter.index) === 'original' ? '点击查看改写内容' : '点击查看原文'}
                    >
                      <Eye size={12} />
                      <span>{viewModes.get(chapter.index) === 'original' ? '改写' : '原文'}</span>
                    </button>
                  ) : (
                    <button
                      className="generate-note-btn"
                      onClick={(e) => {
                        e.stopPropagation();
                        onGenerateNote(chapter.index);
                      }}
                      disabled={chapter.note?.isGenerating}
                      title="AI整理此章节"
                    >
                      <Sparkles size={12} />
                    </button>
                  )}
                </div>
              </div>

              {isExpanded && chapter.hasNote && (
                <div className="chapter-card-body">
                  {/* 重新润色按钮 - 在已生成笔记的顶部 */}
                  {onRegenerateNote && viewModes.get(chapter.index) !== 'original' && (
                    <div className="regenerate-note-bar">
                      <button
                        className="regenerate-note-btn"
                        onClick={() => onRegenerateNote(chapter.index)}
                        disabled={chapter.note?.isGenerating}
                        title="重新润色此章节的笔记"
                      >
                        <RefreshCw size={12} className={chapter.note?.isGenerating ? 'spinning' : ''} />
                        <span>{chapter.note?.isGenerating ? '润色中...' : '重新润色'}</span>
                      </button>
                    </div>
                  )}
                  
                  {/* 根据视图模式显示原文或改写内容 */}
                  {viewModes.get(chapter.index) === 'original' ? (
                    <div className="original-text-view">
                      <pre style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word', fontSize: 13, lineHeight: 1.8, color: '#cbd5e1', fontFamily: 'inherit', margin: 0 }}>
                        {chapters[chapter.index]}
                      </pre>
                    </div>
                  ) : (
                    <div className="sections-flow">
                    {sections.map((section, sIdx) => {
                      const sectionKey = `${chapter.index}-${sIdx}`;
                      const isSectionExpanded = expandedSections.has(sectionKey);
                      const hasViz = section.visualizableItems.length > 0;

                      return (
                        <div key={sIdx} className="section-node">
                          {sIdx > 0 && <div className="section-connector" />}
                          <div className={`section-card ${isSectionExpanded ? 'expanded' : ''}`}>
                            <div
                              className="section-card-header"
                              onClick={() => toggleSection(sectionKey)}
                            >
                              <span className="section-level-badge">H{section.level}</span>
                              <span className="section-title">{section.title}</span>
                              {hasViz && (
                                <span className="section-viz-count">
                                  {section.visualizableItems.length}
                                </span>
                              )}
                            </div>

                            {isSectionExpanded && (
                              <div className="section-card-body">
                                <div className="section-markdown">
                                  <ReactMarkdown
                                    remarkPlugins={[remarkGfm, remarkMath]}
                                    rehypePlugins={[rehypeKatex, rehypeRaw, rehypeHighlight]}
                                  >
                                    {section.content}
                                  </ReactMarkdown>
                                </div>

                                {hasViz && (
                                  <div className="section-viz-suggestions">
                                    <div className="viz-label">可实体化:</div>
                                    {section.visualizableItems.map((item, vIdx) => (
                                      <div key={vIdx} className="viz-suggestion-item">
                                        <button
                                          className="viz-suggestion-btn"
                                          onClick={() => activateApp(sectionKey, item)}
                                          style={{
                                            borderColor: typeColors[item.type],
                                            opacity: item.confidence === 'medium' ? 0.7 : 1,
                                          }}
                                        >
                                          {typeIcons[item.type]}
                                          <span>{item.description}</span>
                                          {item.confidence === 'medium' && <span className="viz-confidence-tag">?</span>}
                                        </button>
                                        <button
                                          className="viz-to-canvas-btn"
                                          onClick={() => sendToCanvas(item)}
                                          title="发送到节点画布"
                                        >
                                          <LayoutGrid size={12} />
                                        </button>
                                      </div>
                                    ))}
                                  </div>
                                 )}
                               </div>
                             )}
                           </div>
                         </div>
                       );
                     })}
                    </div>
                  )}
                </div>
              )}

              {isExpanded && !chapter.hasNote && (
                <div className="chapter-card-empty">
                  <p>尚未生成改写内容</p>
                  <button
                    className="generate-note-btn-full"
                    onClick={() => onGenerateNote(chapter.index)}
                    disabled={chapter.note?.isGenerating}
                  >
                    <Sparkles size={14} />
                    <span>{chapter.note?.isGenerating ? 'AI改写中...' : 'AI改写'}</span>
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {activeApps.size > 0 && (
        <div className="active-apps-panel">
          <div className="active-apps-header">
            <span>应用面板</span>
          </div>
          <div className="active-apps-list">
            {Array.from(activeApps.entries()).map(([key, item]) => (
              <div key={key} className="active-app-card" style={{ borderLeftColor: typeColors[item.type] }}>
                <div className="active-app-header">
                  <span className="active-app-title">{item.label}</span>
                  <button className="active-app-close" onClick={() => deactivateApp(key)}>
                    <X size={12} />
                  </button>
                </div>
                <div className="active-app-body">
                  <div className="active-app-type-badge" style={{ color: typeColors[item.type] }}>
                    {typeIcons[item.type]}
                    <span>{item.description}</span>
                  </div>
                  <div className="active-app-source">
                    <pre>{item.source.substring(0, 200)}{item.source.length > 200 ? '...' : ''}</pre>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 节点画布 */}
      {showNodeCanvas && (
        <div className="node-canvas-overlay">
          <Suspense fallback={<div>加载节点图...</div>}>
            <NodeCanvas
              initialNodes={canvasNodes}
              onClose={() => setShowNodeCanvas(false)}
            />
          </Suspense>
        </div>
      )}
    </div>
  );
};

export default NoteCardPanel;
