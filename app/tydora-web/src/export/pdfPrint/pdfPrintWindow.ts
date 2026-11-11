import { emitTo } from "@tauri-apps/api/event";
import { getCurrentWebviewWindow, WebviewWindow } from "@tauri-apps/api/webviewWindow";

export const PDF_PRINT_WINDOW_DATA_EVENT = "tydora-pdf-print-window-data";
export const PDF_PRINT_WINDOW_READY_EVENT = "tydora-pdf-print-window-ready";
export const PDF_PRINT_WINDOW_RESULT_EVENT = "tydora-pdf-print-window-result";

const PDF_PRINT_JOB_PARAM = "tydora-pdf-print-job";
const PDF_PRINT_SOURCE_PARAM = "tydora-pdf-print-source";
const PRINT_WINDOW_READY_TIMEOUT_MS = 15_000;

export interface PdfPrintWindowPayload {
  assetUrl: string;
  filePath: string;
  fileName: string;
  jobId: string;
  themeName: string;
  sourceLabel: string;
}

export interface PdfPrintWindowRequest {
  jobId: string;
  sourceLabel: string;
}

interface PdfPrintWindowReadyMessage extends PdfPrintWindowRequest {
  windowLabel: string;
}

export interface PdfPrintWindowResult {
  error?: string;
  failedImageCount: number;
  jobId: string;
  status: "complete" | "error";
}

function createAbortError(): DOMException {
  return new DOMException("Print task was cancelled", "AbortError");
}

export function getPdfPrintWindowRequest(
  search: string = window.location.search,
): PdfPrintWindowRequest | null {
  const params = new URLSearchParams(search);
  const jobId = params.get(PDF_PRINT_JOB_PARAM);
  const sourceLabel = params.get(PDF_PRINT_SOURCE_PARAM);
  return jobId && sourceLabel ? { jobId, sourceLabel } : null;
}

function createPdfPrintWindowUrl(request: PdfPrintWindowRequest): string {
  const params = new URLSearchParams({
    window: "pdf-print",
    [PDF_PRINT_JOB_PARAM]: request.jobId,
    [PDF_PRINT_SOURCE_PARAM]: request.sourceLabel,
  });
  return `index.html?${params.toString()}`;
}

function getPrintWindowLabel(sourceLabel: string, jobId: string): string {
  const safeSourceLabel = sourceLabel.replace(/[^a-zA-Z0-9-/:_]/g, "-");
  const safeJobId = jobId.replace(/[^a-zA-Z0-9-/:_]/g, "-");
  return `tydora-pdf-print-${safeSourceLabel}-${safeJobId}`;
}

export async function openPdfPrintWindow(
  payload: PdfPrintWindowPayload,
  signal: AbortSignal,
  readyTimeoutMs = PRINT_WINDOW_READY_TIMEOUT_MS,
): Promise<PdfPrintWindowResult | null> {
  if (signal.aborted) throw createAbortError();

  const sourceWindow = getCurrentWebviewWindow();
  const windowLabel = getPrintWindowLabel(sourceWindow.label, payload.jobId);
  console.log("[openPdfPrintWindow] sourceLabel:", sourceWindow.label, "windowLabel:", windowLabel);

  let printWindow: WebviewWindow | undefined;
  let readyTimeout: number | undefined;
  let unlistenReady: (() => void) | undefined;
  let unlistenResult: (() => void) | undefined;
  let settled = false;

  return new Promise<PdfPrintWindowResult | null>((resolve, reject) => {
    const cleanup = () => {
      if (readyTimeout !== undefined) window.clearTimeout(readyTimeout);
      readyTimeout = undefined;
      signal.removeEventListener("abort", handleAbort);
      unlistenReady?.();
      unlistenResult?.();
      unlistenReady = undefined;
      unlistenResult = undefined;
    };
    const settle = (
      result: PdfPrintWindowResult | null,
      error?: unknown,
      destroyWindow = false,
    ) => {
      if (settled) return;
      settled = true;
      cleanup();
      if (destroyWindow) void printWindow?.destroy().catch(() => undefined);
      if (error) reject(error);
      else resolve(result);
    };
    const fail = (error: unknown) => {
      console.error("[openPdfPrintWindow] fail:", error);
      settle(null, error instanceof Error ? error : new Error(String(error)), true);
    };
    const handleAbort = () => settle(null, createAbortError(), true);

    signal.addEventListener("abort", handleAbort, { once: true });

    void (async () => {
      console.log("[openPdfPrintWindow] Setting up listeners...");
      unlistenReady = await sourceWindow.listen<PdfPrintWindowReadyMessage>(
        PDF_PRINT_WINDOW_READY_EVENT,
        ({ payload: ready }) => {
          console.log("[openPdfPrintWindow] Received READY from window:", ready.windowLabel);
          if (
            ready.jobId !== payload.jobId ||
            ready.sourceLabel !== sourceWindow.label ||
            ready.windowLabel !== windowLabel
          ) {
            console.log("[openPdfPrintWindow] READY mismatch, ignoring");
            return;
          }

          if (readyTimeout !== undefined) window.clearTimeout(readyTimeout);
          readyTimeout = undefined;
          console.log("[openPdfPrintWindow] Sending DATA to:", windowLabel);
          void emitTo(windowLabel, PDF_PRINT_WINDOW_DATA_EVENT, payload).catch(fail);
        },
      );
      if (settled) {
        unlistenReady();
        return;
      }

      unlistenResult = await sourceWindow.listen<PdfPrintWindowResult>(
        PDF_PRINT_WINDOW_RESULT_EVENT,
        ({ payload: result }) => {
          console.log("[openPdfPrintWindow] Received RESULT:", result.status, "jobId:", result.jobId);
          if (result.jobId !== payload.jobId) return;
          if (result.status === "error") {
            fail(new Error(result.error || "PDF print window failed"));
          } else {
            settle(result);
          }
        },
      );
      if (settled) {
        unlistenResult();
        return;
      }

      const url = createPdfPrintWindowUrl({
        jobId: payload.jobId,
        sourceLabel: sourceWindow.label,
      });
      console.log("[openPdfPrintWindow] Creating WebviewWindow, url:", url);

      printWindow = new WebviewWindow(windowLabel, {
        center: true,
        decorations: true,
        dragDropEnabled: false,
        focus: false,
        height: 900,
        minHeight: 500,
        minWidth: 600,
        resizable: true,
        skipTaskbar: true,
        title: payload.fileName,
        url,
        visible: false,
        width: 900,
      });
      void printWindow.once("tauri://error", ({ payload: error }) => {
        console.error("[openPdfPrintWindow] tauri://error:", error);
        fail(error);
      });
      void printWindow.once("tauri://destroyed", () => {
        console.log("[openPdfPrintWindow] tauri://destroyed");
        settle(null);
      });
      readyTimeout = window.setTimeout(
        () => fail(new Error("Timed out while opening the PDF print window")),
        readyTimeoutMs,
      );
      console.log("[openPdfPrintWindow] Window created, waiting for READY (timeout:", readyTimeoutMs, "ms)");
    })().catch(fail);
  });
}
