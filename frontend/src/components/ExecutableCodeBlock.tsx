import React, { useRef, useEffect, useCallback } from 'react';
import hljs from 'highlight.js';
import { Play, Loader, Trash2 } from 'lucide-react';
import { usePyodide } from '../hooks/usePyodide';

// ── Props ─────────────────────────────────────────────────────────────
interface ExecutableCodeBlockProps {
  code: string;
  language?: string;
}

// ── Inline style constants (dark theme) ───────────────────────────────
const styles = {
  wrapper: {
    position: 'relative' as const,
    marginBottom: 16,
    borderRadius: 8,
    border: '1px solid rgba(139, 92, 246, 0.2)',
    overflow: 'hidden',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '6px 12px',
    background: 'rgba(139, 92, 246, 0.08)',
    borderBottom: '1px solid rgba(139, 92, 246, 0.15)',
  },
  languageLabel: {
    fontSize: 12,
    color: '#94a3b8',
    textTransform: 'uppercase' as const,
    letterSpacing: 0.5,
  },
  runButton: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 4,
    padding: '3px 10px',
    fontSize: 12,
    color: '#e2e8f0',
    background: 'rgba(139, 92, 246, 0.25)',
    border: '1px solid rgba(139, 92, 246, 0.4)',
    borderRadius: 4,
    cursor: 'pointer',
    transition: 'background 0.15s',
  },
  runButtonHover: {
    background: 'rgba(139, 92, 246, 0.4)',
  },
  runButtonDisabled: {
    opacity: 0.6,
    cursor: 'not-allowed',
  },
  codeContainer: {
    background: '#1e1b2e',
    padding: 16,
    overflowX: 'auto' as const,
    margin: 0,
  },
  codeElement: {
    fontSize: '0.85em',
    lineHeight: 1.6,
    fontFamily: "'Fira Code', 'Consolas', 'Monaco', monospace",
    background: 'transparent',
    padding: 0,
  },
  outputArea: {
    borderTop: '1px solid rgba(139, 92, 246, 0.15)',
    background: 'rgba(30, 27, 46, 0.7)',
    padding: 12,
    position: 'relative' as const,
  },
  outputHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  outputLabel: {
    fontSize: 11,
    color: '#64748b',
    textTransform: 'uppercase' as const,
    letterSpacing: 0.5,
  },
  clearButton: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 3,
    padding: '2px 8px',
    fontSize: 11,
    color: '#94a3b8',
    background: 'rgba(255, 255, 255, 0.05)',
    border: '1px solid rgba(255, 255, 255, 0.1)',
    borderRadius: 3,
    cursor: 'pointer',
  },
  stdout: {
    color: '#10b981',
    fontFamily: "'Fira Code', 'Consolas', 'Monaco', monospace",
    fontSize: '0.82em',
    lineHeight: 1.5,
    whiteSpace: 'pre-wrap' as const,
    wordBreak: 'break-word' as const,
  },
  stderr: {
    color: '#ef4444',
    fontFamily: "'Fira Code', 'Consolas', 'Monaco', monospace",
    fontSize: '0.82em',
    lineHeight: 1.5,
    whiteSpace: 'pre-wrap' as const,
    wordBreak: 'break-word' as const,
  },
  loadingOverlay: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    padding: '10px 14px',
    background: 'rgba(139, 92, 246, 0.06)',
    borderTop: '1px solid rgba(139, 92, 246, 0.15)',
    color: '#94a3b8',
    fontSize: 13,
  },
} as const;

// ── Component ─────────────────────────────────────────────────────────
const ExecutableCodeBlock: React.FC<ExecutableCodeBlockProps> = ({
  code,
  language = 'python',
}) => {
  const { isLoaded, isLoading, error, output, runCode, resetOutput } = usePyodide();
  const codeRef = useRef<HTMLElement>(null);
  const runButtonRef = useRef<HTMLButtonElement>(null);

  // Apply highlight.js syntax highlighting
  useEffect(() => {
    if (codeRef.current) {
      // Reset any previous highlighting
      codeRef.current.removeAttribute('data-highlighted');
      hljs.highlightElement(codeRef.current);
    }
  }, [code, language]);

  // Hover effect for run button
  const handleRunButtonEnter = useCallback(() => {
    if (runButtonRef.current && !isLoading) {
      Object.assign(runButtonRef.current.style, styles.runButtonHover);
    }
  }, [isLoading]);

  const handleRunButtonLeave = useCallback(() => {
    if (runButtonRef.current) {
      runButtonRef.current.style.background = 'rgba(139, 92, 246, 0.25)';
    }
  }, []);

  const handleRun = useCallback(() => {
    if (!isLoading) {
      runCode(code);
    }
  }, [code, isLoading, runCode]);

  const isPython = language.toLowerCase() === 'python' || language.toLowerCase() === 'py';

  return (
    <div style={styles.wrapper}>
      {/* Header bar */}
      <div style={styles.header}>
        <span style={styles.languageLabel}>{language}</span>
        {isPython && (
          <button
            ref={runButtonRef}
            style={{
              ...styles.runButton,
              ...(isLoading ? styles.runButtonDisabled : {}),
            }}
            onClick={handleRun}
            onMouseEnter={handleRunButtonEnter}
            onMouseLeave={handleRunButtonLeave}
            disabled={isLoading}
          >
            {isLoading ? (
              <Loader size={12} style={{ animation: 'spin 1s linear infinite' }} />
            ) : (
              <Play size={12} />
            )}
            {isLoading ? '运行中...' : '运行'}
          </button>
        )}
      </div>

      {/* Code block */}
      <div style={styles.codeContainer}>
        <code
          ref={codeRef}
          className={`language-${language}`}
          style={styles.codeElement}
        >
          {code}
        </code>
      </div>

      {/* Loading indicator (first-time Pyodide load) */}
      {isLoading && !isLoaded && (
        <div style={styles.loadingOverlay}>
          <Loader size={14} style={{ animation: 'spin 1s linear infinite' }} />
          加载 Python 运行时...
        </div>
      )}

      {/* Output area */}
      {output && !isLoading && (
        <div style={styles.outputArea}>
          <div style={styles.outputHeader}>
            <span style={styles.outputLabel}>输出</span>
            <button
              style={styles.clearButton}
              onClick={resetOutput}
            >
              <Trash2 size={10} />
              清除
            </button>
          </div>
          <pre style={error ? styles.stderr : styles.stdout}>
            {output}
          </pre>
        </div>
      )}
    </div>
  );
};

export default ExecutableCodeBlock;
