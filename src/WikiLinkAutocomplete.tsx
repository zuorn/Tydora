// src/WikiLinkAutocomplete.tsx

import { useState, useEffect, useRef } from "react";
import { LinkIndexService } from "./LinkIndexService";
import "./WikiLinkAutocomplete.css";

interface WikiLinkAutocompleteProps {
  query: string;
  position: { x: number; y: number } | null;
  onSelect: (noteName: string) => void;
  onClose: () => void;
}

export function WikiLinkAutocomplete({ query, position, onSelect, onClose }: WikiLinkAutocompleteProps) {
  const [suggestions, setSuggestions] = useState<{ name: string; path: string }[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);
  
  useEffect(() => {
    const results = LinkIndexService.searchNotes(query);
    setSuggestions(results);
    setSelectedIndex(0);
  }, [query]);
  
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex(i => Math.min(i + 1, suggestions.length - 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex(i => Math.max(i - 1, 0));
      } else if (e.key === 'Enter') {
        e.preventDefault();
        if (suggestions.length > 0 && suggestions[selectedIndex]) {
          onSelect(suggestions[selectedIndex].name);
        } else if (query.trim()) {
          onSelect(query.trim());
        }
      } else if (e.key === 'Escape') {
        onClose();
      }
    };
    
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [suggestions, selectedIndex, onSelect, onClose]);
  
  if (!position) return null;
  
  return (
    <div 
      className="wiki-autocomplete" 
      ref={listRef}
      style={{ left: position.x, top: position.y }}
    >
      {suggestions.length === 0 ? (
        <div className="wiki-autocomplete-empty">无匹配结果，Enter 创建新笔记</div>
      ) : (
        suggestions.map((s, i) => (
          <div
            key={s.path}
            className={`wiki-autocomplete-item ${i === selectedIndex ? 'selected' : ''}`}
            onClick={() => onSelect(s.name)}
          >
            {s.name}
          </div>
        ))
      )}
    </div>
  );
}
