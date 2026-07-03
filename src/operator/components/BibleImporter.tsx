import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { BookOpen, Upload, CheckCircle, AlertCircle } from "lucide-react";

interface ImportResult {
  verses_imported: number;
  books_found: number;
  translation_code: string;
}

export function BibleImporter() {
  const [translationCode, setTranslationCode] = useState("");
  const [status, setStatus] = useState<"idle" | "importing" | "success" | "error">("idle");
  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState("");

  const handleImport = async () => {
    if (!translationCode.trim()) {
      setError("Enter a translation code (e.g., ESV_USER_IMPORT)");
      setStatus("error");
      return;
    }

    try {
      const selected = await open({
        multiple: false,
        filters: [
          { name: "Bible Files", extensions: ["xml", "db", "sqlite"] },
        ],
      });

      if (!selected) return;
      const filePath = selected;

      setStatus("importing");
      setError("");

      const lower = filePath.toLowerCase();
      let cmd: string;
      if (lower.endsWith(".db") || lower.endsWith(".sqlite")) {
        cmd = "import_bible_sqlite";
      } else {
        try {
          const res = await invoke<ImportResult>("import_bible_opensong", {
            path: filePath,
            translationCode: translationCode.trim(),
          });
          setResult(res);
          setStatus("success");
          return;
        } catch {
          // Fall through to Zefania
        }
        cmd = "import_bible_zefania";
      }

      const res = await invoke<ImportResult>(cmd, {
        path: filePath,
        translationCode: translationCode.trim(),
      });
      setResult(res);
      setStatus("success");
    } catch (e) {
      setError(String(e));
      setStatus("error");
    }
  };

  return (
    <div className="flex h-full flex-col overflow-hidden p-4">
      <div className="mb-4 flex items-center gap-2">
        <div className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/10">
          <BookOpen className="h-3.5 w-3.5 text-primary" />
        </div>
        <h2 className="text-sm font-semibold text-foreground">Bible Importer</h2>
      </div>

      <div className="mb-4 flex-1 space-y-4 overflow-y-auto pr-1">
        <div>
          <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
            Translation Code
          </label>
          <input
            type="text"
            value={translationCode}
            onChange={(e) => setTranslationCode(e.target.value)}
            placeholder="e.g., ESV_USER_IMPORT"
            className="w-full rounded-xl border border-input bg-card px-3 py-2 text-xs text-foreground outline-none focus:border-primary"
          />
          <p className="mt-1.5 text-xs text-muted-foreground">
            Used to identify this translation in the app
          </p>
        </div>

        <button
          onClick={handleImport}
          disabled={status === "importing"}
          className="flex w-full items-center justify-center gap-1.5 rounded-full bg-primary px-3 py-2.5 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
        >
          <Upload className="h-3.5 w-3.5" />
          {status === "importing" ? "Importing..." : "Select & Import File"}
        </button>

        <p className="text-xs text-muted-foreground">
          Supports OpenSong XML, Zefania XML, and SQLite formats
        </p>

        {status === "success" && result && (
          <div className="rounded-xl border border-primary/30 bg-primary/10 p-3">
            <div className="flex items-center gap-1.5">
              <CheckCircle className="h-3.5 w-3.5 text-primary" />
              <span className="text-xs font-medium text-primary">Import Successful</span>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              {result.verses_imported.toLocaleString()} verses imported across {result.books_found} books
              ({result.translation_code})
            </p>
          </div>
        )}

        {status === "error" && (
          <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-3">
            <div className="flex items-center gap-1.5">
              <AlertCircle className="h-3.5 w-3.5 text-destructive" />
              <span className="text-xs font-medium text-destructive">Import Failed</span>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">{error}</p>
          </div>
        )}
      </div>
    </div>
  );
}
