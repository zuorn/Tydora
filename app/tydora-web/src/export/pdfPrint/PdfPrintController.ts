import { convertFileSrc } from "@tauri-apps/api/core";
import { tempDir, join, dirname } from "@tauri-apps/api/path";
import { mkdir, remove, writeTextFile } from "@tauri-apps/plugin-fs";
import { useCallback, useEffect, useRef, useState } from "react";
import { openPdfPrintWindow, type PdfPrintWindowResult } from "./pdfPrintWindow";

let jobSequence = 0;

function generateJobId(): string {
  jobSequence += 1;
  return `${Date.now().toString(36)}-${jobSequence}`;
}

const TEMP_SUBDIR = "tydora-pdf-print";

async function getTempFilePath(jobId: string): Promise<string> {
  const tmp = await tempDir();
  return await join(tmp, TEMP_SUBDIR, `${jobId}.html`);
}

interface PdfPrintControllerOptions {
  html: string;
  fileName: string;
  themeName: string;
}

export interface PdfPrintControllerState {
  printing: boolean;
  error: string | null;
}

export function usePdfPrint() {
  const [state, setState] = useState<PdfPrintControllerState>({
    printing: false,
    error: null,
  });
  const abortRef = useRef<AbortController | null>(null);

  const requestPdfPrint = useCallback(
    async (opts: PdfPrintControllerOptions): Promise<PdfPrintWindowResult | null> => {
      if (state.printing) {
        console.warn("[usePdfPrint] Already printing, ignoring request");
        return null;
      }
      console.log("[usePdfPrint] Starting PDF print, fileName:", opts.fileName);
      setState({ printing: true, error: null });

      const abortController = new AbortController();
      abortRef.current = abortController;

      try {
        const jobId = generateJobId();
        console.log("[usePdfPrint] Generated jobId:", jobId);

        const tempPath = await getTempFilePath(jobId);
        const tempDirPath = await dirname(tempPath);
        console.log("[usePdfPrint] Temp path:", tempPath);

        // Ensure temp directory exists
        try {
          await mkdir(tempDirPath, { recursive: true });
          console.log("[usePdfPrint] Temp dir ensured");
        } catch {
          // Directory may already exist
        }

        // Write the self-contained HTML to a temp file (absolute path)
        console.log("[usePdfPrint] Writing HTML to temp file, length:", opts.html.length);
        await writeTextFile(tempPath, opts.html);
        console.log("[usePdfPrint] HTML written");

        // Convert to asset:// URL for cross-window loading
        const assetUrl = convertFileSrc(tempPath);
        console.log("[usePdfPrint] Asset URL:", assetUrl);

        console.log("[usePdfPrint] Opening print window...");
        const result = await openPdfPrintWindow(
          {
            assetUrl,
            filePath: tempPath,
            fileName: opts.fileName,
            jobId,
            themeName: opts.themeName,
            sourceLabel: "main",
          },
          abortController.signal,
        );
        console.log("[usePdfPrint] Print window result:", result?.status, result?.error);

        // Clean up temp file regardless of outcome
        try {
          await remove(tempPath);
          console.log("[usePdfPrint] Temp file cleaned up");
        } catch {
          // Ignore cleanup errors
        }

        setState({ printing: false, error: null });
        return result;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error("[usePdfPrint] Error:", message);
        setState({ printing: false, error: message });
        return null;
      }
    },
    [state.printing],
  );

  const cancelPdfPrint = useCallback(() => {
    console.log("[usePdfPrint] Cancelling print");
    abortRef.current?.abort();
    abortRef.current = null;
  }, []);

  // Clean up on unmount
  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  return { requestPdfPrint, cancelPdfPrint, state };
}
