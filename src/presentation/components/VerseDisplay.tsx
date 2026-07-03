import { motion, AnimatePresence } from "framer-motion";
import { useEffect } from "react";
import { usePresentationStore } from "../store";

export function VerseDisplay() {
  const { currentVerse, currentPage, canvasState, theme, frozenVerse } = usePresentationStore();

  const verse = canvasState === "freeze" ? frozenVerse : currentVerse;
  const isVisible = canvasState === "normal" && verse !== null;

  // Determine if we have multiple verses for pagination
  const verses = verse?.verses ?? [];
  const hasMultipleVerses = verses.length > 1;
  const activeVerse = hasMultipleVerses ? verses[Math.min(currentPage, verses.length - 1)] : null;

  // Apply transparent body background when alpha mode is on (for OBS/vMix key-fill)
  useEffect(() => {
    if (theme.alphaBackground) {
      document.body.style.background = "transparent";
    } else {
      document.body.style.background = "";
    }
  }, [theme.alphaBackground]);

  const formatRef = () => {
    if (!verse) return "";
    const { book_name, chapter, verse_start, verse_end } = verse.scripture;
    if (hasMultipleVerses && activeVerse) {
      return `${book_name} ${chapter}:${activeVerse.verse_number}`;
    }
    return verse_start === verse_end
      ? `${book_name} ${chapter}:${verse_start}`
      : `${book_name} ${chapter}:${verse_start}-${verse_end}`;
  };

  const containerClass =
    theme.layoutMode === "lower-thirds"
      ? "absolute bottom-8 left-8 right-8 p-8"
      : "absolute inset-0 flex flex-col items-center justify-center p-16";

  const containerStyle = theme.layoutMode === "lower-thirds"
    ? {
        background: theme.alphaBackground ? "transparent" : theme.backgroundColor,
        borderRadius: "1.5rem",
      }
    : {
        background: theme.alphaBackground ? "transparent" : theme.backgroundColor,
      };

  const animationVariants = {
    fade: {
      initial: { opacity: 0 },
      animate: { opacity: 1 },
      exit: { opacity: 0 },
    },
    slide: {
      initial: { opacity: 0, x: -50 },
      animate: { opacity: 1, x: 0 },
      exit: { opacity: 0, x: 50 },
    },
    "kinetic-slide": {
      initial: { opacity: 0 },
      animate: { opacity: 1, transition: { staggerChildren: 0.15 } },
      exit: { opacity: 0, x: 100, transition: { duration: 0.3 } },
    },
    none: {
      initial: { opacity: 1 },
      animate: { opacity: 1 },
      exit: { opacity: 1 },
    },
  };

  const isKinetic = theme.animation === "kinetic-slide";
  const variant = animationVariants[theme.animation];

  // Standby screen: shown when the canvas is live-capable but no verse is on screen.
  // Skipped in alpha mode (transparent = invisible to capture hardware).
  const showStandby = canvasState !== "blackout" && !isVisible && !theme.alphaBackground;

  return (
    <AnimatePresence mode="wait">
      {showStandby && (
        <motion.div
          key="standby"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.4 }}
          className="absolute inset-0 flex flex-col items-center justify-center text-center"
          style={{ background: theme.backgroundColor }}
        >
          <p
            className="text-5xl font-semibold tracking-tight"
            style={{ color: theme.textColor, fontFamily: theme.fontFamily }}
          >
            Pneuma
          </p>
          <p
            className="mt-3 text-lg uppercase tracking-[0.3em]"
            style={{ color: theme.accentColor }}
          >
            Standby
          </p>
        </motion.div>
      )}
      {isVisible && (
        <motion.div
          key={hasMultipleVerses ? `${verse?.id}-${currentPage}` : verse?.id ?? "empty"}
          initial={variant.initial}
          animate={variant.animate}
          exit={variant.exit}
          transition={{ duration: 0.4, ease: "easeOut" }}
          className={containerClass}
          style={containerStyle}
        >
          <div
            className="w-full"
            style={{ textAlign: theme.alignment }}
          >
            {/* Reference */}
            <motion.p
              className="mb-3 font-semibold tracking-wide"
              style={{
                color: theme.accentColor,
                fontSize: `${theme.fontSize * 0.5}px`,
                fontFamily: theme.fontFamily,
              }}
              variants={isKinetic ? {
                initial: { opacity: 0, x: -80 },
                animate: { opacity: 1, x: 0, transition: { duration: 0.4, ease: "easeOut" } },
              } : undefined}
            >
              {formatRef()}
            </motion.p>

            {/* Verse Text */}
            <motion.p
              style={{
                color: theme.textColor,
                fontSize: `${theme.fontSize}px`,
                fontFamily: theme.fontFamily,
                lineHeight: 1.4,
              }}
              variants={isKinetic ? {
                initial: { opacity: 0, x: -80 },
                animate: { opacity: 1, x: 0, transition: { duration: 0.4, ease: "easeOut", delay: 0.15 } },
              } : undefined}
            >
              {hasMultipleVerses && activeVerse
                ? activeVerse.text
                : verse?.verse_text || "Verse text will appear here when loaded from the database."}
            </motion.p>

            {/* Page indicator for multi-verse ranges */}
            {hasMultipleVerses && (
              <p
                className="mt-4 text-sm opacity-60"
                style={{
                  color: theme.textColor,
                  fontSize: `${theme.fontSize * 0.3}px`,
                  fontFamily: theme.fontFamily,
                }}
              >
                {currentPage + 1} / {verses.length}
              </p>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
