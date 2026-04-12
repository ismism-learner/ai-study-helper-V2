import { useState, useRef, useEffect, useCallback } from 'react';
import { Position } from './types';

export function usePanelDrag() {
  const [position, setPosition] = useState<Position>({
    x: typeof window !== 'undefined' ? window.innerWidth - 420 : 500,
    y: 80
  });
  const [isDragging, setIsDragging] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const isDraggingRef = useRef(false);
  const dragOffsetRef = useRef<Position>({ x: 0, y: 0 });

  const handlePointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement;
    const isButton = target.tagName === 'BUTTON' || !!target.closest('button');
    const isInput = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA';

    if (isButton || isInput) return;

    if (panelRef.current) {
      e.preventDefault();
      e.stopPropagation();

      const rect = panelRef.current.getBoundingClientRect();

      dragOffsetRef.current = {
        x: e.clientX - rect.left,
        y: e.clientY - rect.top
      };

      isDraggingRef.current = true;
      setIsDragging(true);

      try {
        panelRef.current.setPointerCapture(e.pointerId);
      } catch (err) {
        // Ignore pointer capture errors
      }
    }
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const handlePointerMove = (e: PointerEvent) => {
      if (!isDraggingRef.current) return;

      const newX = e.clientX - dragOffsetRef.current.x;
      const newY = e.clientY - dragOffsetRef.current.y;

      const maxX = window.innerWidth - 380;
      const maxY = window.innerHeight - 100;

      setPosition({
        x: Math.max(0, Math.min(newX, maxX)),
        y: Math.max(0, Math.min(newY, maxY))
      });
    };

    const handlePointerUp = (e: PointerEvent) => {
      if (isDraggingRef.current && panelRef.current) {
        try {
          panelRef.current.releasePointerCapture(e.pointerId);
        } catch (err) {
          // Ignore
        }
      }
      isDraggingRef.current = false;
      setIsDragging(false);
    };

    const handleMouseMove = (e: MouseEvent) => {
      if (!isDraggingRef.current) return;

      const newX = e.clientX - dragOffsetRef.current.x;
      const newY = e.clientY - dragOffsetRef.current.y;

      const maxX = window.innerWidth - 380;
      const maxY = window.innerHeight - 100;

      setPosition({
        x: Math.max(0, Math.min(newX, maxX)),
        y: Math.max(0, Math.min(newY, maxY))
      });
    };

    const handleMouseUp = () => {
      isDraggingRef.current = false;
      setIsDragging(false);
    };

    const handleBlur = () => {
      isDraggingRef.current = false;
      setIsDragging(false);
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    window.addEventListener('blur', handleBlur);

    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
      window.removeEventListener('blur', handleBlur);
    };
  }, []);

  const handlePanelMouseMove = useCallback((e: React.MouseEvent) => {
    if (!isDraggingRef.current) return;

    const newX = e.clientX - dragOffsetRef.current.x;
    const newY = e.clientY - dragOffsetRef.current.y;

    const maxX = window.innerWidth - 380;
    const maxY = window.innerHeight - 100;

    setPosition({
      x: Math.max(0, Math.min(newX, maxX)),
      y: Math.max(0, Math.min(newY, maxY))
    });
  }, []);

  const handlePanelMouseUp = useCallback(() => {
    isDraggingRef.current = false;
    setIsDragging(false);
  }, []);

  return {
    position,
    isDragging,
    panelRef,
    isDraggingRef,
    handlePointerDown,
    handlePanelMouseMove,
    handlePanelMouseUp,
  };
}
