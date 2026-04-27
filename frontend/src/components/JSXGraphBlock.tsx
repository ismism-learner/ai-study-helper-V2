import React, { useRef, useEffect, useState, useId } from 'react';

// Minimal type declarations for JSXGraph CDN global
// Only declare what we actually use — avoids depending on broken jsxgraph .d.ts
interface JSXGraphBoard {
  create: (elementType: string, parents: unknown[], attributes?: Record<string, unknown>) => unknown;
}

interface JSXGraphStatic {
  JSXGraph: {
    initBoard: (container: string, options: Record<string, unknown>) => JSXGraphBoard;
    freeBoard: (board: JSXGraphBoard) => void;
  };
}

declare global {
  interface Window {
    JXG?: JSXGraphStatic;
  }
}

interface JSXGraphBlockProps {
  config: string;
}

const JSXGraphBlock: React.FC<JSXGraphBlockProps> = ({ config }) => {
  const reactId = useId();
  const containerId = useRef(`jsxgraph-${reactId.replace(/:/g, '-')}`);
  const boardRef = useRef<JSXGraphBoard | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const initBoard = () => {
      if (cancelled) return;

      try {
        const container = document.getElementById(containerId.current);
        if (!container) return;

        const jxg = window.JXG;
        if (!jxg) return;

        const board = jxg.JSXGraph.initBoard(containerId.current, {
          boundingbox: [-5, 5, 5, -5],
          axis: true,
          grid: true,
          showNavigation: true,
        });

        boardRef.current = board;

        // ⚠️ SECURITY NOTE: new Function() executes arbitrary JavaScript.
        // This is intentional — JSXGraph config requires dynamic code execution.
        // The config comes from AI-generated Markdown notes. If notes come from
        // untrusted sources, this is a code injection vector. Mitigation options:
        // 1. Run in a sandboxed iframe  2. Restrict to a whitelist of board.create() calls
        // For now, we trust the AI-generated content in this study app.
        const configFn = new Function('board', config);
        configFn(board);

        setIsLoading(false);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        setError(`配置执行失败: ${message}`);
        setIsLoading(false);
      }
    };

    const loadScript = () => {
      // Already loaded
      if (window.JXG) {
        initBoard();
        return;
      }

      // Check if script tag already exists (another instance may be loading)
      const existingScript = document.querySelector('script[src*="jsxgraphcore"]');
      if (existingScript) {
        existingScript.addEventListener('load', initBoard);
        existingScript.addEventListener('error', () => {
          if (!cancelled) {
            setError('JSXGraph 脚本加载失败');
            setIsLoading(false);
          }
        });
        return;
      }

      const script = document.createElement('script');
      script.src = 'https://cdn.jsdelivr.net/npm/jsxgraph@1.8.0/distrib/jsxgraphcore.js';
      script.async = true;
      script.addEventListener('load', initBoard);
      script.addEventListener('error', () => {
        if (!cancelled) {
          setError('JSXGraph 脚本加载失败');
          setIsLoading(false);
        }
      });
      document.head.appendChild(script);
    };

    loadScript();

    return () => {
      cancelled = true;
      if (boardRef.current) {
        try {
          window.JXG?.JSXGraph.freeBoard(boardRef.current);
        } catch {
          // Ignore cleanup errors
        }
        boardRef.current = null;
      }
    };
  }, [config]);

  if (error) {
    return (
      <div style={{
        height: 400,
        width: '100%',
        background: 'var(--bg-base)',
        border: '1px solid rgba(139, 92, 246, 0.2)',
        borderRadius: 8,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: 'var(--danger-400)',
        fontSize: 14,
        padding: 16,
        boxSizing: 'border-box',
      }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 20, marginBottom: 8 }}>⚠️</div>
          <div>{error}</div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ position: 'relative', width: '100%' }}>
      {isLoading && (
        <div style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          height: 400,
          background: 'var(--bg-base)',
          border: '1px solid rgba(139, 92, 246, 0.2)',
          borderRadius: 8,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'var(--text-muted)',
          fontSize: 14,
          zIndex: 1,
        }}>
          <div style={{ textAlign: 'center' }}>
            <div style={{
              width: 24,
              height: 24,
              border: '2px solid rgba(139, 92, 246, 0.3)',
              borderTopColor: 'var(--accent-500)',
              borderRadius: '50%',
              animation: 'jsxgraph-spin 0.8s linear infinite',
              margin: '0 auto 12px',
            }} />
            <div>正在加载 JSXGraph...</div>
          </div>
        </div>
      )}
      <div
        id={containerId.current}
        style={{
          height: 400,
          width: '100%',
          background: 'var(--bg-base)',
          border: '1px solid rgba(139, 92, 246, 0.2)',
          borderRadius: 8,
          overflow: 'hidden',
          // JSXGraph dark theme overrides
          color: 'var(--border-default)',
        }}
      />
      <style>{`
        @keyframes jsxgraph-spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
      <style>{`
        #${containerId.current} .JXGtext {
          fill: #cbd5e1 !important;
          color: #cbd5e1 !important;
        }
        #${containerId.current} .JXGbox {
          background-color: #1e1b2e !important;
        }
      `}</style>
    </div>
  );
};

export default JSXGraphBlock;
