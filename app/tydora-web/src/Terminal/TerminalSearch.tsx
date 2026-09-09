import { useState, useRef, useEffect, useCallback } from "react";
import { useTranslation } from "react-i18next";
import type { Terminal as XTerm } from "@xterm/xterm";

interface TerminalSearchProps {
  terminal: XTerm;
  onClose: () => void;
}

interface Match {
  line: number;
  col: number;
  length: number;
}

export function TerminalSearch({ terminal, onClose }: TerminalSearchProps) {
  const { t } = useTranslation();
  const [query, setQuery] = useState("");
  const [matches, setMatches] = useState<Match[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [matchCase, setMatchCase] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const performSearch = useCallback(
    (searchText: string): Match[] => {
      if (!searchText) return [];
      const found: Match[] = [];
      const activeBuffer = terminal.buffer.active;
      const totalLines = activeBuffer.length;

      for (let y = 0; y < totalLines; y++) {
        const line = activeBuffer.getLine(y);
        if (!line) continue;
        const text = line.translateToString(true);
        if (!text) continue;

        const searchInLine = matchCase ? text : text.toLowerCase();
        const needle = matchCase ? searchText : searchText.toLowerCase();
        let start = 0;

        while (start < searchInLine.length) {
          const idx = searchInLine.indexOf(needle, start);
          if (idx === -1) break;
          found.push({ line: y, col: idx, length: needle.length });
          start = idx + needle.length;
        }
      }
      return found;
    },
    [terminal, matchCase],
  );

  const jumpToMatch = useCallback(
    (index: number) => {
      if (matches.length === 0) return;
      const match = matches[index];
      if (!match) return;

      terminal.clearSelection();
      terminal.select(match.col, match.line, match.length);
      terminal.scrollToLine(match.line);
      setCurrentIndex(index);
    },
    [terminal, matches],
  );

  const findNext = useCallback(() => {
    if (matches.length === 0) return;
    const next = (currentIndex + 1) % matches.length;
    jumpToMatch(next);
  }, [matches.length, currentIndex, jumpToMatch]);

  const findPrev = useCallback(() => {
    if (matches.length === 0) return;
    const prev = (currentIndex - 1 + matches.length) % matches.length;
    jumpToMatch(prev);
  }, [matches.length, currentIndex, jumpToMatch]);

  const handleSearch = useCallback(
    (value: string) => {
      setQuery(value);
      const results = performSearch(value);
      setMatches(results);
      setCurrentIndex(0);
      if (results.length > 0) {
        jumpToMatch(0);
      } else {
        terminal.clearSelection();
      }
    },
    [performSearch, jumpToMatch, terminal],
  );

  useEffect(() => {
    inputRef.current?.focus();
    return () => {
      terminal.clearSelection();
    };
  }, [terminal]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      } else if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        findNext();
      } else if (e.key === "Enter" && e.shiftKey) {
        e.preventDefault();
        findPrev();
      }
    };
    const input = inputRef.current;
    input?.addEventListener("keydown", handler);
    return () => {
      input?.removeEventListener("keydown", handler);
    };
  }, [findNext, findPrev, onClose]);

  const matchCount = matches.length;

  return (
    <div className="terminal-search-bar">
      <div className="terminal-search-input-wrap">
        <svg
          className="terminal-search-icon"
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <circle cx="11" cy="11" r="8" />
          <line x1="21" y1="21" x2="16.65" y2="16.65" />
        </svg>
        <input
          ref={inputRef}
          className="terminal-search-input"
          type="text"
          placeholder={t("settings.terminal.search.placeholder")}
          value={query}
          onChange={(e) => handleSearch(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Escape") onClose();
          }}
        />
        {query && (
          <button
            className="terminal-search-clear"
            title={t("settings.terminal.search.clear")}
            onClick={() => handleSearch("")}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        )}
      </div>

      <div className="terminal-search-match-count">
        {query && matchCount > 0 ? (
          <span>
            {currentIndex + 1} / {matchCount}
          </span>
        ) : query ? (
          <span>{t("settings.terminal.search.noResults")}</span>
        ) : null}
      </div>

      <div className="terminal-search-actions">
        <button
          className="terminal-search-btn"
          title={t("settings.terminal.search.prev")}
          onClick={findPrev}
          disabled={matchCount === 0}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="18 15 12 9 6 15" />
          </svg>
        </button>
        <button
          className="terminal-search-btn"
          title={t("settings.terminal.search.next")}
          onClick={findNext}
          disabled={matchCount === 0}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </button>
        <button
          className={`terminal-search-btn${matchCase ? " active" : ""}`}
          title={t("settings.terminal.search.matchCase")}
          onClick={() => setMatchCase((v) => !v)}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <text x="4" y="17" fontSize="14" fontWeight="bold" fill="currentColor" stroke="none">Aa</text>
          </svg>
        </button>
        <button
          className="terminal-search-btn terminal-search-close"
          title={t("settings.terminal.search.close")}
          onClick={onClose}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>
    </div>
  );
}
