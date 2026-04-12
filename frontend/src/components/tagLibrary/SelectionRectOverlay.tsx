import React from 'react';
import { createPortal } from 'react-dom';

interface SelectionRect {
  startX: number;
  startY: number;
  endX: number;
  endY: number;
}

interface SelectionRectOverlayProps {
  isDraggingSelect: boolean;
  selectionRect: SelectionRect | null;
}

const SelectionRectOverlay: React.FC<SelectionRectOverlayProps> = ({
  isDraggingSelect,
  selectionRect,
}) => {
  if (!isDraggingSelect || !selectionRect) return null;

  return createPortal(
    <div className="taglib-selection-rect" style={{
      position: 'fixed',
      left: Math.min(selectionRect.startX, selectionRect.endX),
      top: Math.min(selectionRect.startY, selectionRect.endY),
      width: Math.abs(selectionRect.endX - selectionRect.startX),
      height: Math.abs(selectionRect.endY - selectionRect.startY),
      border: '1.5px dashed var(--primary-600)',
      background: 'var(--primary-50)',
      borderRadius: '6px',
      pointerEvents: 'none',
      zIndex: 2147483647,
    }} />,
    document.body
  );
};

export default SelectionRectOverlay;
