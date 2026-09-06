import { useSyncExternalStore } from "react";
import { emit, listen } from "@tauri-apps/api/event";
import {
  checkForUpdate,
  downloadAndInstall,
  relaunchApp,
  exitApp,
  isStoreVersion,
  isPortableVersion,
  type UpdateInfo,
} from "./Updater";

const EVENT_NAME = "update-state-sync";

export interface UpdateProgress {
  downloaded: number;
  total: number | null;
}

export interface UpdateStoreState {
  updateInfo: UpdateInfo | null;
  downloading: boolean;
  progress: UpdateProgress;
}

const initialState: UpdateStoreState = {
  updateInfo: null,
  downloading: false,
  progress: { downloaded: 0, total: null },
};

let state: UpdateStoreState = { ...initialState };
const listeners = new Set<() => void>();
let downloadPromise: Promise<void> | null = null;
let syncInitialized = false;

function notify() {
  listeners.forEach((listener) => listener());
}

function setState(partial: Partial<UpdateStoreState>, broadcast = true) {
  state = { ...state, ...partial };
  notify();
  if (broadcast) {
    emit(EVENT_NAME, state).catch(() => {});
  }
}

function initSync() {
  if (syncInitialized) return;
  syncInitialized = true;
  listen<UpdateStoreState>(EVENT_NAME, (event) => {
    state = event.payload;
    notify();
  }).catch(() => {});
}

export function subscribeUpdateStore(listener: () => void) {
  initSync();
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getUpdateStoreState(): UpdateStoreState {
  return state;
}

export function useUpdateStore(): UpdateStoreState {
  initSync();
  return useSyncExternalStore(subscribeUpdateStore, getUpdateStoreState, getUpdateStoreState);
}

export function formatUpdateProgressPercent(progress: UpdateProgress): string {
  if (!progress.total) return "";
  return ` ${Math.round((progress.downloaded / progress.total) * 100)}%`;
}

export async function checkForUpdateAndStore(): Promise<UpdateInfo | null> {
  const info = await checkForUpdate();
  setState({ updateInfo: info });
  return info;
}

export async function startUpdateDownload(): Promise<void> {
  if (!state.updateInfo) return;
  if (state.downloading || downloadPromise) return downloadPromise ?? undefined;

  setState({ downloading: true, progress: { downloaded: 0, total: null } });

  downloadPromise = (async () => {
    try {
      await downloadAndInstall((downloaded, total) => {
        setState({ progress: { downloaded, total } });
      });
      if (await isStoreVersion()) {
        await exitApp();
      } else if (await isPortableVersion()) {
        await exitApp();
      } else {
        await relaunchApp();
      }
    } catch (e) {
      setState({ downloading: false });
      throw e;
    } finally {
      downloadPromise = null;
    }
  })();

  return downloadPromise;
}
