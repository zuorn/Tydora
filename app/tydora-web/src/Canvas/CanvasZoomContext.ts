import { createContext, useContext } from 'react';

interface CanvasZoomContextValue {
  zoom: number;
  hideContentThreshold: number;
}

export const CanvasZoomContext = createContext<CanvasZoomContextValue>({
  zoom: 1,
  hideContentThreshold: 0.3,
});

export function useCanvasZoom() {
  return useContext(CanvasZoomContext);
}

export function shouldHideContent(zoom: number, threshold: number): boolean {
  return zoom < threshold;
}
