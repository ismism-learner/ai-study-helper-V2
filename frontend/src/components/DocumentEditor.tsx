import React, { useState, useCallback, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Highlight, CreateHighlightRequest } from '../types';
import { highlightApi } from '../api';
import { cognitiveChainApi } from '../api/knowledgeGraph';
import { Plus, X } from 'lucide-react';

interface DocumentEditorProps {
  documentId: string;
  content: string;
  highlights: Highlight[];
  onHighlightCreated: (highlight: Highlight) => void;
  onAskQuestion?: (question: string) => void;
}

interface Selection {
  text: string;
  startOffset: number;
  endOffset: number;
  position: { x: number; y: number };
}

interface ExplanationPopup {
  highlight: Highlight;
  position: { x: number; y: number };
  isPinned: boolean;
}

const DocumentEditor: React.FC<DocumentEditorProps> = ({
  documentId,
  content,
  highlights,
  onHighlightCreated,
  onAskQuestion,
}) => {
  const [selection, setSelection] = useState<Selection | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [customPrompt, setCustomPrompt] = useState('');
  const [showPromptModal, setShowPromptModal] = useState(false);
  const [explanationPopup, setExplanationPopup] = useState<ExplanationPopup | null>(null);
  const [currentChainId, setCurrentChainId] = useState<string | null>(null);
  const [currentParentNodeId, setCurrentParentNodeId] = useState<string | null>(null);
  const [isAskingQuestion, setIsAskingQuestion] = useState(false);
  const editorRef = useRef<HTMLDivElement>(null);
  const hoverTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const highlightMap = new Map<string, Highlight>();
  highlights.forEach(h => highlightMap.set(h.id, h));

  const handleMouseEnter = (e: React.MouseEvent, highlightId: string) => {
    const highlight = highlightMap.get(highlightId);
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

  const handleHighlightClick = (e: React.MouseEvent, highlightId: string) => {
    e.preventDefault();
    const highlight = highlightMap.get(highlightId);
    if (!highlight) return;

    if (explanationPopup?.isPinned && explanationPopup.highlight.id === highlightId) {
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
    }
  };

  const handleMouseUp = useCallback((_e: React.MouseEvent) => {
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
    const editorElement = editorRef.current;

    if (!editorElement) {
      setSelection(null);
      return;
    }

    preCaretRange.selectNodeContents(editorElement);
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
  }, []);

  const handleCreateHighlight = async () => {
    if (!selection) return;

    const isAlreadyHighlighted = highlights.some(
      h => h.highlighted_text === selection.text
    );
    
    if (isAlreadyHighlighted) {
      alert('该文本已经被高亮标记过了');
      setSelection(null);
      setShowPromptModal(false);
      setCustomPrompt('');
      window.getSelection()?.removeAllRanges();
      return;
    }

    setIsCreating(true);
    try {
      const request: CreateHighlightRequest = {
        highlighted_text: selection.text,
        start_offset: selection.startOffset,
        end_offset: selection.endOffset,
        prompt_template: customPrompt || undefined,
      };

      const response = await highlightApi.create(documentId, request);
      onHighlightCreated(response.data);
      setSelection(null);
      setShowPromptModal(false);
      setCustomPrompt('');
    } catch (error) {
      console.error('Failed to create highlight:', error);
      alert('创建高亮失败，请重试');
    } finally {
      setIsCreating(false);
    }
  };

  const handleAskQuestion = async () => {
    if (!selection) return;
    setIsAskingQuestion(true);
    try {
      if (onAskQuestion) {
        onAskQuestion(selection.text);
      } else {
        const res = await cognitiveChainApi.createChain({
          root_concept: selection.text,
          context: selection.text,
          source_doc_id: documentId,
        });
        const chain = res.data;
        setCurrentChainId(chain.id);
        const rootNode = chain.nodes?.[0];
        if (rootNode) {
          setCurrentParentNodeId(rootNode.id);
        }
      }
    } catch (error) {
      console.error('提问失败:', error);
    } finally {
      setIsAskingQuestion(false);
      setSelection(null);
    }
  };

  const handleFollowUp = async () => {
    if (!selection) return;
    setIsAskingQuestion(true);
    try {
      if (onAskQuestion) {
        onAskQuestion(selection.text);
      } else {
        if (!currentChainId || !currentParentNodeId) return;
        const res = await cognitiveChainApi.expandChain({
          chain_id: currentChainId,
          parent_node_id: currentParentNodeId,
          concept_to_explain: selection.text,
          context: selection.text,
          source_doc_id: documentId,
        });
        const node = res.data;
        setCurrentParentNodeId(node.id);
      }
    } catch (error) {
      console.error('追问失败:', error);
    } finally {
      setIsAskingQuestion(false);
      setSelection(null);
    }
  };

  const renderContentWithHighlights = () => {
    if (highlights.length === 0) {
      return <div className="document-content">{content}</div>;
    }

    const sortedHighlights = [...highlights].sort((a, b) => a.start_offset - b.start_offset);
    const parts: React.ReactNode[] = [];
    let lastIndex = 0;

    sortedHighlights.forEach((highlight, index) => {
      if (highlight.start_offset > lastIndex) {
        parts.push(
          <span key={`text-${index}`}>
            {content.substring(lastIndex, highlight.start_offset)}
          </span>
        );
      }

      parts.push(
        <a
          key={`highlight-${highlight.id}`}
          href={`#highlight-${highlight.id}`}
          className={`highlight-link ${highlight.explanation ? 'explained' : ''}`}
          onMouseEnter={(e) => handleMouseEnter(e, highlight.id)}
          onMouseLeave={handleMouseLeave}
          onClick={(e) => handleHighlightClick(e, highlight.id)}
          style={{ cursor: 'pointer' }}
        >
          {highlight.highlighted_text}
        </a>
      );

      lastIndex = highlight.end_offset;
    });

    if (lastIndex < content.length) {
      parts.push(<span key="text-end">{content.substring(lastIndex)}</span>);
    }

    return <div className="document-content">{parts}</div>;
  };

  return (
    <div className="card">
      <div
        ref={editorRef}
        onMouseUp={handleMouseUp}
        style={{ userSelect: 'text', cursor: 'text' }}
      >
        {renderContentWithHighlights()}
      </div>

      {selection && (
        <div
          className="selection-popup"
          style={{
            left: selection.position.x,
            top: selection.position.y,
            transform: 'translate(-50%, -100%)',
          }}
        >
          <button
            className="btn btn-primary"
            onClick={() => setShowPromptModal(true)}
            disabled={isCreating}
          >
            <Plus size={16} style={{ marginRight: 4 }} />
            高亮标记
          </button>
          <button
            className="btn btn-secondary"
            onClick={handleAskQuestion}
            disabled={isAskingQuestion}
            title="向认知链提问"
          >
            💡 提问
          </button>
          <button
            className="btn btn-secondary"
            onClick={handleFollowUp}
            disabled={isAskingQuestion || !currentChainId}
            title={currentChainId ? '在当前认知链中追问' : '请先提问创建认知链'}
          >
            🔗 追问
          </button>
          <button
            className="btn btn-secondary"
            onClick={() => setSelection(null)}
          >
            <X size={16} />
          </button>
        </div>
      )}

      {showPromptModal && (
        <div className="modal-overlay" onClick={() => setShowPromptModal(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2>创建高亮标记</h2>
            <p style={{ marginBottom: 16, color: '#6c757d' }}>
              选中文本: <strong>"{selection?.text}"</strong>
            </p>
            
            <div className="form-group">
              <label>自定义提示词（可选）</label>
              <textarea
                className="input textarea"
                style={{ minHeight: 100 }}
                value={customPrompt}
                onChange={(e) => setCustomPrompt(e.target.value)}
                placeholder="输入自定义提示词来指导AI解释，或使用默认提示词..."
              />
            </div>

            <div className="modal-actions">
              <button
                className="btn btn-secondary"
                onClick={() => setShowPromptModal(false)}
              >
                取消
              </button>
              <button
                className="btn btn-primary"
                onClick={handleCreateHighlight}
                disabled={isCreating}
              >
                {isCreating ? '创建中...' : '创建高亮'}
              </button>
            </div>
          </div>
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
            background: 'white',
            borderRadius: 12,
            boxShadow: '0 8px 32px rgba(0,0,0,0.2)',
            padding: 16,
            zIndex: 1001,
            minWidth: 280,
            maxWidth: 360,
            maxHeight: 400,
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column',
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
            borderBottom: '1px solid #e9ecef',
          }}>
            <div style={{
              fontSize: 13,
              fontWeight: 600,
              color: '#667eea',
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
                <span style={{ fontSize: 10, color: '#6c757d' }}>已固定</span>
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
                color: '#6c757d',
              }}
            >
              <X size={16} />
            </button>
          </div>
          <div style={{
            fontSize: 12,
            color: '#495057',
            marginBottom: 12,
            padding: '8px 12px',
            background: '#f8f9fa',
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
            color: '#333',
          }}>
            <ReactMarkdown remarkPlugins={[remarkGfm]}>
              {explanationPopup.highlight.explanation || ''}
            </ReactMarkdown>
          </div>
        </div>
      )}
    </div>
  );
};

export default DocumentEditor;
