import { memo, useState, useCallback, useRef, useEffect } from 'react';
import { Handle, Position, NodeResizer, type NodeProps } from '@xyflow/react';
import { getCanvasColor } from '../canvas-utils';
import { useNearestEdge } from '../useNearestEdge';

// Shared proxy server state
let proxyServerUrl: string | null = null;
let proxyServerPromise: Promise<string> | null = null;

async function getProxyServerUrl(): Promise<string> {
  if (proxyServerUrl) return proxyServerUrl;
  if (proxyServerPromise) return proxyServerPromise;

  proxyServerPromise = import('@tauri-apps/api/core').then(({ invoke }) =>
    invoke<string>('start_proxy_server')
  ).then(url => {
    proxyServerUrl = url;
    return url;
  });

  return proxyServerPromise;
}

function UrlNode({ data, selected }: NodeProps) {
  const url = (data as any)?.url || '';
  const label = (data as any)?.label || '';
  const { nodeRef, activeEdge, handleMouseMove, handleMouseLeave } = useNearestEdge();

  const [pageTitle, setPageTitle] = useState(label);
  const [iframeFailed, setIframeFailed] = useState(false);
  const [interactive, setInteractive] = useState(false);
  const [proxyUrl, setProxyUrl] = useState<string | null>(null);
  const [isHovered, setIsHovered] = useState(false);
  const [retryCount, setRetryCount] = useState(0);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  // Start proxy server and build proxy URL
  useEffect(() => {
    if (!url) {
      setProxyUrl(null);
      return;
    }

    let cancelled = false;

    getProxyServerUrl().then(baseUrl => {
      if (!cancelled) {
        setProxyUrl(`${baseUrl}/proxy?url=${encodeURIComponent(url)}`);
      }
    }).catch(() => {
      // If proxy fails, fall back to direct URL
      if (!cancelled) {
        setProxyUrl(url);
      }
    });

    return () => { cancelled = true; };
  }, [url]);

  // Fetch page title from backend
  useEffect(() => {
    if (!url) return;

    let cancelled = false;
    import('@tauri-apps/api/core').then(({ invoke }) => {
      invoke<string>('fetch_page_title', { url }).then(title => {
        if (!cancelled && title) {
          setPageTitle(title);
        }
      }).catch(() => {});
    });

    return () => { cancelled = true; };
  }, [url]);

  // Reset state when url changes
  useEffect(() => {
    setPageTitle(label || '');
    setIframeFailed(false);
    setRetryCount(0);
    setInteractive(false);
  }, [url, label]);

  const handleOpenUrl = useCallback(() => {
    if (url) {
      import('@tauri-apps/api/core').then(({ invoke }) => {
        invoke('open_url', { url });
      });
    }
  }, [url]);

  const handleIframeLoad = useCallback(() => {
    try {
      const iframeDoc = iframeRef.current?.contentDocument;
      if (iframeDoc?.title && !pageTitle) {
        setPageTitle(iframeDoc.title);
      }
    } catch {
      // Cross-origin - backend fetch already handled title
    }
  }, [pageTitle]);

  const handleIframeError = useCallback(() => {
    if (retryCount < 2) {
      // Retry after a short delay
      setTimeout(() => {
        setRetryCount(c => c + 1);
        setIframeFailed(false);
      }, 500);
    } else {
      setIframeFailed(true);
    }
  }, [retryCount]);

  const toggleInteractive = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    setInteractive(prev => !prev);
  }, []);

  const handleNodeMouseEnter = useCallback(() => setIsHovered(true), []);
  const handleNodeMouseLeave = useCallback(() => { setIsHovered(false); handleMouseLeave(); }, [handleMouseLeave]);

  // Double-click to toggle iframe interactive mode
  const handleDoubleClick = useCallback(() => {
    setInteractive(prev => !prev);
  }, []);

  // When user releases mouse over the iframe area, the mouseup event may be
  // captured by the iframe and not reach React Flow's window listener.
  // Re-dispatch the event to the window so React Flow can end the drag.
  const handleWrapperMouseUp = useCallback((e: React.MouseEvent) => {
    if (e.button === 0) {
      const win = window;
      if (win) {
        win.dispatchEvent(new MouseEvent('mouseup', {
          bubbles: true,
          cancelable: true,
          clientX: e.clientX,
          clientY: e.clientY,
          button: 0,
        }));
      }
    }
  }, []);

  const color = getCanvasColor((data as any)?.color);
  const backgroundColor = color ? `${color}15` : 'var(--bg-primary)';
  const borderColor = color || (selected ? 'var(--accent)' : 'var(--border)');

  const displayTitle = pageTitle || url || '未设置 URL';
  const iframeSrc = proxyUrl || url;

  return (
    <div
      ref={nodeRef}
      className={`canvas-node canvas-url-node ${selected ? 'selected' : ''}`}
      style={{
        width: '100%',
        height: '100%',
        background: backgroundColor,
        borderColor: borderColor,
      }}
      onMouseEnter={handleNodeMouseEnter}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleNodeMouseLeave}
      onMouseUp={handleWrapperMouseUp}
      onDoubleClick={handleDoubleClick}
    >
      <NodeResizer
        isVisible={selected || isHovered}
        minWidth={200}
        minHeight={150}
        lineClassName="canvas-resize-line"
        handleClassName="canvas-resize-handle"
      />

      <Handle type="target" position={Position.Top} id="top" className={`canvas-handle ${activeEdge === 'top' ? 'visible' : ''}`} />
      <Handle type="target" position={Position.Left} id="left" className={`canvas-handle ${activeEdge === 'left' ? 'visible' : ''}`} />
      <Handle type="source" position={Position.Right} id="right" className={`canvas-handle ${activeEdge === 'right' ? 'visible' : ''}`} />
      <Handle type="source" position={Position.Bottom} id="bottom" className={`canvas-handle ${activeEdge === 'bottom' ? 'visible' : ''}`} />

      <div className="canvas-url-header">
        <div className="canvas-url-header-left" onClick={handleOpenUrl} style={{ cursor: 'pointer', flex: 1, minWidth: 0 }}>
          <span className="canvas-url-label">{displayTitle}</span>
        </div>
        <div className="canvas-url-header-actions">
          <button
            className="canvas-url-action-btn"
            onClick={handleOpenUrl}
            title="在浏览器中打开"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
              <polyline points="15 3 21 3 21 9" />
              <line x1="10" y1="14" x2="21" y2="3" />
            </svg>
          </button>
          {url && !iframeFailed && (
            <button
              className={`canvas-url-action-btn ${interactive ? 'active' : ''}`}
              onClick={toggleInteractive}
              title={interactive ? '关闭交互' : '开启交互'}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                {interactive ? (
                  <>
                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                    <circle cx="12" cy="12" r="3" />
                  </>
                ) : (
                  <>
                    <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
                    <line x1="1" y1="1" x2="23" y2="23" />
                  </>
                )}
              </svg>
            </button>
          )}
        </div>
      </div>

      <div className="canvas-url-content">
        {url && !iframeFailed ? (
          <div
            className="canvas-url-iframe-wrapper"
            onWheel={(e) => e.stopPropagation()}
          >
            <iframe
              ref={iframeRef}
              src={iframeSrc}
              className="canvas-url-iframe"
              sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox"
              onLoad={handleIframeLoad}
              onError={handleIframeError}
              title={displayTitle}
              style={{ pointerEvents: interactive ? 'auto' : 'none' }}
            />
            {!interactive && (
              <div className="canvas-url-iframe-overlay" />
            )}
          </div>
        ) : (
          <div className="canvas-url-fallback">
            <div className="canvas-url-favicon">
              <img
                src={url ? `https://www.google.com/s2/favicons?domain=${new URL(url).hostname}&sz=32` : ''}
                alt=""
                onError={(e) => {
                  (e.target as HTMLImageElement).style.display = 'none';
                }}
              />
            </div>
            <span className="canvas-url-text">{url || '输入 URL'}</span>
          </div>
        )}
      </div>
    </div>
  );
}

export default memo(UrlNode);
