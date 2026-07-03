import { useState, useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { Search, Download, Check, Loader2, BookOpen, Globe, Trash2 } from "lucide-react";
import { useOperatorStore } from "../store";

interface BibleSummary {
  id: string;
  name: string;
  name_local: string | null;
  abbreviation: string;
  abbreviation_local: string | null;
  description: string | null;
  description_local: string | null;
  language: { id: string; name: string; name_local: string | null };
}

interface InstalledTranslation {
  translation_code: string;
  verse_count: number;
  name: string;
}

interface DownloadProgress {
  phase: string;
  current: number;
  total: number;
  message: string;
}

export function TranslationMarketplace() {
  const [bibles, setBibles] = useState<BibleSummary[]>([]);
  const [installed, setInstalled] = useState<InstalledTranslation[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [progress, setProgress] = useState<DownloadProgress | null>(null);
  const [languageFilter, setLanguageFilter] = useState<string>("");
  const [deletingCode, setDeletingCode] = useState<string | null>(null);
  const activeTranslation = useOperatorStore((s) => s.appSettings.active_translation);
  const updateSettings = useOperatorStore((s) => s.updateSettings);
  const saveSettings = useOperatorStore((s) => s.saveSettings);

  const fetchInstalled = useCallback(async () => {
    try {
      const result = await invoke<InstalledTranslation[]>("get_installed_translations");
      setInstalled(result);
    } catch (err) {
      console.error("Failed to fetch installed translations:", err);
    }
  }, []);

  const fetchBibles = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await invoke<BibleSummary[]>("list_available_bibles");
      setBibles(result);
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchInstalled();
    fetchBibles();
  }, [fetchInstalled, fetchBibles]);

  useEffect(() => {
    const unlisten = listen<DownloadProgress>("bible:download-progress", (event) => {
      setProgress(event.payload);
      if (event.payload.phase === "done") {
        setDownloadingId(null);
        fetchInstalled();
        setTimeout(() => setProgress(null), 3000);
      }
    });
    return () => {
      unlisten.then((fn) => fn());
    };
  }, [fetchInstalled]);

  const handleDownload = async (bible: BibleSummary) => {
    setDownloadingId(bible.id);
    setProgress({ phase: "starting", current: 0, total: 0, message: "Starting download..." });
    try {
      await invoke("download_bible", {
        bibleId: bible.id,
        translationCode: bible.abbreviation_local || bible.abbreviation,
        bibleName: bible.name_local || bible.name,
      });
      // Refresh installed list immediately after successful download
      await fetchInstalled();
      setDownloadingId(null);
    } catch (err) {
      setError(String(err));
      setDownloadingId(null);
      setProgress(null);
    }
  };

  const isInstalled = (abbr: string) =>
    installed.some((t) => t.translation_code === abbr);

  // Build unique language list from fetched bibles
  const languages = Array.from(
    new Map(bibles.map((b) => [b.language.id, b.language.name_local || b.language.name])).values()
  ).sort();

  const filtered = bibles.filter((b) => {
    const q = search.toLowerCase();
    const matchesSearch =
      b.name.toLowerCase().includes(q) ||
      b.abbreviation.toLowerCase().includes(q) ||
      b.language.name.toLowerCase().includes(q);
    const matchesLang = !languageFilter ||
      (b.language.name_local || b.language.name) === languageFilter;
    return matchesSearch && matchesLang;
  });

  return (
    <div className="flex h-full flex-col gap-3 p-4">
      <div className="flex items-center gap-2">
        <Globe className="h-4 w-4 text-primary" />
        <h2 className="text-sm font-semibold text-foreground">Translation Marketplace</h2>
      </div>

      {/* Search + Language filter + Refresh */}
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search translations..."
            className="w-full rounded-lg border border-border bg-input pl-8 pr-3 py-1.5 text-xs text-foreground outline-none focus:ring-1 focus:ring-primary"
          />
        </div>
        {languages.length > 0 && (
          <select
            value={languageFilter}
            onChange={(e) => setLanguageFilter(e.target.value)}
            className="rounded-lg border border-border bg-input px-2 py-1.5 text-[11px] text-foreground outline-none focus:ring-1 focus:ring-primary"
          >
            <option value="">All languages</option>
            {languages.map((lang) => (
              <option key={lang} value={lang}>{lang}</option>
            ))}
          </select>
        )}
        <button
          onClick={fetchBibles}
          disabled={loading}
          className="flex items-center gap-1 rounded-lg border border-border px-2.5 py-1.5 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-secondary disabled:opacity-40"
        >
          {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <BookOpen className="h-3.5 w-3.5" />}
          Refresh
        </button>
      </div>

      {error && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-[11px] text-destructive">
          {error}
        </div>
      )}

      {/* Installed translations */}
      {installed.length > 0 && (
        <div className="space-y-1">
          <h3 className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Installed
          </h3>

          {/* Active translation selector */}
          <div className="rounded-lg border border-primary/30 bg-primary/5 px-3 py-2">
            <label className="text-[10px] font-medium text-muted-foreground">
              Active Translation
            </label>
            <select
              value={activeTranslation}
              onChange={(e) => {
                updateSettings({ active_translation: e.target.value });
                saveSettings();
              }}
              className="mt-1 w-full rounded-md border border-border bg-input px-2 py-1.5 text-xs text-foreground outline-none focus:ring-1 focus:ring-primary"
            >
              {installed.map((t) => (
                <option key={t.translation_code} value={t.translation_code}>
                  {t.translation_code} ({t.verse_count.toLocaleString()} verses)
                </option>
              ))}
            </select>
          </div>

          {installed.map((t) => (
            <div
              key={t.translation_code}
              className="flex items-center justify-between rounded-lg border border-border bg-card px-3 py-2"
            >
              <div className="flex min-w-0 items-center gap-2">
                <Check className="h-3.5 w-3.5 shrink-0 text-green-500" />
                <div className="min-w-0">
                  <span className="text-xs font-medium text-foreground">{t.name}</span>
                  <span className="ml-1.5 rounded bg-secondary px-1 py-0.5 text-[9px] font-medium text-muted-foreground">
                    {t.translation_code}
                  </span>
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <span className="text-[10px] text-muted-foreground">
                  {t.verse_count.toLocaleString()} verses
                </span>
                {t.translation_code !== activeTranslation && (
                  <button
                    onClick={async () => {
                      setDeletingCode(t.translation_code);
                      try {
                        await invoke("delete_translation", { translationCode: t.translation_code });
                        await fetchInstalled();
                      } catch (err) {
                        setError(String(err));
                      } finally {
                        setDeletingCode(null);
                      }
                    }}
                    disabled={deletingCode === t.translation_code}
                    className="rounded p-1 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive disabled:opacity-40"
                    title="Delete translation"
                  >
                    {deletingCode === t.translation_code ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Trash2 className="h-3.5 w-3.5" />
                    )}
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Download progress */}
      {progress && (
        <div className="rounded-lg border border-primary/30 bg-primary/5 px-3 py-2">
          <div className="flex items-center gap-2">
            <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
            <span className="text-[11px] text-foreground">{progress.message}</span>
          </div>
          {progress.total > 0 && (
            <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-secondary">
              <div
                className="h-full rounded-full bg-primary transition-all"
                style={{ width: `${(progress.current / progress.total) * 100}%` }}
              />
            </div>
          )}
        </div>
      )}

      {/* Available bibles list */}
      {filtered.length > 0 && (
        <div className="flex-1 space-y-1 overflow-y-auto">
          <h3 className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Available ({filtered.length})
          </h3>
          {filtered.map((bible) => {
            const installedFlag = isInstalled(bible.abbreviation_local || bible.abbreviation);
            const isDownloading = downloadingId === bible.id;
            return (
              <div
                key={bible.id}
                className="flex items-center justify-between rounded-lg border border-border bg-card px-3 py-2"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-medium text-foreground truncate">
                      {bible.name_local || bible.name}
                    </span>
                    <span className="rounded bg-secondary px-1.5 py-0.5 text-[9px] font-medium text-muted-foreground">
                      {bible.abbreviation_local || bible.abbreviation}
                    </span>
                  </div>
                  <span className="text-[10px] text-muted-foreground">
                    {bible.language.name_local || bible.language.name}
                  </span>
                </div>
                {installedFlag ? (
                  <Check className="h-4 w-4 text-green-500" />
                ) : (
                  <button
                    onClick={() => handleDownload(bible)}
                    disabled={isDownloading}
                    className="flex items-center gap-1 rounded-lg bg-primary px-2 py-1 text-[10px] font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-40"
                  >
                    {isDownloading ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <Download className="h-3 w-3" />
                    )}
                    Download
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}

      {!loading && bibles.length === 0 && !error && (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 text-center">
          <BookOpen className="h-8 w-8 text-muted-foreground/50" />
          <p className="text-xs text-muted-foreground">
            Loading available translations from API.Bible...
          </p>
        </div>
      )}
    </div>
  );
}
