import { useEffect, useRef } from "react";
import { useOperatorStore } from "../store";
import { ScrollText } from "lucide-react";
import type { DetectedScripture } from "@/shared/types";

const NUMBER_WORDS = new Set([
  "one",
  "two",
  "three",
  "four",
  "five",
  "six",
  "seven",
  "eight",
  "nine",
  "ten",
  "eleven",
  "twelve",
  "thirteen",
  "fourteen",
  "fifteen",
  "sixteen",
  "seventeen",
  "eighteen",
  "nineteen",
  "twenty",
  "thirty",
  "forty",
  "fifty",
  "sixty",
  "seventy",
  "eighty",
  "ninety",
  "hundred",
  "thousand",
  "first",
  "second",
  "third",
  "fourth",
  "fifth",
  "sixth",
  "seventh",
  "eighth",
  "ninth",
  "tenth",
  "chapter",
  "verse",
  "verses",
  "through",
  "and",
  "to",
  "till",
  "until",
]);

function buildHighlightTokens(scriptures: DetectedScripture[]): Set<string> {
  const tokens = new Set<string>();
  for (const s of scriptures) {
    const name = s.book_name.toLowerCase();
    for (const part of name.split(/\s+/)) {
      if (part) tokens.add(part);
    }
    tokens.add(String(s.chapter));
    tokens.add(String(s.verse_start));
    if (s.verse_end !== s.verse_start) tokens.add(String(s.verse_end));
  }
  return tokens;
}

export function TranscriptConsole() {
  const { transcriptChunks, engineStatus } = useOperatorStore();
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [transcriptChunks]);

  const renderHighlightedText = (text: string, scriptures: DetectedScripture[]) => {
    if (scriptures.length === 0) return text;
    const highlightTokens = buildHighlightTokens(scriptures);
    const words = text.split(/(\s+)/);
    return (
      <span>
        {words.map((word, i) => {
          const clean = word.toLowerCase().replace(/[^a-z0-9]/g, "");
          const isHighlight = highlightTokens.has(clean) || NUMBER_WORDS.has(clean);
          return (
            <span
              key={i}
              className={isHighlight ? "rounded bg-primary/20 px-0.5 text-primary font-medium" : ""}
            >
              {word}
            </span>
          );
        })}
      </span>
    );
  };

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <div className="flex items-center gap-2 border-b border-border px-4 py-3">
        <div className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/10">
          <ScrollText className="h-3.5 w-3.5 text-primary" />
        </div>
        <h2 className="text-sm font-semibold text-foreground">Live Transcript</h2>
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 text-sm leading-relaxed">
        {transcriptChunks.length === 0 ? (
          <div className="flex h-full items-center justify-center text-center">
            <p className="text-sm text-muted-foreground">
              {engineStatus === "running"
                ? "Listening... Speak into the microphone."
                : "Start the AI engine to begin transcription."}
            </p>
          </div>
        ) : (
          <div className="space-y-1">
            {transcriptChunks.map((chunk, i) => (
              <span
                key={i}
                className={chunk.is_final ? "text-foreground" : "text-muted-foreground/70"}
              >
                {renderHighlightedText(chunk.raw_text, chunk.detected_scriptures)}{" "}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
