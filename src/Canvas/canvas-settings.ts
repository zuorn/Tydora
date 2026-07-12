// Canvas settings storage and management

export interface CanvasSettings {
  // Storage location for new canvases
  storageLocation: 'vault-root' | 'current-folder' | 'custom-folder';
  customFolder: string;

  // Grid alignment
  snapToGrid: boolean;
  snapToObjects: boolean;
  gridSize: number;

  // Display options
  hideContentZoomThreshold: number;
  minimapEnabled: boolean;
  minimapPosition: 'top-left' | 'bottom-left' | 'bottom-right';

  // Default card sizes
  defaultTextCardSize: { width: number; height: number };
  defaultNoteCardSize: { width: number; height: number };
  defaultMediaCardSize: { width: number; height: number };
}

export const CANVAS_SETTINGS_KEY = 'zmd-canvas-settings';

export const DEFAULT_CANVAS_SETTINGS: CanvasSettings = {
  storageLocation: 'vault-root',
  customFolder: 'assets',
  snapToGrid: true,
  snapToObjects: true,
  gridSize: 15,
  hideContentZoomThreshold: 0.3,
  minimapEnabled: true,
  minimapPosition: 'bottom-right',
  defaultTextCardSize: { width: 250, height: 60 },
  defaultNoteCardSize: { width: 400, height: 400 },
  defaultMediaCardSize: { width: 400, height: 300 },
};

export function loadCanvasSettings(): CanvasSettings {
  try {
    const saved = localStorage.getItem(CANVAS_SETTINGS_KEY);
    if (saved) {
      return { ...DEFAULT_CANVAS_SETTINGS, ...JSON.parse(saved) };
    }
  } catch {}
  return { ...DEFAULT_CANVAS_SETTINGS };
}

export function saveCanvasSettings(settings: CanvasSettings): void {
  localStorage.setItem(CANVAS_SETTINGS_KEY, JSON.stringify(settings));
}

export function updateCanvasSettings(partial: Partial<CanvasSettings>): CanvasSettings {
  const current = loadCanvasSettings();
  const updated = { ...current, ...partial };
  saveCanvasSettings(updated);
  return updated;
}
