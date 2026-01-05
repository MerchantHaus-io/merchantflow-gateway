import { useState, useRef, useCallback, useEffect } from 'react';
import { Opportunity, OpportunityStage } from '@/types/opportunity';

interface TouchDragState {
  isDragging: boolean;
  draggedOpportunity: Opportunity | null;
  currentX: number;
  currentY: number;
  startX: number;
  startY: number;
  dragElement: HTMLElement | null;
}

interface UseTouchDragOptions {
  onDrop: (opportunity: Opportunity, stage: OpportunityStage, pipelineType: 'processing' | 'gateway') => void;
  enabled?: boolean;
}

export function useTouchDrag({ onDrop, enabled = true }: UseTouchDragOptions) {
  const [touchDragState, setTouchDragState] = useState<TouchDragState>({
    isDragging: false,
    draggedOpportunity: null,
    currentX: 0,
    currentY: 0,
    startX: 0,
    startY: 0,
    dragElement: null,
  });

  const longPressTimerRef = useRef<NodeJS.Timeout | null>(null);
  const dragCloneRef = useRef<HTMLElement | null>(null);
  const scrollIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Clean up drag clone on unmount
  useEffect(() => {
    return () => {
      if (dragCloneRef.current) {
        dragCloneRef.current.remove();
        dragCloneRef.current = null;
      }
      if (longPressTimerRef.current) {
        clearTimeout(longPressTimerRef.current);
      }
      if (scrollIntervalRef.current) {
        clearInterval(scrollIntervalRef.current);
      }
    };
  }, []);

  const createDragClone = useCallback((element: HTMLElement, x: number, y: number) => {
    const clone = element.cloneNode(true) as HTMLElement;
    clone.id = 'touch-drag-clone';
    clone.style.cssText = `
      position: fixed;
      left: ${x - 50}px;
      top: ${y - 30}px;
      width: ${element.offsetWidth}px;
      z-index: 10000;
      pointer-events: none;
      opacity: 0.9;
      transform: scale(1.05) rotate(2deg);
      box-shadow: 0 10px 40px rgba(0,0,0,0.3);
      transition: transform 0.1s ease-out;
    `;
    document.body.appendChild(clone);
    dragCloneRef.current = clone;
    return clone;
  }, []);

  const updateDragClonePosition = useCallback((x: number, y: number) => {
    if (dragCloneRef.current) {
      dragCloneRef.current.style.left = `${x - 50}px`;
      dragCloneRef.current.style.top = `${y - 30}px`;
    }
  }, []);

  const removeDragClone = useCallback(() => {
    if (dragCloneRef.current) {
      dragCloneRef.current.remove();
      dragCloneRef.current = null;
    }
  }, []);

  const findDropTarget = useCallback((x: number, y: number): { stage: OpportunityStage; pipelineType: 'processing' | 'gateway' } | null => {
    // Hide the clone temporarily to find elements underneath
    if (dragCloneRef.current) {
      dragCloneRef.current.style.display = 'none';
    }

    const elementsAtPoint = document.elementsFromPoint(x, y);
    
    if (dragCloneRef.current) {
      dragCloneRef.current.style.display = '';
    }

    // Find a PipelineColumn element
    for (const element of elementsAtPoint) {
      // Check for pipeline container
      const pipelineContainer = element.closest('[data-pipeline]') as HTMLElement;
      const columnElement = element.closest('[data-stage]') as HTMLElement;
      
      if (columnElement && pipelineContainer) {
        const stage = columnElement.dataset.stage as OpportunityStage;
        const pipelineType = pipelineContainer.dataset.pipeline as 'processing' | 'gateway';
        
        if (stage && pipelineType) {
          return { stage, pipelineType };
        }
      }
    }

    return null;
  }, []);

  const handleTouchStart = useCallback((e: React.TouchEvent, opportunity: Opportunity, element: HTMLElement) => {
    if (!enabled) return;

    const touch = e.touches[0];
    const startX = touch.clientX;
    const startY = touch.clientY;

    // Start long press timer (300ms to initiate drag)
    longPressTimerRef.current = setTimeout(() => {
      // Haptic feedback if available
      if (navigator.vibrate) {
        navigator.vibrate(50);
      }

      setTouchDragState({
        isDragging: true,
        draggedOpportunity: opportunity,
        currentX: startX,
        currentY: startY,
        startX,
        startY,
        dragElement: element,
      });

      createDragClone(element, startX, startY);

      // Add visual feedback to original element
      element.style.opacity = '0.4';
    }, 300);

    setTouchDragState(prev => ({
      ...prev,
      startX,
      startY,
    }));
  }, [enabled, createDragClone]);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    const touch = e.touches[0];
    const currentX = touch.clientX;
    const currentY = touch.clientY;

    // Cancel long press if moved too much before drag started (user is swiping)
    if (longPressTimerRef.current && !touchDragState.isDragging) {
      const dx = Math.abs(currentX - touchDragState.startX);
      const dy = Math.abs(currentY - touchDragState.startY);
      // Lower threshold so swipe is detected quickly
      if (dx > 5 || dy > 5) {
        clearTimeout(longPressTimerRef.current);
        longPressTimerRef.current = null;
        // Don't prevent default - allow native scroll to happen
        return;
      }
    }

    // If not dragging, allow native scroll behavior
    if (!touchDragState.isDragging) return;

    // Only prevent default when we're actually dragging after long-press
    e.preventDefault();
    e.stopPropagation();
    
    updateDragClonePosition(currentX, currentY);

    setTouchDragState(prev => ({
      ...prev,
      currentX,
      currentY,
    }));

    // Auto-scroll when near edges
    const scrollContainer = document.querySelector('[data-scroll-container]');
    if (scrollContainer) {
      const rect = scrollContainer.getBoundingClientRect();
      const threshold = 50;
      
      if (scrollIntervalRef.current) {
        clearInterval(scrollIntervalRef.current);
      }

      if (currentX < rect.left + threshold) {
        scrollIntervalRef.current = setInterval(() => {
          scrollContainer.scrollLeft -= 5;
        }, 16);
      } else if (currentX > rect.right - threshold) {
        scrollIntervalRef.current = setInterval(() => {
          scrollContainer.scrollLeft += 5;
        }, 16);
      }
    }
  }, [touchDragState.isDragging, touchDragState.startX, touchDragState.startY, updateDragClonePosition]);

  const handleTouchEnd = useCallback((e: React.TouchEvent) => {
    // Clear timers
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
    if (scrollIntervalRef.current) {
      clearInterval(scrollIntervalRef.current);
      scrollIntervalRef.current = null;
    }

    if (!touchDragState.isDragging || !touchDragState.draggedOpportunity) {
      return;
    }

    const touch = e.changedTouches[0];
    const dropTarget = findDropTarget(touch.clientX, touch.clientY);

    if (dropTarget && touchDragState.draggedOpportunity) {
      // Haptic feedback on successful drop
      if (navigator.vibrate) {
        navigator.vibrate([30, 50, 30]);
      }
      
      onDrop(touchDragState.draggedOpportunity, dropTarget.stage, dropTarget.pipelineType);
    }

    // Reset original element opacity
    if (touchDragState.dragElement) {
      touchDragState.dragElement.style.opacity = '';
    }

    removeDragClone();

    setTouchDragState({
      isDragging: false,
      draggedOpportunity: null,
      currentX: 0,
      currentY: 0,
      startX: 0,
      startY: 0,
      dragElement: null,
    });
  }, [touchDragState, findDropTarget, onDrop, removeDragClone]);

  const handleTouchCancel = useCallback(() => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
    if (scrollIntervalRef.current) {
      clearInterval(scrollIntervalRef.current);
      scrollIntervalRef.current = null;
    }

    if (touchDragState.dragElement) {
      touchDragState.dragElement.style.opacity = '';
    }

    removeDragClone();

    setTouchDragState({
      isDragging: false,
      draggedOpportunity: null,
      currentX: 0,
      currentY: 0,
      startX: 0,
      startY: 0,
      dragElement: null,
    });
  }, [touchDragState.dragElement, removeDragClone]);

  return {
    touchDragState,
    handleTouchStart,
    handleTouchMove,
    handleTouchEnd,
    handleTouchCancel,
  };
}
