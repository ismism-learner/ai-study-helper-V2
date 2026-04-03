import React, { useState, useRef, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Document, Highlight } from '../types';
import { X } from 'lucide-react';

interface DocumentViewProps {
  document: Document;
  highlightedKeyword?: string | null;
}

interface ExplanationPopup {
  highlight: Highlight;
  position: { x: number; y: number };
  isPinned: boolean;
}

const DocumentView: React.FC<DocumentViewProps> = ({ document: doc, highlightedKeyword }) => {
  const content = doc.processed_content || doc.original_content;
  const [explanationPopup, setExplanationPopup] = useState<ExplanationPopup | null>(null);
  const hoverTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const contentRef = useRef<HTMLDivElement>(null);

  const highlightMap = new Map<string, Highlight>();
  (doc.highlights || []).forEach(h => highlightMap.set(h.id, h));

  useEffect(() => {
    if (highlightedKeyword && contentRef.current) {
      const walker = document.createTreeWalker(
        contentRef.current,
        NodeFilter.SHOW_TEXT,
        null
      );
      
      let found = false;
      let node: Node | null;
      
      while ((node = walker.nextNode()) && !found) {
        if (node.textContent && node.textContent.includes(highlightedKeyword)) {
          const range = document.createRange();
          const startIndex = node.textContent.indexOf(highlightedKeyword);
          range.setStart(node, startIndex);
          range.setEnd(node, startIndex + highlightedKeyword.length);
          
          const rect = range.getBoundingClientRect();
          if (rect.top !== 0 || rect.left !== 0) {
            window.scrollTo({
              top: window.scrollY + rect.top - 150,
              behavior: 'smooth'
            });
            found = true;
          }
        }
      }
    }
  }, [highlightedKeyword]);

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

  const handleClick = (e: React.MouseEvent, highlightId: string) => {
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

  return (
    <div className="card">
      <h2 style={{ marginBottom: 20 }}>{doc.title}</h2>
      <div className="document-content" ref={contentRef}>
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          components={{
            a: ({ href, children, ...props }) => {
              if (href?.startsWith('#highlight-')) {
                const highlightId = href.replace('#highlight-', '');
                const highlight = highlightMap.get(highlightId);
                return (
                  <a
                    href={href}
                    className={`highlight-link ${highlight?.explanation ? 'explained' : ''}`}
                    onMouseEnter={(e) => handleMouseEnter(e, highlightId)}
                    onMouseLeave={handleMouseLeave}
                    onClick={(e) => handleClick(e, highlightId)}
                    style={{ cursor: 'pointer' }}
                    {...props}
                  >
                    {children}
                  </a>
                );
              }
              return (
                <a href={href} target="_blank" rel="noopener noreferrer" {...props}>
                  {children}
                </a>
              );
            },
          }}
        >
          {content}
        </ReactMarkdown>
      </div>

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

export default DocumentView;
