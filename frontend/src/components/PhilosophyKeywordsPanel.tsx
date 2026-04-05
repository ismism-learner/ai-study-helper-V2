import React, { useState, useRef, useEffect, useCallback } from 'react';
import { PhilosophyKeywordMatch, ParsedKeyword } from '../types';
import { BookOpen, Layers, Eye, Target, ChevronDown, ChevronUp, Tag, Sparkles } from 'lucide-react';

interface PhilosophyKeywordsPanelProps {
  matches: PhilosophyKeywordMatch[];
  onKeywordClick?: (keyword: string) => void;
  onCreateHighlight?: (keyword: string) => void;
}

const PhilosophyKeywordsPanel: React.FC<PhilosophyKeywordsPanelProps> = ({
  matches,
  onKeywordClick,
  onCreateHighlight,
}) => {
  const [expandedCode, setExpandedCode] = useState<string | null>(null);
  const [isHovering, setIsHovering] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  const handleWheel = useCallback((e: WheelEvent) => {
    if (!isHovering) {
      e.preventDefault();
      window.scrollTo({
        top: window.scrollY + e.deltaY,
        behavior: 'auto'
      });
    }
  }, [isHovering]);

  useEffect(() => {
    const panel = panelRef.current;
    if (panel) {
      panel.addEventListener('wheel', handleWheel, { passive: false });
      return () => {
        panel.removeEventListener('wheel', handleWheel);
      };
    }
  }, [handleWheel]);

  const handleMouseEnter = () => {
    setIsHovering(true);
  };

  const handleMouseLeave = () => {
    setIsHovering(false);
  };

  const countKeywords = (keywords: ParsedKeyword[]): number => {
    let count = 0;
    keywords.forEach(kw => {
      count += kw.left ? 1 : 0;
      count += kw.right ? 1 : 0;
    });
    return count;
  };

  const renderKeywordTag = (
    keyword: string,
    tagClass: string,
    idx: string
  ) => (
    <span
      key={idx}
      className={`keyword-tag ${tagClass}`}
      onClick={() => onKeywordClick?.(keyword)}
      title="点击在文章中定位"
    >
      {keyword}
      <button
        className="keyword-highlight-btn"
        onClick={(e) => {
          e.stopPropagation();
          onCreateHighlight?.(keyword);
        }}
        title="创建高亮标记"
      >
        <Sparkles size={10} />
      </button>
    </span>
  );

  const renderParsedKeyword = (
    parsed: ParsedKeyword,
    tagClass: string,
    baseIdx: number
  ) => {
    if (parsed.right) {
      return (
        <div key={baseIdx} className="keyword-pair">
          <span
            className={`keyword-tag ${tagClass}`}
            onClick={() => onKeywordClick?.(parsed.left)}
            title="点击在文章中定位"
          >
            {parsed.left}
            <button
              className="keyword-highlight-btn"
              onClick={(e) => {
                e.stopPropagation();
                onCreateHighlight?.(parsed.left);
              }}
              title="创建高亮标记"
            >
              <Sparkles size={10} />
            </button>
          </span>
          {parsed.connector && (
            <span className="keyword-connector">{parsed.connector}</span>
          )}
          <span
            className={`keyword-tag ${tagClass}`}
            onClick={() => parsed.right && onKeywordClick?.(parsed.right)}
            title="点击在文章中定位"
          >
            {parsed.right}
            <button
              className="keyword-highlight-btn"
              onClick={(e) => {
                e.stopPropagation();
                parsed.right && onCreateHighlight?.(parsed.right);
              }}
              title="创建高亮标记"
            >
              <Sparkles size={10} />
            </button>
          </span>
        </div>
      );
    }

    return renderKeywordTag(parsed.left, tagClass, `${baseIdx}-single`);
  };

  if (matches.length === 0) {
    return null;
  }

  return (
    <div
      className="philosophy-keywords-panel"
      ref={panelRef}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      <div className="philosophy-panel-header">
        <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
          <BookOpen size={16} />
          主义主义关键词
        </h3>
        <span className="philosophy-match-count">{matches.length}</span>
      </div>

      <div className="panel-content-scrollable" style={{ display: 'flex', flexDirection: 'column', gap: 6, padding: 8, overflowY: 'auto' }}>
        {matches.map((match) => (
          <div
            key={match.code}
            className="philosophy-match-card"
          >
            <div
              className="philosophy-match-header"
              onClick={() => setExpandedCode(expandedCode === match.code ? null : match.code)}
            >
              <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 8 }}>
                <span className="philosophy-code-badge">{match.code.split(' ')[0]}</span>
                <span className="philosophy-match-name">{match.name}</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span className="philosophy-keyword-count">
                  {countKeywords(match.keywords.ontology) + countKeywords(match.keywords.epistemology) + countKeywords(match.keywords.teleology)} 词
                </span>
                {expandedCode === match.code ? (
                  <ChevronUp size={16} />
                ) : (
                  <ChevronDown size={16} />
                )}
              </div>
            </div>

            {expandedCode === match.code && (
              <div className="philosophy-keywords-content">
                <div className="keyword-section">
                  <div className="keyword-section-header">
                    <Layers size={12} />
                    <span>场域</span>
                  </div>
                  <div className="keyword-tags">
                    {match.keywords.field ? (
                      renderKeywordTag(match.keywords.field, 'field-tag', 'field')
                    ) : (
                      <span className="keyword-empty">-</span>
                    )}
                  </div>
                </div>

                <div className="keyword-section">
                  <div className="keyword-section-header">
                    <Eye size={12} />
                    <span>本体论</span>
                  </div>
                  <div className="keyword-tags">
                    {match.keywords.ontology.length > 0 ? (
                      match.keywords.ontology.map((kw, idx) => renderParsedKeyword(kw, 'ontology-tag', idx))
                    ) : (
                      <span className="keyword-empty">-</span>
                    )}
                  </div>
                </div>

                <div className="keyword-section">
                  <div className="keyword-section-header">
                    <Target size={12} />
                    <span>认识论</span>
                  </div>
                  <div className="keyword-tags">
                    {match.keywords.epistemology.length > 0 ? (
                      match.keywords.epistemology.map((kw, idx) => renderParsedKeyword(kw, 'epistemology-tag', idx))
                    ) : (
                      <span className="keyword-empty">-</span>
                    )}
                  </div>
                </div>

                <div className="keyword-section">
                  <div className="keyword-section-header">
                    <Tag size={12} />
                    <span>目的论</span>
                  </div>
                  <div className="keyword-tags">
                    {match.keywords.teleology.length > 0 ? (
                      match.keywords.teleology.map((kw, idx) => renderParsedKeyword(kw, 'teleology-tag', idx))
                    ) : (
                      <span className="keyword-empty">-</span>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};

export default PhilosophyKeywordsPanel;
