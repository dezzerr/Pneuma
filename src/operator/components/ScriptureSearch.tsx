import { useState, useCallback, useRef, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useOperatorStore } from "../store";
import { Search, Send, Plus, X, ChevronRight, BookOpen, MessageSquare } from "lucide-react";
import type { VerseQueueItem, DetectedScripture, PlaylistItem } from "@/shared/types";
import { MAX_CHAPTERS, filterBooks, bookNameToIndex } from "./bookData";

interface SearchResult {
  id: number;
  translation_code: string;
  book_index: number;
  book_name: string;
  chapter_number: number;
  verse_number: number;
  verse_text: string;
}

export function ScriptureSearch() {
  const {
    stageItem,
    goLive,
    addToPlaylist,
    searchMode,
    toggleSearchMode,
    setSearchResultsCount,
    rapidSelectIndex,
    setRapidSelectIndex,
  } = useOperatorStore();

  // Semantic search state
  const [semanticQuery, setSemanticQuery] = useState("");
  const [semanticResults, setSemanticResults] = useState<SearchResult[]>([]);
  const [semanticLoading, setSemanticLoading] = useState(false);
  const semanticInputRef = useRef<HTMLInputElement>(null);

  // Stepped picker state
  const [bookQuery, setBookQuery] = useState("");
  const [selectedBook, setSelectedBook] = useState<string | null>(null);
  const [chapter, setChapter] = useState("");
  const [verseStart, setVerseStart] = useState("");
  const [verseEnd, setVerseEnd] = useState("");
  const [showBookDropdown, setShowBookDropdown] = useState(false);
  const [highlightedBookIndex, setHighlightedBookIndex] = useState(0);
  const [results, setResults] = useState<SearchResult[]>([]);
  const [selectedVerses, setSelectedVerses] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);

  const bookInputRef = useRef<HTMLInputElement>(null);
  const chapterInputRef = useRef<HTMLInputElement>(null);
  const verseStartInputRef = useRef<HTMLInputElement>(null);
  const verseEndInputRef = useRef<HTMLInputElement>(null);
  const bookWrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (!bookWrapperRef.current?.contains(e.target as Node)) {
        setShowBookDropdown(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  // Report results count to store for hotkey support
  useEffect(() => {
    if (searchMode === "reference") {
      setSearchResultsCount(results.length);
    } else {
      setSearchResultsCount(semanticResults.length);
    }
  }, [results, semanticResults, searchMode, setSearchResultsCount]);

  // Handle rapid verse select (0-9 hotkey)
  useEffect(() => {
    if (rapidSelectIndex === null) return;
    const activeResults = searchMode === "reference" ? results : semanticResults;
    const verse = activeResults[rapidSelectIndex];
    if (verse) {
      setSelectedVerses([verse]);
    }
    setRapidSelectIndex(null);
  }, [rapidSelectIndex, results, semanticResults, searchMode, setRapidSelectIndex]);

  // Semantic search handler
  const handleSemanticSearch = useCallback(async (query: string) => {
    if (!query.trim()) {
      setSemanticResults([]);
      return;
    }
    setSemanticLoading(true);
    try {
      const rows = await invoke<SearchResult[]>("db_search_text", {
        translationCode: useOperatorStore.getState().appSettings.active_translation,
        query: query.trim(),
        limit: 50,
      });
      setSemanticResults(rows);
    } catch (err) {
      console.error("[ScriptureSearch] Semantic search failed:", err);
      setSemanticResults([]);
    } finally {
      setSemanticLoading(false);
    }
  }, []);

  // Focus appropriate input when mode changes
  useEffect(() => {
    if (searchMode === "reference") {
      bookInputRef.current?.focus();
    } else {
      semanticInputRef.current?.focus();
    }
  }, [searchMode]);

  const bookIndex = selectedBook ? bookNameToIndex(selectedBook) : null;
  const maxChapter = bookIndex ? MAX_CHAPTERS[bookIndex] : null;
  const chapterNum = chapter ? parseInt(chapter, 10) : null;
  const maxVerse = results.length > 0 ? results[results.length - 1].verse_number : null;

  const filteredBooks = filterBooks(bookQuery);

  const resetAll = useCallback(() => {
    setBookQuery("");
    setSelectedBook(null);
    setChapter("");
    setVerseStart("");
    setVerseEnd("");
    setResults([]);
    setSelectedVerses([]);
    setShowBookDropdown(false);
    setHighlightedBookIndex(0);
    bookInputRef.current?.focus();
  }, []);

  const fetchChapterVerses = useCallback(async (bookName: string, chapterNum: number) => {
    setLoading(true);
    try {
      const idx = bookNameToIndex(bookName);
      if (!idx) return;
      const rows = await invoke<SearchResult[]>("db_query_verses", {
        translationCode: useOperatorStore.getState().appSettings.active_translation,
        bookIndex: idx,
        chapter: chapterNum,
        verseStart: 1,
        verseEnd: 200,
      });
      setResults(rows);
    } catch (err) {
      console.error("[ScriptureSearch] Fetch chapter failed:", err);
      setResults([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (selectedBook && chapterNum && chapterNum > 0 && (!maxChapter || chapterNum <= maxChapter)) {
      fetchChapterVerses(selectedBook, chapterNum);
    }
  }, [selectedBook, chapterNum, maxChapter, fetchChapterVerses]);

  // Auto-select verses when results + verse range change
  useEffect(() => {
    const start = verseStart ? parseInt(verseStart, 10) : 0;
    const end = verseEnd ? parseInt(verseEnd, 10) : start;
    if (start > 0 && end >= start && results.length > 0) {
      const selected = results.filter((v) => v.verse_number >= start && v.verse_number <= end);
      setSelectedVerses(selected);
    } else {
      setSelectedVerses([]);
    }
  }, [results, verseStart, verseEnd]);

  const handleSelectBook = useCallback((book: string) => {
    setSelectedBook(book);
    setBookQuery(book);
    setShowBookDropdown(false);
    setHighlightedBookIndex(0);
    setChapter("");
    setVerseStart("");
    setVerseEnd("");
    setResults([]);
    setSelectedVerses([]);
    // Focus chapter after a tick so the dropdown closes first
    setTimeout(() => chapterInputRef.current?.focus(), 0);
  }, []);

  const handleBookKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!showBookDropdown) {
      if (e.key === "ArrowDown" || e.key === "ArrowUp" || e.key === "Enter") {
        setShowBookDropdown(true);
      }
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlightedBookIndex((i) => Math.min(i + 1, filteredBooks.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlightedBookIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const book = filteredBooks[highlightedBookIndex];
      if (book) handleSelectBook(book);
    } else if (e.key === "Escape") {
      setShowBookDropdown(false);
    } else if (e.key === "Tab" && filteredBooks.length > 0) {
      e.preventDefault();
      handleSelectBook(filteredBooks[0]);
    }
  };

  const clampChapter = (value: string) => {
    const num = parseInt(value, 10);
    if (Number.isNaN(num)) return "";
    if (maxChapter && num > maxChapter) return String(maxChapter);
    return String(num);
  };

  const handleChapterKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" || e.key === ":" || e.key === " ") {
      e.preventDefault();
      if (chapterNum && chapterNum > 0) {
        verseStartInputRef.current?.focus();
      }
    } else if (e.key === "Backspace" && chapter === "") {
      setSelectedBook(null);
      setBookQuery("");
      setTimeout(() => bookInputRef.current?.focus(), 0);
    }
  };

  const clampVerse = (value: string) => {
    const num = parseInt(value, 10);
    if (Number.isNaN(num)) return "";
    if (maxVerse && num > maxVerse) return String(maxVerse);
    return String(num);
  };

  const handleVerseStartKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "-" || e.key === "Tab") {
      e.preventDefault();
      verseEndInputRef.current?.focus();
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (verseStart) verseEndInputRef.current?.focus();
    } else if (e.key === "Backspace" && verseStart === "") {
      setChapter("");
      setTimeout(() => chapterInputRef.current?.focus(), 0);
    }
  };

  const handleVerseEndKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      const start = verseStart ? parseInt(verseStart, 10) : 0;
      const end = verseEnd ? parseInt(verseEnd, 10) : start;
      if (start > 0) {
        const selected = results.filter(
          (v) => v.verse_number >= start && v.verse_number <= (end >= start ? end : start),
        );
        setSelectedVerses(selected);
      }
    } else if (e.key === "Backspace" && verseEnd === "") {
      setVerseStart("");
      setTimeout(() => verseStartInputRef.current?.focus(), 0);
    }
  };

  const buildVerseQueueItem = (verses: SearchResult[]): VerseQueueItem => {
    const first = verses[0];
    const last = verses[verses.length - 1];
    const scripture: DetectedScripture = {
      match_type: "REGEX",
      book_id: first.book_index,
      book_name: first.book_name,
      chapter: first.chapter_number,
      verse_start: first.verse_number,
      verse_end: last.verse_number,
      score: 1.0,
    };
    return {
      id: `search-${Date.now()}`,
      scripture,
      verse_text: verses.map((v) => v.verse_text).join(" "),
      verses: verses.map((v) => ({ verse_number: v.verse_number, text: v.verse_text })),
      confidence: 1,
      match_type: "REGEX",
      status: "queued",
      timestamp: Date.now(),
    };
  };

  const handleStage = () => {
    if (selectedVerses.length === 0) return;
    stageItem(buildVerseQueueItem(selectedVerses));
  };

  const handleGoLive = () => {
    if (selectedVerses.length === 0) return;
    goLive(buildVerseQueueItem(selectedVerses));
  };

  const handleAddToPlaylist = () => {
    if (selectedVerses.length === 0) return;
    const first = selectedVerses[0];
    const last = selectedVerses[selectedVerses.length - 1];
    const ref =
      first.verse_number === last.verse_number
        ? `${first.book_name} ${first.chapter_number}:${first.verse_number}`
        : `${first.book_name} ${first.chapter_number}:${first.verse_number}-${last.verse_number}`;
    const item: PlaylistItem = {
      id: `pl-${Date.now()}`,
      type: "verse",
      label: ref,
      scripture: {
        match_type: "REGEX",
        book_id: first.book_index,
        book_name: first.book_name,
        chapter: first.chapter_number,
        verse_start: first.verse_number,
        verse_end: last.verse_number,
        score: 1.0,
      },
      verse_text: selectedVerses.map((v) => v.verse_text).join(" "),
      verses: selectedVerses.map((v) => ({ verse_number: v.verse_number, text: v.verse_text })),
    };
    addToPlaylist(item);
    setSelectedVerses([]);
  };

  const toggleVerse = (verse: SearchResult) => {
    setSelectedVerses((prev) => {
      const exists = prev.find(
        (v) => v.verse_number === verse.verse_number && v.chapter_number === verse.chapter_number,
      );
      if (exists) {
        return prev.filter(
          (v) =>
            !(v.verse_number === verse.verse_number && v.chapter_number === verse.chapter_number),
        );
      }
      return [...prev, verse].sort((a, b) => a.verse_number - b.verse_number);
    });
  };

  return (
    <div className="flex h-full flex-col overflow-hidden p-4">
      <div className="mb-3 flex items-center gap-2">
        <div className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/10">
          <Search className="h-3.5 w-3.5 text-primary" />
        </div>
        <h2 className="text-sm font-semibold text-foreground">Scripture Search</h2>
        {/* Mode toggle indicator */}
        <div className="ml-auto flex items-center gap-1 rounded-full border border-border px-1 py-0.5">
          <button
            onClick={() => searchMode !== "reference" && toggleSearchMode()}
            className={`flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium transition-colors ${
              searchMode === "reference"
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-secondary"
            }`}
          >
            <BookOpen className="h-3 w-3" />
            Ref
          </button>
          <button
            onClick={() => searchMode !== "semantic" && toggleSearchMode()}
            className={`flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium transition-colors ${
              searchMode === "semantic"
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-secondary"
            }`}
          >
            <MessageSquare className="h-3 w-3" />
            Text
          </button>
        </div>
      </div>

      {searchMode === "semantic" ? (
        <>
          {/* Semantic search input */}
          <div className="mb-3 flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <input
                ref={semanticInputRef}
                data-search-book
                type="text"
                value={semanticQuery}
                onChange={(e) => {
                  setSemanticQuery(e.target.value);
                  handleSemanticSearch(e.target.value);
                }}
                placeholder="Search verse text..."
                className="w-full rounded-xl border border-input bg-card pl-8 pr-3 py-2 text-xs text-foreground outline-none focus:border-primary"
              />
            </div>
            <button
              onClick={() => {
                setSemanticQuery("");
                setSemanticResults([]);
              }}
              className="rounded-full p-2 text-muted-foreground transition-colors hover:bg-secondary"
              title="Clear"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>

          {/* Semantic results */}
          <div className="flex-1 space-y-1.5 overflow-y-auto pr-1">
            {semanticResults.map((verse, i) => {
              const isSelected = selectedVerses.some(
                (v) =>
                  v.verse_number === verse.verse_number &&
                  v.chapter_number === verse.chapter_number,
              );
              return (
                <div
                  key={`${verse.book_index}-${verse.chapter_number}-${verse.verse_number}`}
                  onClick={() => toggleVerse(verse)}
                  className={`cursor-pointer rounded-xl border px-3 py-2.5 transition-colors ${
                    isSelected
                      ? "border-primary bg-primary/10"
                      : "border-border bg-card hover:border-primary/30"
                  }`}
                >
                  <div className="flex items-baseline gap-2">
                    {i < 9 && (
                      <span className="min-w-[16px] rounded bg-secondary px-1 text-[9px] font-bold text-muted-foreground">
                        {i + 1}
                      </span>
                    )}
                    <span className="min-w-[60px] text-[10px] font-bold text-primary">
                      {verse.book_name} {verse.chapter_number}:{verse.verse_number}
                    </span>
                    <p className="text-xs text-foreground line-clamp-2">{verse.verse_text}</p>
                  </div>
                </div>
              );
            })}
            {semanticResults.length === 0 && !semanticLoading && !semanticQuery && (
              <div className="flex h-full items-center justify-center text-center">
                <p className="text-xs text-muted-foreground/60">
                  Type to search verses by text content.
                </p>
              </div>
            )}
            {semanticResults.length === 0 && !semanticLoading && semanticQuery && (
              <div className="flex h-full items-center justify-center text-center">
                <p className="text-xs text-muted-foreground/60">
                  No verses found matching &quot;{semanticQuery}&quot;
                </p>
              </div>
            )}
          </div>
        </>
      ) : (
        <>
          {/* Breadcrumb */}
          <div className="mb-3 flex items-center gap-1 text-[11px] text-muted-foreground">
            <span className={selectedBook ? "font-medium text-foreground" : ""}>
              {selectedBook || "Book"}
            </span>
            <ChevronRight className="h-3 w-3" />
            <span className={chapter ? "font-medium text-foreground" : ""}>
              {chapter || "Chapter"}
            </span>
            <ChevronRight className="h-3 w-3" />
            <span className={verseStart ? "font-medium text-foreground" : ""}>
              {verseStart ? (verseEnd ? `${verseStart}-${verseEnd}` : verseStart) : "Verse"}
            </span>
          </div>

          {/* Stepped Picker */}
          <div className="mb-3 flex gap-2">
            {/* Book input */}
            <div ref={bookWrapperRef} className="relative flex-1">
              <input
                ref={bookInputRef}
                data-search-book
                type="text"
                value={selectedBook ?? bookQuery}
                onChange={(e) => {
                  setSelectedBook(null);
                  setBookQuery(e.target.value);
                  setShowBookDropdown(true);
                  setHighlightedBookIndex(0);
                }}
                onFocus={() => setShowBookDropdown(true)}
                onKeyDown={handleBookKeyDown}
                placeholder="Book"
                className="w-full rounded-xl border border-input bg-card px-3 py-2 text-xs text-foreground outline-none focus:border-primary"
              />
              {showBookDropdown && filteredBooks.length > 0 && !selectedBook && (
                <div className="absolute left-0 right-0 top-full z-20 mt-1 max-h-48 overflow-y-auto rounded-xl border border-border bg-card shadow-panel">
                  {filteredBooks.map((book, i) => (
                    <button
                      key={book}
                      onClick={() => handleSelectBook(book)}
                      className={`w-full px-3 py-2 text-left text-xs transition-colors ${
                        i === highlightedBookIndex
                          ? "bg-primary/10 text-primary"
                          : "text-foreground hover:bg-secondary"
                      }`}
                    >
                      {book}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Chapter input */}
            <div className="relative w-24">
              <input
                ref={chapterInputRef}
                type="text"
                inputMode="numeric"
                value={chapter}
                disabled={!selectedBook}
                onChange={(e) => setChapter(clampChapter(e.target.value))}
                onKeyDown={handleChapterKeyDown}
                placeholder={maxChapter ? `1–${maxChapter}` : "Ch"}
                className="w-full rounded-xl border border-input bg-card px-3 py-2 text-center text-xs text-foreground outline-none focus:border-primary disabled:opacity-40"
              />
            </div>

            {/* Verse start input */}
            <div className="relative w-20">
              <input
                ref={verseStartInputRef}
                type="text"
                inputMode="numeric"
                value={verseStart}
                disabled={!chapterNum}
                onChange={(e) => setVerseStart(clampVerse(e.target.value))}
                onKeyDown={handleVerseStartKeyDown}
                placeholder={maxVerse ? `1–${maxVerse}` : "Vs"}
                className="w-full rounded-xl border border-input bg-card px-3 py-2 text-center text-xs text-foreground outline-none focus:border-primary disabled:opacity-40"
              />
            </div>

            {/* Verse end input */}
            <div className="relative w-20">
              <input
                ref={verseEndInputRef}
                type="text"
                inputMode="numeric"
                value={verseEnd}
                disabled={!verseStart}
                onChange={(e) => setVerseEnd(clampVerse(e.target.value))}
                onKeyDown={handleVerseEndKeyDown}
                placeholder="End"
                className="w-full rounded-xl border border-input bg-card px-3 py-2 text-center text-xs text-foreground outline-none focus:border-primary disabled:opacity-40"
              />
            </div>

            <button
              onClick={resetAll}
              className="rounded-full p-2 text-muted-foreground transition-colors hover:bg-secondary"
              title="Reset"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>

          {/* Results */}
          <div className="flex-1 space-y-1.5 overflow-y-auto pr-1">
            {results.map((verse) => {
              const isSelected = selectedVerses.some(
                (v) =>
                  v.verse_number === verse.verse_number &&
                  v.chapter_number === verse.chapter_number,
              );
              return (
                <div
                  key={`${verse.chapter_number}-${verse.verse_number}`}
                  onClick={() => toggleVerse(verse)}
                  className={`cursor-pointer rounded-xl border px-3 py-2.5 transition-colors ${
                    isSelected
                      ? "border-primary bg-primary/10"
                      : "border-border bg-card hover:border-primary/30"
                  }`}
                >
                  <div className="flex items-baseline gap-2">
                    <span className="min-w-[24px] text-[10px] font-bold text-primary">
                      {verse.verse_number}
                    </span>
                    <p className="text-xs text-foreground line-clamp-2">{verse.verse_text}</p>
                  </div>
                </div>
              );
            })}
            {results.length === 0 && !loading && (
              <div className="flex h-full items-center justify-center text-center">
                <p className="text-xs text-muted-foreground/60">
                  Select a book, chapter, and verse to preview results.
                </p>
              </div>
            )}
          </div>
        </>
      )}

      {/* Actions */}
      {selectedVerses.length > 0 && (
        <div className="mt-3 flex items-center gap-1.5 border-t border-border pt-3">
          <button
            onClick={handleStage}
            className="flex items-center gap-1 rounded-full border border-border px-3 py-1.5 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-secondary"
          >
            <Send className="h-3 w-3" />
            Stage
          </button>
          <button
            onClick={handleGoLive}
            className="flex items-center gap-1 rounded-full bg-primary px-3 py-1.5 text-[11px] font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            <Send className="h-3 w-3" />
            Go Live
          </button>
          <button
            onClick={handleAddToPlaylist}
            className="flex items-center gap-1 rounded-full border border-border px-3 py-1.5 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-secondary"
          >
            <Plus className="h-3 w-3" />
            Playlist
          </button>
        </div>
      )}
    </div>
  );
}
