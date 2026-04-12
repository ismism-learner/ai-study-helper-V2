import React, { useState, useCallback, useRef, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeRaw from 'rehype-raw';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import 'katex/dist/katex.min.css';
import { Document, Highlight, CreateHighlightRequest } from '../types';
import { highlightApi, documentApi, optimizeApi } from '../api';
import { Save, X, RefreshCw, Sparkles, Check, Bookmark } from 'lucide-react';

interface FrameworkViewProps {
  document: Document;
  onGenerate?: () => void;
  isGenerating?: boolean;
  streamingContent?: string;
  generatingDocumentId?: string | null;
  generatingDocIds?: Set<string>;
  streamingContents?: Map<string, string>;
  onHighlightCreated?: (highlight: Highlight) => void;
  onHighlightDeleted?: (id: string) => void;
  onFrameworkUpdate?: (doc: Document) => void;
  isDeleteMode?: boolean;
}

interface Selection {
  text: string;
  startOffset: number;
  endOffset: number;
  position: { x: number; y: number };
}

interface HighlightMenu {
  highlight: Highlight;
  position: { x: number; y: number };
}

interface ExplanationPopup {
  highlight: Highlight;
  position: { x: number; y: number };
  isPinned: boolean;
}

interface ParagraphOptimizeState {
  id: string;
  originalText: string;
  optimizedText: string | null;
  isProcessing: boolean;
  showComparison: boolean;
  selectedVersion: 'original' | 'optimized';
  editedOriginal: string;
  editedOptimized: string;
  streamingContent: string;
  streamStatus: 'idle' | 'streaming' | 'done' | 'error';
  errorMessage: string | null;
}

const parseParagraphs = (content: string): string[] => {
  const lines = content.split('\n');
  const paragraphs: string[] = [];
  let currentParagraph = '';

  for (const line of lines) {
    const trimmedLine = line.trim();
    if (trimmedLine === '') {
      if (currentParagraph.trim()) {
        paragraphs.push(currentParagraph.trim());
        currentParagraph = '';
      }
    } else {
      if (currentParagraph) {
        currentParagraph += '\n' + line;
      } else {
        currentParagraph = line;
      }
    }
  }

  if (currentParagraph.trim()) {
    paragraphs.push(currentParagraph.trim());
  }

  return paragraphs;
};

const paragraphsToContent = (paragraphs: string[]): string => {
  return paragraphs.filter(p => p.trim()).join('\n\n');
};

const FrameworkView: React.FC<FrameworkViewProps> = ({
  document,
  onGenerate,
  isGenerating,
  streamingContent,
  generatingDocumentId,
  generatingDocIds: _generatingDocIds = new Set(),
  streamingContents: _streamingContents = new Map(),
  onHighlightCreated,
  onHighlightDeleted,
  onFrameworkUpdate,
  isDeleteMode: externalIsDeleteMode = false,
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const [editedContent, setEditedContent] = useState(document.framework_content || '');
  const [isSaving, setIsSaving] = useState(false);
  const [selection, setSelection] = useState<Selection | null>(null);
  const [highlightType, setHighlightType] = useState<'explanation' | 'keyword' | 'tag'>('keyword');
  const [savingHighlight, setSavingHighlight] = useState(false);
  const [currentHighlights, setCurrentHighlights] = useState<Highlight[]>([]);
  const [highlightMenu, setHighlightMenu] = useState<HighlightMenu | null>(null);
  const [generatingExplanation, setGeneratingExplanation] = useState(false);
  const [explanationPopup, setExplanationPopup] = useState<ExplanationPopup | null>(null);
  const hoverTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const paragraphRefsRef = useRef<Map<string, HTMLDivElement>>(new Map());
  const [markedParagraphId, setMarkedParagraphId] = useState<string | null>(null);
  const [selectedParagraphId, setSelectedParagraphId] = useState<string | null>(null);
  const lastEditedParagraphIdRef = useRef<string | null>(null);
  const prevIsDeleteModeRef = useRef<boolean>(false);

  const [paragraphStates, setParagraphStates] = useState<Map<string, ParagraphOptimizeState>>(new Map());
  const [editingParagraphId, setEditingParagraphId] = useState<string | null>(null);
  const [editingParagraphText, setEditingParagraphText] = useState<string>('');

  const isDeleteMode = externalIsDeleteMode;

  const handleMarkParagraph = useCallback((paragraphId: string) => {
    setMarkedParagraphId(prev => prev === paragraphId ? null : paragraphId);
  }, []);

  useEffect(() => {
    if (prevIsDeleteModeRef.current !== isDeleteMode) {
      if (isDeleteMode && markedParagraphId) {
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            const paragraphElement = paragraphRefsRef.current.get(markedParagraphId);
            if (paragraphElement) {
              paragraphElement.scrollIntoView({ behavior: 'instant', block: 'center' });
            }
          });
        });
      } else if (!isDeleteMode && lastEditedParagraphIdRef.current) {
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            const paragraphElement = paragraphRefsRef.current.get(lastEditedParagraphIdRef.current!);
            if (paragraphElement) {
              paragraphElement.scrollIntoView({ behavior: 'instant', block: 'center' });
            }
          });
        });
      }
      prevIsDeleteModeRef.current = isDeleteMode;
    }
  }, [isDeleteMode, markedParagraphId]);

  const registerParagraphRef = useCallback((paragraphId: string) => {
    return (element: HTMLDivElement | null) => {
      if (element) {
        paragraphRefsRef.current.set(paragraphId, element);
      } else {
        paragraphRefsRef.current.delete(paragraphId);
      }
    };
  }, []);

  useEffect(() => {
    setEditedContent(document.framework_content || '');
    setCurrentHighlights(document.highlights || []);
  }, [document.id, document.framework_content, JSON.stringify(document.highlights)]);

  const handleMouseUp = useCallback((_e: React.MouseEvent) => {
    if (isEditing) return;

    const selectedText = window.getSelection();
    if (!selectedText || selectedText.toString().trim() === '') {
      setSelection(null);
      return;
    }

    const text = selectedText.toString().trim();
    if (text.length < 2) {
      setSelection(null);
      return;
    }

    const range = selectedText.getRangeAt(0);
    const preCaretRange = range.cloneRange();
    const contentElement = contentRef.current;

    if (!contentElement) {
      setSelection(null);
      return;
    }

    preCaretRange.selectNodeContents(contentElement);
    preCaretRange.setEnd(range.startContainer, range.startOffset);
    const startOffset = preCaretRange.toString().length;
    const endOffset = startOffset + text.length;

    const rect = range.getBoundingClientRect();
    setSelection({
      text,
      startOffset,
      endOffset,
      position: {
        x: rect.left + rect.width / 2,
        y: rect.top - 10,
      },
    });
  }, [isEditing]);

  const handleCreateHighlight = async () => {
    if (!selection) return;

    const isAlreadyHighlighted = currentHighlights.some(
      h => h.highlighted_text === selection.text
    );
    
    if (isAlreadyHighlighted) {
      alert('该文本已经被高亮标记过了');
      setSelection(null);
      window.getSelection()?.removeAllRanges();
      return;
    }

    setSavingHighlight(true);
    try {
      const data: CreateHighlightRequest = {
        highlighted_text: selection.text,
        start_offset: selection.startOffset,
        end_offset: selection.endOffset,
        highlight_type: highlightType,
      };
      const response = await highlightApi.create(document.id, data);
      let newHighlight = response.data;

      if (highlightType === 'explanation') {
        const explainResponse = await highlightApi.explain({
          highlight_id: newHighlight.id,
        });
        newHighlight = {
          ...newHighlight,
          explanation: explainResponse.data.explanation,
        };
      }

      setCurrentHighlights(prev => [...prev, newHighlight]);
      onHighlightCreated?.(newHighlight);
      setSelection(null);
      window.getSelection()?.removeAllRanges();
    } catch (error) {
      console.error('Failed to create highlight:', error);
      alert('创建标记失败');
    } finally {
      setSavingHighlight(false);
    }
  };

  const handleSaveEdit = async () => {
    setIsSaving(true);
    try {
      await documentApi.update(document.id, { framework_content: editedContent });
      setIsEditing(false);
      if (onFrameworkUpdate) {
        onFrameworkUpdate({ ...document, framework_content: editedContent });
      }
    } catch (error) {
      console.error('Failed to save:', error);
      alert('保存失败');
    } finally {
      setIsSaving(false);
    }
  };

  const handleOptimizeParagraph = useCallback(async (paragraphId: string, paragraphText: string) => {
    lastEditedParagraphIdRef.current = paragraphId;
    setSelectedParagraphId(paragraphId);
    setParagraphStates(prev => {
      const newMap = new Map(prev);
      newMap.set(paragraphId, {
        id: paragraphId,
        originalText: paragraphText,
        optimizedText: null,
        isProcessing: true,
        showComparison: true,
        selectedVersion: 'original',
        editedOriginal: paragraphText,
        editedOptimized: '',
        streamingContent: '',
        streamStatus: 'idle',
        errorMessage: null,
      });
      return newMap;
    });

    let fullContent = '';
    
    try {
      await optimizeApi.optimizeParagraphStream(
        paragraphText,
        (chunk: string) => {
          fullContent += chunk;
          setParagraphStates(prev => {
            const newMap = new Map(prev);
            const existing = newMap.get(paragraphId);
            if (existing) {
              newMap.set(paragraphId, {
                ...existing,
                streamingContent: fullContent,
                streamStatus: 'streaming',
              });
            }
            return newMap;
          });
        },
        (finalContent: string) => {
          setParagraphStates(prev => {
            const newMap = new Map(prev);
            const existing = newMap.get(paragraphId);
            if (existing) {
              newMap.set(paragraphId, {
                ...existing,
                optimizedText: finalContent,
                editedOptimized: finalContent,
                isProcessing: false,
                streamingContent: '',
                streamStatus: 'done',
                selectedVersion: 'optimized',
              });
            }
            return newMap;
          });
        },
        (error: string) => {
          console.error('Failed to optimize paragraph:', error);
          setParagraphStates(prev => {
            const newMap = new Map(prev);
            const existing = newMap.get(paragraphId);
            if (existing) {
              newMap.set(paragraphId, {
                ...existing,
                isProcessing: false,
                streamStatus: 'error',
                errorMessage: error,
              });
            }
            return newMap;
          });
        }
      );
    } catch (error) {
      console.error('Failed to optimize paragraph:', error);
      setParagraphStates(prev => {
        const newMap = new Map(prev);
        const existing = newMap.get(paragraphId);
        if (existing) {
          newMap.set(paragraphId, {
            ...existing,
            isProcessing: false,
            streamStatus: 'error',
            errorMessage: error instanceof Error ? error.message : '未知错误',
          });
        }
        return newMap;
      });
    }
  }, []);

  const handleSelectVersion = useCallback((paragraphId: string, version: 'original' | 'optimized') => {
    setParagraphStates(prev => {
      const newMap = new Map(prev);
      const existing = newMap.get(paragraphId);
      if (existing) {
        newMap.set(paragraphId, {
          ...existing,
          selectedVersion: version,
        });
      }
      return newMap;
    });
  }, []);

  const handleEditOriginal = useCallback((paragraphId: string, text: string) => {
    setParagraphStates(prev => {
      const newMap = new Map(prev);
      const existing = newMap.get(paragraphId);
      if (existing) {
        newMap.set(paragraphId, {
          ...existing,
          editedOriginal: text,
        });
      }
      return newMap;
    });
  }, []);

  const handleEditOptimized = useCallback((paragraphId: string, text: string) => {
    setParagraphStates(prev => {
      const newMap = new Map(prev);
      const existing = newMap.get(paragraphId);
      if (existing) {
        newMap.set(paragraphId, {
          ...existing,
          editedOptimized: text,
        });
      }
      return newMap;
    });
  }, []);

  const handleConfirmOptimize = useCallback(async (paragraphId: string, paragraphIndex: number) => {
    const state = paragraphStates.get(paragraphId);
    if (!state || !document.framework_content) return;

    const finalText = state.selectedVersion === 'original' 
      ? state.editedOriginal 
      : state.editedOptimized;

    const paragraphs = parseParagraphs(document.framework_content);
    const newParagraphs = [...paragraphs];
    newParagraphs[paragraphIndex] = finalText;
    const newContent = paragraphsToContent(newParagraphs);

    try {
      await documentApi.update(document.id, { framework_content: newContent });
      setEditedContent(newContent);
      if (onFrameworkUpdate) {
        onFrameworkUpdate({ ...document, framework_content: newContent });
      }
      setParagraphStates(prev => {
        const newMap = new Map(prev);
        newMap.delete(paragraphId);
        return newMap;
      });
    } catch (error) {
      console.error('Failed to save:', error);
      alert('保存失败，请重试');
    }
  }, [paragraphStates, document, onFrameworkUpdate]);

  const handleCancelOptimize = useCallback((paragraphId: string) => {
    setParagraphStates(prev => {
      const newMap = new Map(prev);
      newMap.delete(paragraphId);
      return newMap;
    });
  }, []);

  const handleStartEditParagraph = useCallback((paragraphId: string, text: string) => {
    lastEditedParagraphIdRef.current = paragraphId;
    setSelectedParagraphId(paragraphId);
    setEditingParagraphId(paragraphId);
    setEditingParagraphText(text);
  }, []);

  const handleSaveParagraphEdit = useCallback(async (paragraphIndex: number) => {
    if (!document.framework_content) return;

    const paragraphs = parseParagraphs(document.framework_content);
    const newParagraphs = [...paragraphs];
    newParagraphs[paragraphIndex] = editingParagraphText;
    const newContent = paragraphsToContent(newParagraphs);

    try {
      await documentApi.update(document.id, { framework_content: newContent });
      setEditedContent(newContent);
      if (onFrameworkUpdate) {
        onFrameworkUpdate({ ...document, framework_content: newContent });
      }
      setEditingParagraphId(null);
      setEditingParagraphText('');
    } catch (error) {
      console.error('Failed to save:', error);
      alert('保存失败，请重试');
    }
  }, [editingParagraphText, document, onFrameworkUpdate]);

  const handleCancelParagraphEdit = useCallback(() => {
    setEditingParagraphId(null);
    setEditingParagraphText('');
  }, []);

  const framework = document.framework_content;

  const renderContent = () => {
    const isCurrentDocumentGenerating = isGenerating && generatingDocumentId === document.id;
    
    if (isCurrentDocumentGenerating) {
      return (
        <div className="framework-streaming">
          <div className="streaming-indicator">
            <RefreshCw size={16} className="spinning" />
            <span>正在生成...</span>
          </div>
          {streamingContent && (
            <div className="streaming-content">
              <ReactMarkdown remarkPlugins={[remarkGfm, remarkMath]} rehypePlugins={[rehypeRaw, rehypeKatex]}>
                {streamingContent}
              </ReactMarkdown>
            </div>
          )}
        </div>
      );
    }

    if (!framework) return null;

    if (isEditing) {
      return (
        <textarea
          className="input textarea"
          style={{ minHeight: 400, fontFamily: 'inherit' }}
          value={editedContent}
          onChange={(e) => setEditedContent(e.target.value)}
        />
      );
    }

    const paragraphs = parseParagraphs(framework);

    return (
      <div className="framework-paragraphs">
        {paragraphs.map((paragraph, index) => {
          const paragraphId = `para-${index}`;
          const state = paragraphStates.get(paragraphId);

          if (isDeleteMode) {
            return (
              <div 
                key={paragraphId} 
                className={`framework-paragraph-container ${selectedParagraphId === paragraphId ? 'paragraph-selected' : ''}`}
                ref={registerParagraphRef(paragraphId)}
              >
                <div 
                  className="paragraph-header"
                  onClick={() => { 
                    lastEditedParagraphIdRef.current = paragraphId;
                    setSelectedParagraphId(paragraphId);
                  }}
                  style={{ cursor: 'pointer' }}
                  title="点击标记此段落，退出删改模式时将定位到此处"
                >
                  <button
                    className="optimize-btn"
                    onClick={(e) => { e.stopPropagation(); handleOptimizeParagraph(paragraphId, paragraph); }}
                    disabled={state?.isProcessing}
                    title="删改"
                  >
                    <Sparkles size={14} />
                    <span className="optimize-btn-text">删改</span>
                  </button>
                  {selectedParagraphId === paragraphId && (
                    <span className="paragraph-selected-indicator">
                      <Bookmark size={12} />
                      已选中
                    </span>
                  )}
                </div>

                {state?.showComparison ? (
                  <div className="comparison-container">
                    <div className="comparison-header">
                      <span className="comparison-title">文本对比</span>
                      {state.isProcessing && (
                        <span className="processing-indicator">
                          <RefreshCw size={14} className="spinning" />
                          AI处理中...
                        </span>
                      )}
                    </div>

                    <div className="comparison-panels">
                      <div className={`comparison-panel ${state.selectedVersion === 'original' ? 'selected' : ''}`}>
                        <div className="panel-header">
                          <span className="panel-label">原文</span>
                          <button
                            className={`select-btn ${state.selectedVersion === 'original' ? 'active' : ''}`}
                            onClick={() => handleSelectVersion(paragraphId, 'original')}
                          >
                            {state.selectedVersion === 'original' ? <Check size={14} /> : <X size={14} />}
                            {state.selectedVersion === 'original' ? '已选择' : '选择'}
                          </button>
                        </div>
                        <textarea
                          className="panel-textarea"
                          value={state.editedOriginal}
                          onChange={(e) => handleEditOriginal(paragraphId, e.target.value)}
                          disabled={state.isProcessing}
                        />
                      </div>

                      <div className={`comparison-panel ${state.selectedVersion === 'optimized' ? 'selected' : ''}`}>
                        <div className="panel-header">
                          <span className="panel-label">
                            AI优化
                            {state.streamStatus === 'streaming' && (
                              <span style={{ 
                                marginLeft: 8, 
                                fontSize: 11, 
                                color: 'var(--success-500)',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: 4
                              }}>
                                <span style={{
                                  width: 6,
                                  height: 6,
                                  borderRadius: '50%',
                                  background: 'var(--success-500)',
                                  animation: 'pulse 1s infinite'
                                }} />
                                流式生成中
                              </span>
                            )}
                            {state.streamStatus === 'error' && (
                              <span style={{ marginLeft: 8, fontSize: 11, color: 'var(--danger-500)' }}>
                                生成失败
                              </span>
                            )}
                          </span>
                          <button
                            className={`select-btn ${state.selectedVersion === 'optimized' ? 'active' : ''}`}
                            onClick={() => handleSelectVersion(paragraphId, 'optimized')}
                            disabled={state.isProcessing || !state.optimizedText}
                          >
                            {state.selectedVersion === 'optimized' ? <Check size={14} /> : <X size={14} />}
                            {state.selectedVersion === 'optimized' ? '已选择' : '选择'}
                          </button>
                        </div>
                        {state.streamStatus === 'streaming' && state.streamingContent ? (
                          <div style={{
                            background: 'var(--bg-surface)',
                            borderRadius: 6,
                            padding: 12,
                            minHeight: 100,
                            fontSize: 13,
                            lineHeight: 1.6,
                            color: 'var(--text-primary)',
                            border: '1px solid var(--border-default)',
                            whiteSpace: 'pre-wrap',
                            wordBreak: 'break-word'
                          }}>
                            {state.streamingContent}
                            <span style={{ animation: 'blink 1s infinite' }}>▋</span>
                          </div>
                        ) : state.streamStatus === 'error' ? (
                          <div style={{
                            background: 'var(--bg-surface)',
                            borderRadius: 6,
                            padding: 12,
                            minHeight: 100,
                            fontSize: 13,
                            lineHeight: 1.6,
                            color: 'var(--danger-500)',
                            border: '1px solid var(--border-default)'
                          }}>
                            <p style={{ margin: 0, fontWeight: 500 }}>生成失败</p>
                            <p style={{ margin: '4px 0 0 0', fontSize: 12 }}>{state.errorMessage || '未知错误'}</p>
                          </div>
                        ) : (
                          <textarea
                            className="panel-textarea"
                            value={state.editedOptimized}
                            onChange={(e) => handleEditOptimized(paragraphId, e.target.value)}
                            disabled={state.isProcessing || !state.optimizedText}
                            placeholder={state.isProcessing ? '等待AI响应...' : '等待AI优化结果...'}
                          />
                        )}
                      </div>
                    </div>

                    <div className="comparison-actions">
                      <button
                        className="btn btn-secondary"
                        onClick={() => handleCancelOptimize(paragraphId)}
                      >
                        取消
                      </button>
                      <button
                        className="btn btn-primary"
                        onClick={() => handleConfirmOptimize(paragraphId, index)}
                        disabled={state.isProcessing}
                      >
                        确认修改
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="paragraph-content">
                    {editingParagraphId === paragraphId ? (
                      <div className="inline-edit">
                        <textarea
                          className="inline-textarea"
                          value={editingParagraphText}
                          onChange={(e) => setEditingParagraphText(e.target.value)}
                          autoFocus
                        />
                        <div className="inline-edit-actions">
                          <button
                            className="btn btn-secondary btn-sm"
                            onClick={handleCancelParagraphEdit}
                          >
                            取消
                          </button>
                          <button
                            className="btn btn-primary btn-sm"
                            onClick={() => handleSaveParagraphEdit(index)}
                          >
                            保存
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div 
                        className="paragraph-text editable"
                        onClick={() => handleStartEditParagraph(paragraphId, paragraph)}
                        style={{ cursor: 'pointer', minHeight: '20px' }}
                      >
                        {currentHighlights.length === 0 ? (
                          <ReactMarkdown remarkPlugins={[remarkGfm, remarkMath]} rehypePlugins={[rehypeRaw, rehypeKatex]}>{paragraph}</ReactMarkdown>
                        ) : (
                          renderParagraphWithHighlights(paragraph, paragraphId)
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          }

          return (
            <div 
              key={paragraphId} 
              className={`framework-paragraph-plain ${markedParagraphId === paragraphId ? 'paragraph-marked' : ''}`}
              ref={registerParagraphRef(paragraphId)}
              onClick={() => handleMarkParagraph(paragraphId)}
              style={{ cursor: 'pointer' }}
              title="点击标记此段落，进入删改模式时将自动定位到此处"
            >
              {currentHighlights.length === 0 ? (
                <div className="paragraph-text-plain">
                  <ReactMarkdown remarkPlugins={[remarkGfm, remarkMath]} rehypePlugins={[rehypeRaw, rehypeKatex]}>{paragraph}</ReactMarkdown>
                </div>
              ) : (
                renderParagraphWithHighlights(paragraph, paragraphId)
              )}
              {markedParagraphId === paragraphId && (
                <div className="paragraph-mark-indicator">
                  <Bookmark size={14} />
                  <span>已标记</span>
                </div>
              )}
            </div>
          );
        })}
      </div>
    );
  };

  const renderParagraphWithHighlights = (paragraph: string, _paragraphId: string) => {
    const sortedHighlights = [...currentHighlights]
      .filter(h => h.highlighted_text && paragraph.includes(h.highlighted_text))
      .sort((a, b) => {
        const idxA = paragraph.indexOf(a.highlighted_text);
        const idxB = paragraph.indexOf(b.highlighted_text);
        return idxA - idxB;
      });

    const highlightById = new Map<string, Highlight>();
    sortedHighlights.forEach(h => highlightById.set(h.id, h));

    let markdownWithHighlights = paragraph;

    sortedHighlights.forEach((highlight) => {
      if (!highlight.highlighted_text) return;
      const marker = `<mark data-highlight-id="${highlight.id}">${highlight.highlighted_text}</mark>`;
      markdownWithHighlights = markdownWithHighlights.split(highlight.highlighted_text).join(marker);
    });

    return (
      <div className="paragraph-text">
        <ReactMarkdown
          remarkPlugins={[remarkGfm, remarkMath]}
          rehypePlugins={[rehypeRaw, rehypeKatex]}
          components={{
            mark: ({ children, ...props }: React.ComponentPropsWithoutRef<'mark'>) => {
              const highlightId = (props as any)['data-highlight-id'];
              const highlight = highlightById.get(highlightId);
              
              const handleMouseEnter = (e: React.MouseEvent) => {
                if (!highlight?.explanation) return;
                if (hoverTimeoutRef.current) {
                  clearTimeout(hoverTimeoutRef.current);
                }
                hoverTimeoutRef.current = setTimeout(() => {
                  if (!explanationPopup?.isPinned) {
                    setExplanationPopup({
                      highlight,
                      position: {
                        x: e.clientX,
                        y: e.clientY,
                      },
                      isPinned: false,
                    });
                  }
                }, 200);
              };

              const handleMouseLeave = () => {
                if (hoverTimeoutRef.current) {
                  clearTimeout(hoverTimeoutRef.current);
                }
                if (explanationPopup && !explanationPopup.isPinned) {
                  setExplanationPopup(null);
                }
              };

              const handleClick = (e: React.MouseEvent) => {
                e.stopPropagation();
                if (!highlight) return;
                
                if (explanationPopup?.isPinned && explanationPopup.highlight.id === highlight.id) {
                  setExplanationPopup(null);
                } else if (highlight.explanation) {
                  setExplanationPopup({
                    highlight,
                    position: {
                      x: e.clientX,
                      y: e.clientY,
                    },
                    isPinned: true,
                  });
                } else {
                  setHighlightMenu({
                    highlight,
                    position: {
                      x: e.clientX,
                      y: e.clientY - 10,
                    },
                  });
                }
              };

              return (
                <span
                  className={`highlight-link ${highlight?.explanation ? 'explained' : ''}`}
                  data-highlight-id={highlightId}
                  onMouseEnter={handleMouseEnter}
                  onMouseLeave={handleMouseLeave}
                  onClick={handleClick}
                  style={{ cursor: 'pointer' }}
                >
                  {children}
                </span>
              );
            },
          }}
        >
          {markdownWithHighlights}
        </ReactMarkdown>
      </div>
    );
  };

  const handleGenerateExplanation = async () => {
    if (!highlightMenu) return;
    setGeneratingExplanation(true);
    try {
      const response = await highlightApi.explain({
        highlight_id: highlightMenu.highlight.id,
      });
      const updatedHighlight: Highlight = {
        ...highlightMenu.highlight,
        explanation: response.data.explanation,
      };
      setCurrentHighlights(prev =>
        prev.map(h => h.id === updatedHighlight.id ? updatedHighlight : h)
      );
      if (onHighlightCreated) {
        onHighlightCreated(updatedHighlight);
      }
      setHighlightMenu(null);
    } catch (error) {
      console.error('Failed to generate explanation:', error);
    } finally {
      setGeneratingExplanation(false);
    }
  };

  const handleDeleteHighlight = async () => {
    if (!highlightMenu) return;
    try {
      await highlightApi.delete(highlightMenu.highlight.id);
      setCurrentHighlights(prev =>
        prev.filter(h => h.id !== highlightMenu!.highlight.id)
      );
      if (onHighlightDeleted) {
        onHighlightDeleted(highlightMenu!.highlight.id);
      }
      setHighlightMenu(null);
    } catch (error) {
      console.error('Failed to delete highlight:', error);
    }
  };

  const isCurrentDocumentGenerating = isGenerating && generatingDocumentId === document.id;

  if (!framework && !isCurrentDocumentGenerating) {
    return (
      <div className="card">
        <h2 style={{ marginBottom: 20 }}>文章正文</h2>
        <div style={{ textAlign: 'center', padding: '40px 0' }}>
          <p style={{ color: 'var(--text-muted)', marginBottom: 20 }}>
            暂无正文内容
          </p>
          {onGenerate && (
            <button
              className="btn btn-primary"
              onClick={onGenerate}
              disabled={isCurrentDocumentGenerating}
            >
              {isCurrentDocumentGenerating ? '生成中...' : '生成正文'}
            </button>
          )}
        </div>
      </div>
    );
  }

  if (isCurrentDocumentGenerating && !framework) {
    return (
      <div className="card">
        <h2 style={{ marginBottom: 20 }}>文章正文</h2>
        <div className="framework-streaming">
          <div className="streaming-indicator">
            <RefreshCw size={16} className="spinning" />
            <span>正在生成...</span>
          </div>
          {streamingContent && (
            <div className="streaming-content">
              <ReactMarkdown remarkPlugins={[remarkGfm, remarkMath]} rehypePlugins={[rehypeRaw, rehypeKatex]}>
                {streamingContent}
              </ReactMarkdown>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="card">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <h2 style={{ margin: 0 }}>文章正文 ({currentHighlights.length}个标记)</h2>
        <div style={{ display: 'flex', gap: 8 }}>
          {isEditing ? (
            <>
              <button
                className="btn btn-primary"
                onClick={handleSaveEdit}
                disabled={isSaving}
              >
                <Save size={16} style={{ marginRight: 4 }} />
                {isSaving ? '保存中...' : '保存'}
              </button>
              <button
                className="btn btn-secondary"
                onClick={() => {
                  setIsEditing(false);
                  setEditedContent(framework || '');
                }}
              >
                取消
              </button>
            </>
          ) : (
            <>
              <button
                className="btn btn-secondary"
                onClick={() => setIsEditing(true)}
              >
                编辑
              </button>
              <button
                className="btn btn-secondary"
                onClick={onGenerate}
                disabled={isCurrentDocumentGenerating}
              >
                {isCurrentDocumentGenerating ? '生成中...' : '重新生成'}
              </button>
            </>
          )}
        </div>
      </div>

      <div
        ref={contentRef}
        className="document-content"
        onMouseUp={handleMouseUp}
        style={{ userSelect: 'text', cursor: 'text', position: 'relative' }}
      >
        {renderContent()}
      </div>

      {selection && !isEditing && (
        <div
          style={{
            position: 'fixed',
            left: selection.position.x,
            top: selection.position.y,
            transform: 'translate(-50%, -100%)',
            background: 'var(--bg-elevated)',
            borderRadius: 8,
            boxShadow: '0 4px 20px rgba(0,0,0,0.3)',
            padding: 12,
            zIndex: 1000,
            display: 'flex',
            flexDirection: 'column',
            gap: 8,
            minWidth: 200,
            color: 'var(--text-primary)',
          }}
        >
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 4 }}>
            选中文本: "{selection.text.substring(0, 30)}{selection.text.length > 30 ? '...' : ''}"
          </div>

          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <button
              className={`btn ${highlightType === 'keyword' ? 'btn-primary' : 'btn-secondary'}`}
              style={{ padding: '6px 12px', fontSize: 12 }}
              onClick={() => setHighlightType('keyword')}
            >
              关键词
            </button>
            <button
              className={`btn ${highlightType === 'tag' ? 'btn-primary' : 'btn-secondary'}`}
              style={{ padding: '6px 12px', fontSize: 12 }}
              onClick={() => setHighlightType('tag')}
            >
              标签
            </button>
            <button
              className={`btn ${highlightType === 'explanation' ? 'btn-primary' : 'btn-secondary'}`}
              style={{ padding: '6px 12px', fontSize: 12 }}
              onClick={() => setHighlightType('explanation')}
            >
              解释(自动AI)
            </button>
          </div>

          <div style={{ display: 'flex', gap: 6 }}>
            <button
              className="btn btn-primary"
              style={{ flex: 1, fontSize: 12 }}
              onClick={handleCreateHighlight}
              disabled={savingHighlight}
            >
              {savingHighlight ? '处理中...' : (highlightType === 'explanation' ? '添加并解释' : '添加标记')}
            </button>
            <button
              className="btn btn-secondary"
              style={{ fontSize: 12 }}
              onClick={() => setSelection(null)}
            >
              取消
            </button>
          </div>
        </div>
      )}
      {highlightMenu && (
        <div
          style={{
            position: 'fixed',
            left: highlightMenu.position.x,
            top: highlightMenu.position.y,
            transform: 'translate(-50%, -100%)',
            background: 'var(--bg-elevated)',
            borderRadius: 8,
            boxShadow: '0 4px 20px rgba(0,0,0,0.3)',
            padding: 12,
            zIndex: 1000,
            display: 'flex',
            flexDirection: 'column',
            gap: 8,
            minWidth: 180,
            color: 'var(--text-primary)',
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 4, color: 'var(--text-primary)' }}>
            "{highlightMenu.highlight.highlighted_text.substring(0, 25)}{highlightMenu.highlight.highlighted_text.length > 25 ? '...' : ''}"
          </div>
          <button
            className="btn btn-primary"
            style={{ fontSize: 12 }}
            onClick={handleGenerateExplanation}
            disabled={generatingExplanation}
          >
            {generatingExplanation ? '生成中...' : '✨ AI解释'}
          </button>
          <button
            className="btn btn-danger"
            style={{ fontSize: 12 }}
            onClick={handleDeleteHighlight}
          >
            🗑️ 删除
          </button>
          <button
            className="btn btn-secondary"
            style={{ fontSize: 12 }}
            onClick={() => setHighlightMenu(null)}
          >
            取消
          </button>
        </div>
      )}

      {explanationPopup && (
        <div
          className="explanation-tooltip"
          style={{
            position: 'fixed',
            left: Math.min(explanationPopup.position.x, window.innerWidth - 320),
            top: explanationPopup.position.y + 20,
            transform: 'translateX(-50%)',
            background: 'var(--bg-elevated)',
            borderRadius: 12,
            boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
            padding: 16,
            zIndex: 1001,
            minWidth: 280,
            maxWidth: 360,
            maxHeight: 400,
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column',
            color: 'var(--text-primary)',
          }}
          onClick={(e) => e.stopPropagation()}
          onMouseEnter={() => {
            if (hoverTimeoutRef.current) {
              clearTimeout(hoverTimeoutRef.current);
            }
          }}
          onMouseLeave={() => {
            if (!explanationPopup.isPinned) {
              setExplanationPopup(null);
            }
          }}
        >
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: 12,
            paddingBottom: 8,
            borderBottom: '1px solid var(--border-default)',
          }}>
            <div style={{
              fontSize: 13,
              fontWeight: 600,
              color: 'var(--primary-400)',
              display: 'flex',
              alignItems: 'center',
              gap: 6,
            }}>
              <span style={{
                background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                color: 'white',
                padding: '2px 8px',
                borderRadius: 4,
                fontSize: 11,
              }}>
                AI解释
              </span>
              {explanationPopup.isPinned && (
                <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>已固定</span>
              )}
            </div>
            <button
              onClick={() => setExplanationPopup(null)}
              style={{
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                padding: 4,
                display: 'flex',
                alignItems: 'center',
                color: 'var(--text-muted)',
              }}
            >
              <X size={16} />
            </button>
          </div>
          <div style={{
            fontSize: 12,
            color: 'var(--text-secondary)',
            marginBottom: 12,
            padding: '8px 12px',
            background: 'var(--bg-base)',
            borderRadius: 6,
            fontStyle: 'italic',
          }}>
            "{explanationPopup.highlight.highlighted_text}"
          </div>
          <div style={{
            flex: 1,
            overflow: 'auto',
            fontSize: 14,
            lineHeight: 1.6,
            color: 'var(--text-primary)',
          }}>
            <ReactMarkdown remarkPlugins={[remarkGfm, remarkMath]} rehypePlugins={[rehypeRaw, rehypeKatex]}>
              {explanationPopup.highlight.explanation || ''}
            </ReactMarkdown>
          </div>
        </div>
      )}
    </div>
  );
};

export default FrameworkView;
