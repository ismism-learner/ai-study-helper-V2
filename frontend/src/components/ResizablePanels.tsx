import React, { useState, useRef, useCallback, useEffect } from 'react';
import '../styles/resizable-panels.css';

interface PanelConfig {
  id: string;
  title: string;
  icon?: React.ReactNode;
  defaultWidth?: number;
  minWidth?: number;
  maxWidth?: number;
  collapsible?: boolean;
  collapsed?: boolean;
}

interface ResizablePanelsProps {
  panels: PanelConfig[];
  children: React.ReactNode[];
  className?: string;
  onPanelCollapse?: (panelId: string, collapsed: boolean) => void;
  onPanelOrderChange?: (panelIds: string[]) => void;
}

const LONG_PRESS_MS = 400; // ms to trigger reorder mode

const ResizablePanels: React.FC<ResizablePanelsProps> = ({
  panels: originalPanels,
  children: originalChildren,
  className = '',
  onPanelCollapse,
  onPanelOrderChange,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [widths, setWidths] = useState<number[]>(() => {
    const defaultWidth = 100 / originalPanels.length;
    return originalPanels.map((p) => p.defaultWidth || defaultWidth);
  });
  const [collapsedPanels, setCollapsedPanels] = useState<Set<string>>(() => {
    const set = new Set<string>();
    originalPanels.forEach((p) => {
      if (p.collapsed) set.add(p.id);
    });
    return set;
  });

  // Resize drag state
  const [dragging, setDragging] = useState<number | null>(null);
  const startXRef = useRef(0);
  const startWidthsRef = useRef<number[]>([]);

  // Reorder state
  const [panelOrder, setPanelOrder] = useState<string[]>(() =>
    originalPanels.map((p) => p.id)
  );
  const [reorderIndex, setReorderIndex] = useState<number | null>(null);
  const [isReordering, setIsReordering] = useState(false);
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reorderStartXRef = useRef(0);
  const [reorderOffsetX, setReorderOffsetX] = useState(0);

  // Derive ordered panels/children from panelOrder
  const panelMap = useRef<Map<string, { panel: PanelConfig; child: React.ReactNode }>>(new Map());
  panelMap.current.clear();
  originalPanels.forEach((p, i) => {
    panelMap.current.set(p.id, { panel: p, child: originalChildren[i] });
  });
  const panels = panelOrder.map((id) => panelMap.current.get(id)!.panel);
  const children = panelOrder.map((id) => panelMap.current.get(id)!.child);

  // ---- Resize logic (unchanged) ----
  const handleResizeMouseDown = useCallback(
    (index: number, e: React.MouseEvent) => {
      if (isReordering) return;
      e.preventDefault();
      setDragging(index);
      startXRef.current = e.clientX;
      startWidthsRef.current = [...widths];
    },
    [widths, isReordering]
  );

  const handleResizeMouseMove = useCallback(
    (e: MouseEvent) => {
      if (dragging === null || !containerRef.current) return;

      const containerWidth = containerRef.current.offsetWidth;
      const dx = e.clientX - startXRef.current;
      const dxPercent = (dx / containerWidth) * 100;

      const leftIndex = dragging;
      const rightIndex = dragging + 1;

      const leftPanel = panels[leftIndex];
      const rightPanel = panels[rightIndex];

      if (collapsedPanels.has(leftPanel.id) || collapsedPanels.has(rightPanel.id)) return;

      const minLeft = leftPanel.minWidth || 10;
      const minRight = rightPanel.minWidth || 10;
      const maxLeft = leftPanel.maxWidth || 80;
      const maxRight = rightPanel.maxWidth || 80;

      let newLeftWidth = startWidthsRef.current[leftIndex] + dxPercent;
      let newRightWidth = startWidthsRef.current[rightIndex] - dxPercent;

      if (newLeftWidth < minLeft) {
        newRightWidth += newLeftWidth - minLeft;
        newLeftWidth = minLeft;
      }
      if (newRightWidth < minRight) {
        newLeftWidth += newRightWidth - minRight;
        newRightWidth = minRight;
      }
      if (newLeftWidth > maxLeft) {
        newRightWidth += newLeftWidth - maxLeft;
        newLeftWidth = maxLeft;
      }
      if (newRightWidth > maxRight) {
        newLeftWidth += newRightWidth - maxRight;
        newRightWidth = maxRight;
      }

      const newWidths = [...widths];
      newWidths[leftIndex] = newLeftWidth;
      newWidths[rightIndex] = newRightWidth;
      setWidths(newWidths);
    },
    [dragging, widths, panels, collapsedPanels]
  );

  const handleResizeMouseUp = useCallback(() => {
    setDragging(null);
  }, []);

  useEffect(() => {
    if (dragging !== null) {
      document.addEventListener('mousemove', handleResizeMouseMove);
      document.addEventListener('mouseup', handleResizeMouseUp);
      return () => {
        document.removeEventListener('mousemove', handleResizeMouseMove);
        document.removeEventListener('mouseup', handleResizeMouseUp);
      };
    }
  }, [dragging, handleResizeMouseMove, handleResizeMouseUp]);

  // ---- Collapse logic ----
  const toggleCollapse = useCallback((panelId: string) => {
    setCollapsedPanels((prevCollapsed) => {
      const nextCollapsed = new Set(prevCollapsed);
      const wasCollapsed = nextCollapsed.has(panelId);
      
      if (wasCollapsed) {
        nextCollapsed.delete(panelId);
      } else {
        nextCollapsed.add(panelId);
      }
      
      onPanelCollapse?.(panelId, !wasCollapsed);
      
      // 重新计算宽度：未折叠的面板均分空间
      const visibleCount = originalPanels.length - nextCollapsed.size;
      if (visibleCount > 0) {
        const equalWidth = 100 / visibleCount;
        const newWidths = originalPanels.map((panel) => {
          return nextCollapsed.has(panel.id) ? 0 : equalWidth;
        });
        setWidths(newWidths);
      }
      
      return nextCollapsed;
    });
  }, [originalPanels, onPanelCollapse]);

  // ---- Reorder logic (long press header → drag to swap) ----
  const handleHeaderMouseDown = useCallback(
    (index: number, e: React.MouseEvent) => {
      if (isReordering) return;
      e.preventDefault();
      reorderStartXRef.current = e.clientX;

      longPressTimerRef.current = setTimeout(() => {
        setReorderIndex(index);
        setIsReordering(true);
        setReorderOffsetX(0);
      }, LONG_PRESS_MS);
    },
    [isReordering]
  );

  const handleHeaderMouseUp = useCallback(() => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  }, []);

  const handleReorderMouseMove = useCallback(
    (e: MouseEvent) => {
      if (!isReordering || reorderIndex === null || !containerRef.current) return;

      const dx = e.clientX - reorderStartXRef.current;
      setReorderOffsetX(dx);

      const containerWidth = containerRef.current.offsetWidth;
      const panelCount = panels.length;
      const avgPanelWidth = containerWidth / panelCount;
      const swapThreshold = avgPanelWidth * 0.04;

      // Swap with left neighbor
      if (dx < -swapThreshold && reorderIndex > 0) {
        const newOrder = [...panelOrder];
        [newOrder[reorderIndex - 1], newOrder[reorderIndex]] = [
          newOrder[reorderIndex],
          newOrder[reorderIndex - 1],
        ];
        setPanelOrder(newOrder);
        onPanelOrderChange?.(newOrder);

        // Swap widths too
        const newWidths = [...widths];
        [newWidths[reorderIndex - 1], newWidths[reorderIndex]] = [
          newWidths[reorderIndex],
          newWidths[reorderIndex - 1],
        ];
        setWidths(newWidths);

        setReorderIndex(reorderIndex - 1);
        reorderStartXRef.current = e.clientX;
        setReorderOffsetX(0);
      }

      // Swap with right neighbor
      if (dx > swapThreshold && reorderIndex < panelCount - 1) {
        const newOrder = [...panelOrder];
        [newOrder[reorderIndex], newOrder[reorderIndex + 1]] = [
          newOrder[reorderIndex + 1],
          newOrder[reorderIndex],
        ];
        setPanelOrder(newOrder);
        onPanelOrderChange?.(newOrder);

        const newWidths = [...widths];
        [newWidths[reorderIndex], newWidths[reorderIndex + 1]] = [
          newWidths[reorderIndex + 1],
          newWidths[reorderIndex],
        ];
        setWidths(newWidths);

        setReorderIndex(reorderIndex + 1);
        reorderStartXRef.current = e.clientX;
        setReorderOffsetX(0);
      }
    },
    [isReordering, reorderIndex, panelOrder, panels, widths, onPanelOrderChange]
  );

  const handleReorderMouseUp = useCallback(() => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
    if (isReordering) {
      setIsReordering(false);
      setReorderIndex(null);
      setReorderOffsetX(0);
    }
  }, [isReordering]);

  useEffect(() => {
    if (isReordering) {
      document.addEventListener('mousemove', handleReorderMouseMove);
      document.addEventListener('mouseup', handleReorderMouseUp);
      return () => {
        document.removeEventListener('mousemove', handleReorderMouseMove);
        document.removeEventListener('mouseup', handleReorderMouseUp);
      };
    }
  }, [isReordering, handleReorderMouseMove, handleReorderMouseUp]);

  // Cleanup timer on unmount
  useEffect(() => {
    return () => {
      if (longPressTimerRef.current) {
        clearTimeout(longPressTimerRef.current);
      }
    };
  }, []);

  // ---- Render ----
  return (
    <div ref={containerRef} className={`resizable-panels ${className}`}>
      {panels.map((panel, index) => {
        const isCollapsed = collapsedPanels.has(panel.id);
        const isReorderTarget = reorderIndex === index;
        const width = isCollapsed ? 0 : widths[index];

        return (
          <React.Fragment key={panel.id}>
            {/* Collapsed tab — vertical label to re-expand */}
            {isCollapsed && (
              <div
                className="panel-collapsed-tab"
                onClick={() => toggleCollapse(panel.id)}
                title={`展开 ${panel.title}`}
              >
                <div className="collapsed-tab-icon">{panel.icon}</div>
                <div className="collapsed-tab-text">{panel.title}</div>
              </div>
            )}

            <div
              className={`resizable-panel ${isCollapsed ? 'collapsed' : ''} ${isReorderTarget ? 'reordering' : ''}`}
              style={{
                width: isCollapsed ? 0 : `${width}%`,
                ...(isReorderTarget ? { transform: `translateX(${reorderOffsetX}px)`, opacity: 0.7 } : {}),
              }}
            >
              <div
                className={`panel-header ${isReordering ? 'reorder-active' : ''}`}
                onMouseDown={(e) => handleHeaderMouseDown(index, e)}
                onMouseUp={handleHeaderMouseUp}
              >
                <div className="panel-header-left">
                  {panel.icon && <span className="panel-icon">{panel.icon}</span>}
                  <span className="panel-title">{panel.title}</span>
                </div>
                {panel.collapsible && (
                  <button
                    className="panel-collapse-btn"
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleCollapse(panel.id);
                    }}
                    title={isCollapsed ? '展开' : '折叠'}
                  >
                    {isCollapsed ? '◀' : '▶'}
                  </button>
                )}
              </div>
              <div className="panel-content">
                {isCollapsed ? null : children[index]}
              </div>
            </div>

            {index < panels.length - 1 && (
              <div
                className={`panel-resize-handle ${dragging === index ? 'active' : ''}`}
                onMouseDown={(e) => handleResizeMouseDown(index, e)}
              >
                <div className="resize-handle-line" />
              </div>
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
};

export default ResizablePanels;
