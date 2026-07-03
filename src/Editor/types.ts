import type { ThemeName } from "../themes";
import type { ImageSettings } from "../ImageManager";
import type { EditorSettings } from "../Settings";

export interface EditorHandle {
  getValue: () => string;
  setValue: (value: string) => void;
  insertTextAtCursor: (text: string) => void;
  replaceRangeWithWikiLink: (fromPos: number, noteName: string, heading?: string, display?: string) => void;
  resize: () => void;
  highlightSearch: (query: string) => void;
  clearHighlight: () => void;
  executeCommand: (name: string) => void;
  scrollToHeading: (text: string, line: number) => void;
  scrollToLine: (line: number) => void;
  getCursorOffset: () => number;
  isSourceMode: () => boolean;
}

export type EditorMode = "ir" | "sv";

export const MODE_LABELS: Record<EditorMode, string> = {
  ir: "IR",
  sv: "SV",
};

export interface EditorProps {
  value: string;
  onChange: (value: string) => void;
  mode: EditorMode;
  theme: ThemeName;
  typewriterMode?: boolean;
  editorSettings?: EditorSettings;
  imageSettings?: ImageSettings;
  currentFilePath?: string | null;
  activeVaultPath?: string | null;
  onWordCount?: (count: number) => void;
}
