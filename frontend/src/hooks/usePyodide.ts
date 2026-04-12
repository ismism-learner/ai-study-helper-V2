import { useState, useCallback, useRef, useEffect } from 'react';

// ── Pyodide global type declarations ──────────────────────────────────
interface PyodideStdio {
  batched: (msg: string) => void;
}

interface PyodideInstance {
  runPythonAsync: (code: string) => Promise<unknown>;
  setStdout: (config: PyodideStdio) => void;
  setStderr: (config: PyodideStdio) => void;
}

type LoadPyodideFn = (config?: {
  indexURL?: string;
}) => Promise<PyodideInstance>;

declare global {
  interface Window {
    loadPyodide?: LoadPyodideFn;
  }
}

// ── Hook return type ──────────────────────────────────────────────────
export interface UsePyodideReturn {
  isLoaded: boolean;
  isLoading: boolean;
  error: string | null;
  output: string;
  runCode: (code: string) => Promise<void>;
  resetOutput: () => void;
}

// ── CDN constants ─────────────────────────────────────────────────────
const PYODIDE_CDN_URL = 'https://cdn.jsdelivr.net/pyodide/v0.24.1/full/pyodide.js';
const PYODIDE_INDEX_URL = 'https://cdn.jsdelivr.net/pyodide/v0.24.1/full/';

// ── Module-level singleton ────────────────────────────────────────────
// Ensures only ONE Pyodide runtime is ever created, regardless of how
// many ExecutableCodeBlock instances are mounted simultaneously.
let pyodidePromise: Promise<PyodideInstance> | null = null;
let scriptLoadPromise: Promise<void> | null = null;

// Execution mutex: serializes runCode calls so that concurrent executions
// don't overwrite each other's setStdout/setStderr on the shared singleton.
let executionLock: Promise<void> = Promise.resolve();

/** Inject the Pyodide CDN script exactly once */
function ensureScriptLoaded(): Promise<void> {
  if (scriptLoadPromise) return scriptLoadPromise;

  // Check if script already exists in DOM (e.g. from a previous page load)
  const existing = document.querySelector(`script[src="${PYODIDE_CDN_URL}"]`);
  if (existing && window.loadPyodide) {
    scriptLoadPromise = Promise.resolve();
    return scriptLoadPromise;
  }

  scriptLoadPromise = new Promise<void>((resolve, reject) => {
    // Double-check: another call might have added it while we were waiting
    const already = document.querySelector(`script[src="${PYODIDE_CDN_URL}"]`);
    if (already && window.loadPyodide) {
      resolve();
      return;
    }

    const script = document.createElement('script');
    script.src = PYODIDE_CDN_URL;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Failed to load Pyodide script from CDN'));
    document.head.appendChild(script);
  });

  return scriptLoadPromise;
}

/** Get or create the singleton Pyodide instance */
function getPyodide(): Promise<PyodideInstance> {
  if (!pyodidePromise) {
    pyodidePromise = (async () => {
      await ensureScriptLoaded();

      const loadFn = window.loadPyodide;
      if (!loadFn) {
        throw new Error('loadPyodide is not available after script load');
      }

      // Initialize without stdout/stderr — we set them per-execution
      const pyodide = await loadFn({ indexURL: PYODIDE_INDEX_URL });
      return pyodide;
    })();
  }
  return pyodidePromise;
}

// ── Hook implementation ──────────────────────────────────────────────
export function usePyodide(): UsePyodideReturn {
  const [isLoaded, setIsLoaded] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [output, setOutput] = useState('');

  // Track whether the component is still mounted
  const mountedRef = useRef(true);
  useEffect(() => () => { mountedRef.current = false; }, []);

  /** Execute a Python code string */
  const runCode = useCallback(async (code: string) => {
    // Reset output for each run
    setOutput('');
    setError(null);
    setIsLoading(true);

    // Acquire execution lock — serialize concurrent runs so that
    // Block B's setStdout/setStderr cannot overwrite Block A's while
    // A is still executing on the shared Pyodide singleton.
    let release!: () => void;
    executionLock = executionLock.then(
      () => new Promise<void>((resolve) => { release = resolve; }),
    );
    await executionLock;

    try {
      const pyodide = await getPyodide();

      // Guard: component may have unmounted while waiting for Pyodide
      if (!mountedRef.current) {
        release();
        return;
      }

      setIsLoaded(true);

      pyodide.setStdout({
        batched: (msg: string) => {
          if (mountedRef.current) {
            setOutput(prev => prev + msg + '\n');
          }
        },
      });
      pyodide.setStderr({
        batched: (msg: string) => {
          if (mountedRef.current) {
            setOutput(prev => prev + msg + '\n');
          }
        },
      });

      await pyodide.runPythonAsync(code);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      if (mountedRef.current) {
        setError(message);
        setOutput(prev => prev + message + '\n');
      }
    } finally {
      release();
      if (mountedRef.current) {
        setIsLoading(false);
      }
    }
  }, []);

  /** Clear the output buffer */
  const resetOutput = useCallback(() => {
    setOutput('');
    setError(null);
  }, []);

  return { isLoaded, isLoading, error, output, runCode, resetOutput };
}
