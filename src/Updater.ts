import { check, type Update } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";

export interface UpdateInfo {
  version: string;
  body: string;
  date: string;
}

let cachedUpdate: Update | null = null;

export async function checkForUpdate(): Promise<UpdateInfo | null> {
  try {
    const update = await check();
    if (update) {
      cachedUpdate = update;
      return {
        version: update.version,
        body: update.body || "",
        date: update.date || "",
      };
    }
    cachedUpdate = null;
    return null;
  } catch {
    cachedUpdate = null;
    return null;
  }
}

export async function downloadAndInstall(
  onProgress?: (downloaded: number, contentLength: number | null) => void
): Promise<void> {
  if (!cachedUpdate) throw new Error("No update available");
  let downloaded = 0;
  let contentLength: number | null = null;
  await cachedUpdate.downloadAndInstall((event) => {
    switch (event.event) {
      case "Started":
        contentLength = event.data.contentLength ?? null;
        break;
      case "Progress":
        downloaded += event.data.chunkLength;
        onProgress?.(downloaded, contentLength);
        break;
      case "Finished":
        break;
    }
  });
  cachedUpdate = null;
}

export async function relaunchApp(): Promise<void> {
  await relaunch();
}
