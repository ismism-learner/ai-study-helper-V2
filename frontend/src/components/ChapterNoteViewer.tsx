import React, { useState, useRef, useCallback, useEffect, lazy, Suspense } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import rehypeRaw from 'rehype-raw';
import rehypeHighlight from 'rehype-highlight';
import { Eye, FileText, ChevronDown, Copy, Check, Download, Edit3, Save, X, List, Trash2 } from 'lucide-react';
import { chapterNoteApi, ChapterNote } from '../api/chapterNotes';
import ExecutableCodeBlock from './ExecutableCodeBlock';

const FinancialChartBlock = lazy(() => import('./FinancialChartBlock'));
const JSXGraphBlock = lazy(() => import('./JSXGraphBlock'));
const ThreeJSBlock = lazy(() => import('./ThreeJSBlock'));
import 'katex/dist/katex.min.css';
import 'highlight.js/styles/github-dark.css';

interface ChapterNoteViewerProps {
  chapterTitle: string;
  originalText: string;
  markdownContent: string | null;
  isGenerating: boolean;
  onBack: () => void;
  onMarkdownChange?: (md: string) => void;
  bookId?: string;
  noteId?: string | null;
}

const ChapterNoteViewer: React.FC<ChapterNoteViewerProps> = ({
  chapterTitle,
  originalText,
  markdownContent,
  isGenerating,
  onBack,
  onMarkdownChange,
  bookId,
  noteId,
}) => {
  const [viewMode, setViewMode] = useState<'split' | 'note' | 'original'>('note');
  const [splitRatio, setSplitRatio] = useState(0.5);
  const [isDraggingSplit, setIsDraggingSplit] = useState(false);
  const [copied, setCopied] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editContent, setEditContent] = useState('');
  const [showNoteList, setShowNoteList] = useState(false);
  const [savedNotes, setSavedNotes] = useState<ChapterNote[]>([]);
  const [activeNoteId, setActiveNoteId] = useState<string | null>(null);
  const [activeNoteMarkdown, setActiveNoteMarkdown] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (markdownContent && isEditing) {
      setEditContent(markdownContent);
    }
  }, [markdownContent, isEditing]);

  useEffect(() => {
    if (noteId) {
      setActiveNoteId(noteId);
      setActiveNoteMarkdown(null);
    } else {
      setActiveNoteId(null);
      setActiveNoteMarkdown(null);
    }
  }, [noteId]);

  const displayContent = activeNoteMarkdown || markdownContent;

  const loadSavedNotes = useCallback(async () => {
    if (!bookId) return;
    try {
      const response = await chapterNoteApi.list({ book_id: bookId, status: 'completed' });
      setSavedNotes(response.data);
    } catch (e) {
      console.error('Failed to load notes:', e);
    }
  }, [bookId]);

  useEffect(() => {
    if (showNoteList) {
      loadSavedNotes();
    }
  }, [showNoteList, loadSavedNotes]);

  const handleSplitDragStart = useCallback((e: React.PointerEvent) => {
    e.preventDefault();
    setIsDraggingSplit(true);
  }, []);

  const handleSplitDrag = useCallback((e: React.PointerEvent) => {
    if (!isDraggingSplit || !containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const ratio = (e.clientY - rect.top) / rect.height;
    setSplitRatio(Math.max(0.2, Math.min(0.8, ratio)));
  }, [isDraggingSplit]);

  const handleSplitDragEnd = useCallback(() => {
    setIsDraggingSplit(false);
  }, []);

  const handleCopy = useCallback(async () => {
    if (displayContent) {
      await navigator.clipboard.writeText(displayContent);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }, [displayContent]);

  const handleExport = useCallback(async () => {
    try {
      let content: string;
      if (bookId) {
        const response = await chapterNoteApi.export({ book_id: bookId });
        content = response.data.content;
      } else if (displayContent) {
        content = `# ${chapterTitle}\n\n${displayContent}`;
      } else {
        return;
      }

      const blob = new Blob([content], { type: 'text/markdown;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${chapterTitle.replace(/[\\/:*?"<>|]/g, '_')}_笔记.md`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (e) {
      console.error('Export failed:', e);
      if (displayContent) {
        const content = `# ${chapterTitle}\n\n${displayContent}`;
        const blob = new Blob([content], { type: 'text/markdown;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${chapterTitle.replace(/[\\/:*?"<>|]/g, '_')}_笔记.md`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }
    }
  }, [bookId, chapterTitle, displayContent]);

  const handleSaveEdit = useCallback(async () => {
    if (onMarkdownChange) {
      onMarkdownChange(editContent);
    }
    if (activeNoteId) {
      try {
        await chapterNoteApi.update(activeNoteId, { markdown_content: editContent });
        setActiveNoteMarkdown(editContent);
      } catch (e) {
        console.error('Failed to save note:', e);
      }
    }
    setIsEditing(false);
  }, [editContent, onMarkdownChange, activeNoteId]);

  const handleCancelEdit = useCallback(() => {
    setEditContent(displayContent || '');
    setIsEditing(false);
  }, [displayContent]);

  const handleDeleteNote = useCallback(async (noteId: string) => {
    try {
      await chapterNoteApi.delete(noteId);
      setSavedNotes(prev => prev.filter(n => n.id !== noteId));
      if (activeNoteId === noteId) {
        setActiveNoteId(null);
        setActiveNoteMarkdown(null);
      }
    } catch (e) {
      console.error('Failed to delete note:', e);
    }
  }, [activeNoteId]);

  const handleSelectNote = useCallback(async (note: ChapterNote) => {
    setActiveNoteId(note.id);
    setActiveNoteMarkdown(note.markdown_content || '');
    if (onMarkdownChange) {
      onMarkdownChange(note.markdown_content || '');
    }
    setShowNoteList(false);
  }, [onMarkdownChange]);

  const renderMarkdown = (content: string) => (
    <div className="chapter-note-markdown">
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMath]}
        rehypePlugins={[rehypeKatex, rehypeRaw, rehypeHighlight]}
        components={{
          h1: ({ children }) => <h1 style={{ fontSize: '1.5em', borderBottom: '1px solid var(--border-color)', paddingBottom: 8, marginBottom: 16, color: 'var(--text-primary)' }}>{children}</h1>,
          h2: ({ children }) => <h2 style={{ fontSize: '1.3em', borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: 6, marginBottom: 12, marginTop: 24, color: 'var(--text-primary)' }}>{children}</h2>,
          h3: ({ children }) => <h3 style={{ fontSize: '1.1em', marginBottom: 8, marginTop: 16, color: '#cbd5e1' }}>{children}</h3>,
          p: ({ children }) => <p style={{ lineHeight: 1.8, marginBottom: 12, color: '#cbd5e1' }}>{children}</p>,
          ul: ({ children }) => <ul style={{ paddingLeft: 20, marginBottom: 12, color: '#cbd5e1' }}>{children}</ul>,
          ol: ({ children }) => <ol style={{ paddingLeft: 20, marginBottom: 12, color: '#cbd5e1' }}>{children}</ol>,
          li: ({ children }) => <li style={{ marginBottom: 4, lineHeight: 1.7 }}>{children}</li>,
          blockquote: ({ children }) => <blockquote style={{ borderLeft: '3px solid var(--accent-500)', paddingLeft: 16, margin: '12px 0', color: 'var(--text-secondary)', fontStyle: 'italic' }}>{children}</blockquote>,
          code: ({ className, children, ...props }) => {
            const isInline = !className;
            if (isInline) {
              return <code style={{ background: 'rgba(139, 92, 246, 0.15)', padding: '2px 6px', borderRadius: 4, fontSize: '0.9em', color: '#c4b5fd' }} {...props}>{children}</code>;
            }
            return (
              <code className={className} {...props} style={{ fontSize: '0.85em' }}>
                {children}
              </code>
            );
          },
          pre: ({ children }) => {
            // Extract language and code content from the child <code> element
            const codeChild = React.Children.toArray(children).find(
              (child): child is React.ReactElement<{ className?: string; children?: React.ReactNode }> =>
                React.isValidElement(child)
            );

            const className = (codeChild?.props as Record<string, unknown> | undefined)?.className as string | undefined || '';
            const langMatch = className.match(/language-(\w+)/);
            const language = langMatch ? langMatch[1] : '';

            // Recursively extract text from React children (rehype-highlight may wrap text in <span>s)
            const extractText = (node: React.ReactNode): string => {
              if (typeof node === 'string') return node;
              if (typeof node === 'number') return String(node);
              if (Array.isArray(node)) return node.map(extractText).join('');
              if (React.isValidElement(node) && node.props.children) {
                return extractText(node.props.children);
              }
              return '';
            };

            const codeContent = codeChild?.props?.children
              ? extractText(codeChild.props.children).replace(/\n$/, '')
              : '';

            // Route special languages to dedicated interactive components
            if (language === 'python' || language === 'py') {
              return <ExecutableCodeBlock code={codeContent} language={language} />;
            }
            if (language === 'chart') {
              return <Suspense fallback={<div>加载图表...</div>}><FinancialChartBlock data={codeContent} /></Suspense>;
            }
            if (language === 'jsxgraph') {
              return <Suspense fallback={<div>加载图形...</div>}><JSXGraphBlock config={codeContent} /></Suspense>;
            }
            if (language === 'threejs') {
              return <Suspense fallback={<div>加载3D场景...</div>}><ThreeJSBlock config={codeContent} /></Suspense>;
            }

            // Default: render as normal code block
            return (
              <pre style={{
                background: '#1e1b2e',
                border: '1px solid rgba(139, 92, 246, 0.2)',
                borderRadius: 8,
                padding: 16,
                marginBottom: 16,
                overflowX: 'auto',
                fontSize: '0.85em',
                lineHeight: 1.6,
              }}>
                {children}
              </pre>
            );
          },
          table: ({ children }) => (
            <div style={{ overflowX: 'auto', marginBottom: 16 }}>
              <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: '0.9em' }}>{children}</table>
            </div>
          ),
          th: ({ children }) => (
            <th style={{ border: '1px solid var(--border-color)', padding: '8px 12px', background: 'rgba(139, 92, 246, 0.1)', color: 'var(--text-primary)', textAlign: 'left' }}>{children}</th>
          ),
          td: ({ children }) => (
            <td style={{ border: '1px solid var(--border-color)', padding: '8px 12px', color: '#cbd5e1' }}>{children}</td>
          ),
          strong: ({ children }) => <strong style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{children}</strong>,
          em: ({ children }) => <em style={{ color: '#a78bfa' }}>{children}</em>,
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );

  return (
    <div className="chapter-note-viewer" ref={containerRef} onPointerMove={handleSplitDrag} onPointerUp={handleSplitDragEnd} onPointerLeave={handleSplitDragEnd}>
      <div className="chapter-note-viewer-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button className="btn-back" onClick={onBack} style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', padding: '4px 8px', fontSize: 13 }}>
            ← 返回OCR
          </button>
          <span style={{ color: 'var(--text-muted)' }}>|</span>
          <h3 style={{ margin: 0, fontSize: 14, color: 'var(--text-primary)' }}>{chapterTitle}</h3>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {bookId && (
            <button
              className={`view-mode-btn ${showNoteList ? 'active' : ''}`}
              onClick={() => setShowNoteList(!showNoteList)}
              title="历史笔记列表"
            >
              <List size={14} />
              笔记列表
            </button>
          )}
          <button
            className={`view-mode-btn ${viewMode === 'note' ? 'active' : ''}`}
            onClick={() => { setViewMode('note'); setIsEditing(false); }}
            title="仅查看笔记"
          >
            <Eye size={14} />
            笔记
          </button>
          <button
            className={`view-mode-btn ${viewMode === 'original' ? 'active' : ''}`}
            onClick={() => { setViewMode('original'); setIsEditing(false); }}
            title="仅查看原文"
          >
            <FileText size={14} />
            原文
          </button>
          <button
            className={`view-mode-btn ${viewMode === 'split' ? 'active' : ''}`}
            onClick={() => { setViewMode('split'); setIsEditing(false); }}
            title="上下分栏对比"
          >
            <ChevronDown size={14} />
            分栏
          </button>
          {displayContent && !isEditing && viewMode === 'note' && (
            <button
              className="view-mode-btn"
              onClick={() => { setEditContent(displayContent); setIsEditing(true); }}
              title="编辑Markdown"
            >
              <Edit3 size={14} />
              编辑
            </button>
          )}
          {isEditing && (
            <>
              <button
                className="view-mode-btn"
                onClick={handleSaveEdit}
                title="保存修改"
                style={{ background: 'rgba(16, 185, 129, 0.2)', borderColor: 'rgba(16, 185, 129, 0.4)', color: 'var(--success-500)' }}
              >
                <Save size={14} />
                保存
              </button>
              <button
                className="view-mode-btn"
                onClick={handleCancelEdit}
                title="取消编辑"
              >
                <X size={14} />
                取消
              </button>
            </>
          )}
          {displayContent && (
            <>
              <button
                className="view-mode-btn"
                onClick={handleCopy}
                title="复制Markdown内容"
              >
                {copied ? <Check size={14} /> : <Copy size={14} />}
                {copied ? '已复制' : '复制'}
              </button>
              <button
                className="view-mode-btn"
                onClick={handleExport}
                title="导出为Markdown文件"
                style={{ background: 'rgba(59, 130, 246, 0.15)', borderColor: 'rgba(59, 130, 246, 0.3)', color: '#60a5fa' }}
              >
                <Download size={14} />
                导出
              </button>
            </>
          )}
        </div>
      </div>

      {showNoteList && (
        <div className="chapter-note-list-panel" style={{ maxHeight: 200, overflowY: 'auto', borderBottom: '1px solid var(--border-color)', background: 'rgba(0,0,0,0.2)' }}>
          {savedNotes.length === 0 ? (
            <div style={{ padding: 16, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>暂无历史笔记</div>
          ) : (
            savedNotes.map(note => (
              <div
                key={note.id}
                className={`chapter-note-list-item ${activeNoteId === note.id ? 'active' : ''}`}
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '8px 16px', cursor: 'pointer', fontSize: 13,
                  background: activeNoteId === note.id ? 'rgba(139, 92, 246, 0.15)' : 'transparent',
                  borderBottom: '1px solid rgba(255,255,255,0.05)',
                  transition: 'background 0.15s',
                }}
                onClick={() => handleSelectNote(note)}
                onMouseEnter={e => { if (activeNoteId !== note.id) e.currentTarget.style.background = 'rgba(255,255,255,0.05)'; }}
                onMouseLeave={e => { if (activeNoteId !== note.id) e.currentTarget.style.background = 'transparent'; }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
<div style={{ color: 'var(--text-primary)', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{note.chapter_title}</div>
                   <div style={{ color: 'var(--text-muted)', fontSize: 11, marginTop: 2 }}>
                    {new Date(note.updated_at).toLocaleString('zh-CN')}
                  </div>
                </div>
<button
                   onClick={e => { e.stopPropagation(); handleDeleteNote(note.id); }}
                   style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: 4, borderRadius: 4, display: 'flex', alignItems: 'center' }}
                   title="删除笔记"
                   onMouseEnter={e => e.currentTarget.style.color = 'var(--danger-500)'}
                   onMouseLeave={e => e.currentTarget.style.color = 'var(--text-muted)'}
                 >
                  <Trash2 size={14} />
                </button>
              </div>
            ))
          )}
        </div>
      )}

      <div className="chapter-note-viewer-content">
        {isGenerating && !displayContent && (
          <div className="chapter-note-generating">
            <div className="generating-spinner" />
            <p>AI 正在整理笔记...</p>
            <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>将OCR文本整理为结构清晰的Markdown笔记</p>
          </div>
        )}

        {isEditing && viewMode === 'note' ? (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', height: '100%' }}>
            <textarea
              value={editContent}
              onChange={e => setEditContent(e.target.value)}
style={{
                 flex: 1, width: '100%', padding: 16, background: '#0f172a', color: 'var(--text-primary)',
                 border: 'none', outline: 'none', resize: 'none', fontSize: 14, lineHeight: 1.8,
                 fontFamily: '"Cascadia Code", "Fira Code", "Consolas", monospace',
               }}
              placeholder="在此编辑Markdown内容..."
            />
          </div>
        ) : (
          <>
            {viewMode === 'note' && (
              <div className="chapter-note-note-view" style={{ padding: 20, overflowY: 'auto', height: '100%' }}>
                {displayContent ? renderMarkdown(displayContent) : (
                  <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: 40 }}>
                    {isGenerating ? '正在生成...' : '暂无笔记内容'}
                  </div>
                )}
              </div>
            )}

            {viewMode === 'original' && (
              <div className="chapter-note-original-view" style={{ padding: 20, overflowY: 'auto', height: '100%' }}>
                <pre style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word', fontSize: 13, lineHeight: 1.8, color: '#cbd5e1', fontFamily: 'inherit' }}>
                  {originalText}
                </pre>
              </div>
            )}

            {viewMode === 'split' && (
              <div className="chapter-note-split-view" style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
                <div style={{ flex: splitRatio, overflowY: 'auto', padding: 20, borderBottom: '2px solid var(--border-color)' }}>
                  <div style={{ fontSize: 11, color: 'var(--accent-500)', fontWeight: 600, marginBottom: 8, textTransform: 'uppercase', letterSpacing: 1 }}>
                    AI 整理笔记
                  </div>
                  {displayContent ? renderMarkdown(displayContent) : (
                    <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: 20 }}>
                      {isGenerating ? '正在生成...' : '暂无笔记内容'}
                    </div>
                  )}
                </div>
                <div
                  className="split-divider"
                  onPointerDown={handleSplitDragStart}
                  style={{
                    height: 6, background: isDraggingSplit ? 'var(--primary-color)' : 'var(--border-color)',
                    cursor: 'row-resize', display: 'flex', alignItems: 'center', justifyContent: 'center',
                    transition: 'background 0.2s', flexShrink: 0,
                  }}
                >
                  <div style={{ display: 'flex', gap: 2 }}>
<div style={{ width: 4, height: 4, borderRadius: '50%', background: isDraggingSplit ? '#fff' : 'var(--text-muted)' }} />
                     <div style={{ width: 4, height: 4, borderRadius: '50%', background: isDraggingSplit ? '#fff' : 'var(--text-muted)' }} />
                     <div style={{ width: 4, height: 4, borderRadius: '50%', background: isDraggingSplit ? '#fff' : 'var(--text-muted)' }} />
                  </div>
                </div>
                <div style={{ flex: 1 - splitRatio, overflowY: 'auto', padding: 20 }}>
<div style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600, marginBottom: 8, textTransform: 'uppercase', letterSpacing: 1 }}>
                     OCR 原始文本
                   </div>
                   <pre style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word', fontSize: 13, lineHeight: 1.8, color: 'var(--text-secondary)', fontFamily: 'inherit' }}>
                    {originalText}
                  </pre>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default ChapterNoteViewer;
