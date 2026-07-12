import { useEffect, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { LinkIndexService } from '../wikilink';

interface FsEvent {
  kind: string;
  paths: string[];
}

export function useVaultWatcher(vaultPath: string | null, onIndexChange?: () => void) {
  const debounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const onIndexChangeRef = useRef(onIndexChange);
  onIndexChangeRef.current = onIndexChange;

  useEffect(() => {
    if (!vaultPath) return;

    invoke('watch_vault', { path: vaultPath }).catch(console.error);

    const unlisten = listen<FsEvent>('vault://changed', (event) => {
      clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(async () => {
        const { kind, paths } = event.payload;

        for (const filePath of paths) {
          if (!filePath.endsWith('.md')) continue;

          if (kind.includes('Remove')) {
            LinkIndexService.removeFile(filePath);
          } else if (kind.includes('Create') || kind.includes('Modify')) {
            try {
              await LinkIndexService.updateFileLinks(filePath, vaultPath);
            } catch {
              // 文件可能正在被写入
            }
          }
        }
        onIndexChangeRef.current?.();
      }, 300);
    });

    return () => {
      unlisten.then(fn => fn());
      invoke('unwatch_vault').catch(console.error);
      clearTimeout(debounceRef.current);
    };
  }, [vaultPath]);
}
