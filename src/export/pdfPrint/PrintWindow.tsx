import { emitTo } from "@tauri-apps/api/event";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import { readTextFile } from "@tauri-apps/plugin-fs";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  createPrintDialogCompletionObserver,
  type PrintDialogCompletionObserver,
} from "./printDialogCompletion";
import {
  PDF_PRINT_WINDOW_DATA_EVENT,
  PDF_PRINT_WINDOW_READY_EVENT,
  PDF_PRINT_WINDOW_RESULT_EVENT,
  type PdfPrintWindowPayload,
  type PdfPrintWindowRequest,
  type PdfPrintWindowResult,
} from "./pdfPrintWindow";
import { invokeSystemPrint, preparePrintDocument } from "./printDocument";
import "./pdf-print.css";

interface PdfPrintWindowProps {
  request: PdfPrintWindowRequest;
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function injectPrintStyles(doc: Document): void {
  const existing = doc.querySelectorAll('style[data-tydora-print="true"]');
  existing.forEach((el) => el.remove());

  const printStyles = doc.createElement("style");
  printStyles.setAttribute("data-tydora-print", "true");
  printStyles.textContent = `
    @media print {
      @page { margin: 16mm; }
      html, body, body > #root { height: auto !important; min-height: 0 !important; overflow: visible !important; background: #fff !important; color: #000 !important; }
      body { margin: 0 !important; }
    }
  `;
  doc.head.appendChild(printStyles);
}

export function PdfPrintWindow({ request }: PdfPrintWindowProps) {
  const [payload, setPayload] = useState<PdfPrintWindowPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const startedRef = useRef(false);
  const currentWindow = useMemo(() => {
    try {
      return getCurrentWebviewWindow();
    } catch (e) {
      console.error("[PdfPrintWindow] getCurrentWebviewWindow failed:", e);
      return null;
    }
  }, []);

  // Phase 1: listen for DATA event, emit READY
  useEffect(() => {
    if (!currentWindow) {
      setError("Failed to get current webview window");
      return;
    }

    console.log("[PdfPrintWindow] Phase 1 started, jobId:", request.jobId, "windowLabel:", currentWindow.label);

    let active = true;
    let unlisten: (() => void) | undefined;

    void currentWindow
      .listen<PdfPrintWindowPayload>(PDF_PRINT_WINDOW_DATA_EVENT, ({ payload: nextPayload }) => {
        console.log("[PdfPrintWindow] Received DATA event, jobId:", nextPayload.jobId);
        if (
          !active ||
          nextPayload.jobId !== request.jobId ||
          nextPayload.sourceLabel !== request.sourceLabel
        ) {
          console.log("[PdfPrintWindow] DATA event ignored (mismatch)");
          return;
        }
        setPayload(nextPayload);
      })
      .then((nextUnlisten) => {
        if (!active) {
          nextUnlisten();
          return;
        }
        unlisten = nextUnlisten;
        console.log("[PdfPrintWindow] Emitting READY to source:", request.sourceLabel);
        return emitTo(request.sourceLabel, PDF_PRINT_WINDOW_READY_EVENT, {
          jobId: request.jobId,
          sourceLabel: request.sourceLabel,
          windowLabel: currentWindow.label,
        });
      })
      .then(() => {
        console.log("[PdfPrintWindow] READY emitted successfully");
      })
      .catch((e) => {
        console.error("[PdfPrintWindow] Phase 1 error:", e);
        setError(getErrorMessage(e));
        // Do NOT destroy window here — let error be visible
      });

    return () => {
      console.log("[PdfPrintWindow] Phase 1 cleanup");
      active = false;
      unlisten?.();
    };
  }, [currentWindow, request]);

  // Phase 2: read HTML, inject, print
  useEffect(() => {
    if (!payload || startedRef.current || !currentWindow) return;
    startedRef.current = true;

    console.log("[PdfPrintWindow] Phase 2 started, filePath:", payload.filePath);

    const abortController = new AbortController();
    let printDialogObserver: PrintDialogCompletionObserver | undefined;

    void (async () => {
      let result: PdfPrintWindowResult;
      const root = rootRef.current;
      if (!root) {
        result = {
          error: "Print root element not found",
          failedImageCount: 0,
          jobId: payload.jobId,
          status: "error",
        };
        await emitTo(payload.sourceLabel, PDF_PRINT_WINDOW_RESULT_EVENT, result);
        await currentWindow.destroy();
        return;
      }

      try {
        // Read the self-contained HTML via Tauri FS API (avoids fetch/CORS issues)
        console.log("[PdfPrintWindow] Reading HTML from file...");
        const htmlText = await readTextFile(payload.filePath);
        console.log("[PdfPrintWindow] Read HTML, length:", htmlText.length);

        // Parse the HTML to extract body content and styles
        const parser = new DOMParser();
        const parsedDoc = parser.parseFromString(htmlText, "text/html");

        // Extract and inject styles from the parsed document
        const styles = Array.from(parsedDoc.querySelectorAll("style"))
          .map((style) => style.textContent || "")
          .join("\n");
        if (styles) {
          const styleEl = document.createElement("style");
          styleEl.setAttribute("data-tydora-print-inline", "true");
          styleEl.textContent = styles;
          document.head.appendChild(styleEl);
        }

        // Set theme
        if (payload.themeName) {
          document.documentElement.setAttribute("data-theme", payload.themeName);
        }

        // Extract body content
        const bodyContent = parsedDoc.body.innerHTML;
        if (!bodyContent.trim()) {
          throw new Error("Print content is empty");
        }

        // Inject content into the root
        root.innerHTML = bodyContent;

        // Force white background for printing (override dark themes)
        document.documentElement.style.backgroundColor = "#fff";
        document.body.style.backgroundColor = "#fff";
        document.body.style.color = "#000";

        injectPrintStyles(document);

        document.title = payload.fileName;
        await currentWindow.show();
        await currentWindow.setFocus();
        console.log("[PdfPrintWindow] Window shown, preparing document...");

        const preparation = await preparePrintDocument({
          root,
          hydration: { settled: Promise.resolve() },
          interactiveMediaLabel: "Interactive content (not printed)",
          signal: abortController.signal,
        });
        console.log("[PdfPrintWindow] Document prepared, failedImages:", preparation.failedImageCount);

        printDialogObserver = await createPrintDialogCompletionObserver(abortController.signal);

        // Try Tauri native print first, fallback to window.print()
        console.log("[PdfPrintWindow] Calling print...");
        const tauriPrint = (currentWindow as any).print;
        if (typeof tauriPrint === "function") {
          try {
            await tauriPrint.call(currentWindow);
            console.log("[PdfPrintWindow] Tauri print completed");
          } catch (printErr) {
            console.warn("[PdfPrintWindow] Tauri print failed, falling back to window.print():", printErr);
            await invokeSystemPrint(window, {
              nativeCompletion: printDialogObserver.settled,
            });
          }
        } else {
          await invokeSystemPrint(window, {
            nativeCompletion: printDialogObserver.settled,
          });
        }
        console.log("[PdfPrintWindow] Print dialog closed");

        result = {
          failedImageCount: preparation.failedImageCount,
          jobId: payload.jobId,
          status: "complete",
        };
      } catch (err) {
        if (abortController.signal.aborted) {
          console.log("[PdfPrintWindow] Aborted");
          return;
        }
        console.error("[PdfPrintWindow] Phase 2 error:", err);
        result = {
          error: getErrorMessage(err),
          failedImageCount: 0,
          jobId: payload.jobId,
          status: "error",
        };
      }

      try {
        console.log("[PdfPrintWindow] Emitting RESULT:", result.status);
        await emitTo(payload.sourceLabel, PDF_PRINT_WINDOW_RESULT_EVENT, result);
      } finally {
        console.log("[PdfPrintWindow] Destroying window");
        await currentWindow.destroy();
      }
    })().catch((e) => {
      console.error("[PdfPrintWindow] Unhandled Phase 2 error:", e);
    });

    return () => {
      console.log("[PdfPrintWindow] Phase 2 cleanup");
      abortController.abort();
      printDialogObserver?.dispose();
    };
  }, [currentWindow, payload]);

  if (error) {
    return (
      <div style={{ padding: 40, color: "#e24b4a", fontFamily: "sans-serif" }}>
        <strong>Print failed:</strong> {error}
      </div>
    );
  }

  return (
    <div
      ref={rootRef}
      className="tydora-pdf-print-root tydora-pdf-window-root"
      aria-hidden="true"
    />
  );
}
