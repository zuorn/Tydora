import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { type BuiltArtifact, type ExportFormat, saveExportArtifact } from "../export";
import "./ExportPreviewDialog.css";

interface ExportPreviewDialogProps {
  format: ExportFormat;
  artifact: BuiltArtifact;
  title: string;
  onClose: () => void;
  onSaveSuccess?: (savedPath: string) => void;
}

/**
 * 为 PDF 预览构建分页卡片效果。
 * 每页为白底带阴影的卡片，页间有间隔，与图片预览风格一致。
 */
function buildPdfPreviewHtml(baseHtml: string): string {
  const PAGE_STYLES = `
<style>
  html, body {
    margin: 0;
    padding: 0;
    background: var(--bg-primary, #f5f5f5);
    overflow-y: auto;
    height: auto;
    min-height: 100vh;
    width: 100%;
  }
  .export-page.export-page--paginated {
    display: flex;
    justify-content: center;
    padding: 0 !important;
    width: 100%;
    background: transparent;
    box-shadow: none;
    border-radius: 0;
    overflow-x: visible;
  }
  .export-page--paginated > :not(.pdf-pages) {
    display: none;
  }
  .pdf-pages {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 24px;
    padding: 20px 0 20px 24px;
    overflow-x: visible;
  }
  .pdf-page {
    width: 724px;
    height: 1062px;
    padding: 48px;
    box-sizing: border-box;
    background: #ffffff;
    box-shadow: 0 2px 12px rgba(0, 0, 0, 0.2);
    overflow: hidden;
    position: relative;
    flex-shrink: 0;
    border-radius: 4px;
    max-width: 100%;
    transform-origin: top left;
  }
  .pdf-page-content {
    width: 100%;
    position: relative;
  }
</style>`;

  const PAGE_SCRIPT = [
    "<script>",
    "(function(){",
    "function collectCodeLines(pre,pageRect){",
    "var lines=[];",
    "var walker=document.createTreeWalker(pre,NodeFilter.SHOW_TEXT);",
    "var node;",
    "while((node=walker.nextNode())){",
    "var range=document.createRange();",
    "range.selectNodeContents(node);",
    "var rects=range.getClientRects();",
    "for(var i=0;i<rects.length;i++){",
    "var r=rects[i];",
    "lines.push({top:r.top-pageRect.top,bottom:r.bottom-pageRect.top});",
    "}",
    "}",
    "if(lines.length===0)return[];",
    "lines.sort(function(a,b){return a.top-b.top;});",
    "var merged=[];",
    "for(var i=0;i<lines.length;i++){",
    "var line=lines[i];",
    "var last=merged[merged.length-1];",
    "if(last&&Math.abs(line.top-last.top)<2){",
    "last.bottom=Math.max(last.bottom,line.bottom);",
    "}else{",
    "merged.push({top:line.top,bottom:line.bottom});",
    "}",
    "}",
    "return merged;",
    "}",
    "function collectTextLines(el,pageRect){",
    "var lines=[];",
    "var walker=document.createTreeWalker(el,NodeFilter.SHOW_TEXT);",
    "var node;",
    "while((node=walker.nextNode())){",
    "var range=document.createRange();",
    "range.selectNodeContents(node);",
    "var rects=range.getClientRects();",
    "for(var i=0;i<rects.length;i++){",
    "var r=rects[i];",
    "lines.push({top:r.top-pageRect.top,bottom:r.bottom-pageRect.top});",
    "}",
    "}",
    "if(lines.length===0)return[];",
    "lines.sort(function(a,b){return a.top-b.top;});",
    "var merged=[];",
    "for(var i=0;i<lines.length;i++){",
    "var line=lines[i];",
    "var last=merged[merged.length-1];",
    "if(last&&Math.abs(line.top-last.top)<2){",
    "last.bottom=Math.max(last.bottom,line.bottom);",
    "}else{",
    "merged.push({top:line.top,bottom:line.bottom});",
    "}",
    "}",
    "return merged;",
    "}",
    "function snapToTextLine(nextY,currentY,pageH,lines){",
    "for(var i=0;i<lines.length-1;i++){",
    "var thisBottom=lines[i].bottom;",
    "var nextTop=lines[i+1].top;",
    "if(nextY>=thisBottom&&nextY<=nextTop){",
    "if(thisBottom-currentY>=pageH*0.40)return thisBottom;",
    "return nextTop;",
    "}",
    "}",
    "var lastLine=lines[lines.length-1];",
    "if(lastLine&&nextY>lastLine.bottom)return lastLine.bottom;",
    "var firstLine=lines[0];",
    "if(firstLine&&nextY<firstLine.top)return firstLine.top;",
    "return nextY;",
    "}",
    "function snapToLine(nextY,currentY,pageH,lines){",
    "for(var i=0;i<lines.length-1;i++){",
    "var thisBottom=lines[i].bottom;",
    "var nextTop=lines[i+1].top;",
    "if(nextY>=thisBottom&&nextY<=nextTop){",
    "if(thisBottom-currentY>=pageH*0.35)return thisBottom;",
    "return nextTop;",
    "}",
    "}",
    "var lastLine=lines[lines.length-1];",
    "if(lastLine&&nextY>lastLine.bottom)return lastLine.bottom;",
    "var firstLine=lines[0];",
    "if(firstLine&&nextY<firstLine.top)return firstLine.top;",
    "return nextY;",
    "}",
    "function paginatePdf(){",
    "var el=document.querySelector('.export-page');",
    "if(!el||!el.scrollHeight){window.requestAnimationFrame(paginatePdf);return;}",
    "var padding=48;",
    "var pageContentH=966;",
    "var pageRect=el.getBoundingClientRect();",
    "var firstEl=el.querySelector('.export-app-header,p,h1,h2,h3,h4,h5,h6,pre,blockquote,ul,ol,.callout,table,figure,img,svg,ul[data-type=\"taskList\"]>li');",
    "var contentTop=firstEl?firstEl.getBoundingClientRect().top-pageRect.top:padding;",
    "var cs=getComputedStyle(el);",
    "var padBottom=parseFloat(cs.paddingBottom)||padding;",
    "var contentBottom=el.scrollHeight-padBottom;",
    "if(contentBottom<=contentTop){return;}",
    "var selectors=['p','li','pre','blockquote','h1','h2','h3','h4','h5','h6','.callout','tr','figure','img','svg',\"ul[data-type='taskList']>li\"];",
    "var elements=Array.from(el.querySelectorAll(selectors.join(',')));",
    "var rects=elements.map(function(e){",
    "var r=e.getBoundingClientRect();",
    "return{el:e,top:r.top-pageRect.top,bottom:r.bottom-pageRect.top,height:r.height};",
    "}).filter(function(r){return r.height>0;});",
    "var preElements=Array.from(el.querySelectorAll('pre'));",
    "var codeLinesByPre={};",
    "preElements.forEach(function(pre){",
    "var lines=collectCodeLines(pre,pageRect);",
    "if(lines.length>0)codeLinesByPre[pre]=lines;",
    "});",
    "var breaks=[contentTop];",
    "var currentY=contentTop;",
    "while(currentY<contentBottom){",
    "var nextY=Math.min(currentY+pageContentH,contentBottom);",
    "if(nextY>=contentBottom){break;}",
    "var cutPre=preElements.find(function(pre){",
    "var r=pre.getBoundingClientRect();",
    "return r.top-pageRect.top<nextY&&r.bottom-pageRect.top>nextY;",
    "});",
    "if(cutPre){",
    "var rr=cutPre.getBoundingClientRect();",
    "var h=rr.height;",
    "if(h<pageContentH){",
    "nextY=rr.top-pageRect.top;",
    "}else{",
    "var lines=codeLinesByPre[cutPre];",
    "if(lines&&lines.length>0){",
    "nextY=snapToLine(nextY,currentY,pageContentH,lines);",
    "}",
    "}",
    "}else{",
    "var cut=rects.find(function(r){return r.top<nextY&&r.bottom>nextY&&r.height<pageContentH;});",
    "if(cut){",
    "var before=Math.max(currentY,cut.top);",
    "var after=cut.bottom;",
    "var tag=cut.el.tagName;",
    "if(tag==='LI'||tag==='TR'||tag==='FIGURE'){nextY=before;}",
    "else if(before-currentY>=pageContentH*0.55){nextY=before;}",
    "else if(after>currentY+pageContentH){",
    "var tLines=collectTextLines(cut.el,pageRect);",
    "if(tLines.length>1)nextY=snapToTextLine(currentY+pageContentH,currentY,pageContentH,tLines);",
    "else nextY=after;",
    "}else{nextY=after;}",
    "}",
    "}",
    "if(nextY<=currentY){nextY=Math.min(currentY+pageContentH,contentBottom);}",
    "breaks.push(nextY);",
    "currentY=nextY;",
    "}",
    "breaks.push(contentBottom);",
    "var html=el.innerHTML;",
    "var pagesContainer=document.createElement('div');",
    "pagesContainer.className='pdf-pages';",
    "var total=breaks.length-1;",
    "for(var i=0;i<total;i++){",
    "var page=document.createElement('div');",
    "page.className='pdf-page';",
    "// 只有最后一页按实际内容高度，其余保持标准 1062px（保留卡片阴影）",
    "if(i===total-1){",
    "var lastH=breaks[total]-breaks[total-1]+padBottom+padding;",
    "page.style.height=lastH+'px';",
    "}",
    "var pageContent=document.createElement('div');",
    "pageContent.className='pdf-page-content';",
    "// 内层 wrapper 精确裁剪内容到本页间隙，杜绝溢出到下一行",
    "var innerWrap=document.createElement('div');",
    "innerWrap.style.overflow='hidden';",
    "innerWrap.style.height=(breaks[i+1]-breaks[i]).toFixed(1)+'px';",
    "innerWrap.innerHTML=html;",
    "innerWrap.style.transform='translateY('+(-breaks[i]).toFixed(1)+'px)';",
    "pageContent.appendChild(innerWrap);",
    "page.appendChild(pageContent);",
    "pagesContainer.appendChild(page);",
    "}",
    "el.innerHTML='';",
    "el.className='export-page export-page--paginated';",
    "el.appendChild(pagesContainer);",
    "}",
    "function runWhenReady(fn){",
    "if(document.readyState==='complete'){fn();}else{window.addEventListener('load',fn);}",
    "}",
    "runWhenReady(function(){window.requestAnimationFrame(paginatePdf);});",
    "})();",
    "</script>"
  ].join("");

  return baseHtml.replace("</body>", PAGE_STYLES + PAGE_SCRIPT + "</body>");
}

export function ExportPreviewDialog({ format, artifact, title, onClose, onSaveSuccess }: ExportPreviewDialogProps) {
  const { t } = useTranslation();
  const dialogRef = useRef<HTMLDivElement>(null);
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const previewHtml = useMemo(() => {
    if (format === "pdf" && artifact.previewHtml) {
      return buildPdfPreviewHtml(artifact.previewHtml);
    }
    return artifact.previewHtml;
  }, [format, artifact.previewHtml]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (saving) return;
      if (e.key === "Escape") {
        onClose();
      } else if (e.key === "Enter") {
        e.preventDefault();
        if (format === "wechat") {
          copyWechatRef.current();
        } else {
          confirmRef.current();
        }
      }
    };
    const handleOverlayClick = (e: MouseEvent) => {
      if (dialogRef.current && !dialogRef.current.contains(e.target as Node) && !saving) {
        onClose();
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    document.addEventListener("mousedown", handleOverlayClick);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.removeEventListener("mousedown", handleOverlayClick);
    };
  }, [onClose, saving, format]);

  // 使用 ref 保持确认回调稳定，避免 Enter 快捷键监听反复注册
  const confirmRef = useRef<() => void>(() => {});
  const copyWechatRef = useRef<() => void>(() => {});

  const handleConfirm = useCallback(async () => {
    if (saving) return;
    setSaving(true);
    setError(null);
    try {
      const path = await saveExportArtifact(format, artifact.content, title);
      if (path) {
        onClose();
        onSaveSuccess?.(path);
      } else {
        // 用户取消保存
        onClose();
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }, [saving, format, artifact.content, title, onClose, onSaveSuccess]);
  confirmRef.current = handleConfirm;

  /** 公众号格式：将 HTML 内容写入剪贴板，支持粘贴到公众号编辑器 */
  const handleCopyWechat = useCallback(async () => {
    if (saving) return;
    setSaving(true);
    setError(null);
    try {
      const htmlContent = typeof artifact.content === "string" ? artifact.content : new TextDecoder().decode(artifact.content);
      const blob = new Blob([htmlContent], { type: "text/html" });
      const clipboardItem = new ClipboardItem({ "text/html": blob });
      await navigator.clipboard.write([clipboardItem]);
      setCopied(true);
      setTimeout(() => {
        onClose();
      }, 1500);
    } catch (e) {
      // 降级：如果 ClipboardItem 不可用，尝试读取并用 execCommand
      try {
        const htmlContent = typeof artifact.content === "string" ? artifact.content : new TextDecoder().decode(artifact.content);
        const textContent = htmlContent.replace(/<[^>]+>/g, "");
        const blob = new Blob([htmlContent], { type: "text/html" });
        const clipboardItem = new ClipboardItem({ "text/html": blob, "text/plain": new Blob([textContent], { type: "text/plain" }) });
        await navigator.clipboard.write([clipboardItem]);
        setCopied(true);
        setTimeout(() => {
          onClose();
        }, 1500);
      } catch (e2) {
        setError(e instanceof Error ? e.message : t("app.export.copyFailed"));
      }
    } finally {
      setSaving(false);
    }
  }, [saving, artifact.content, onClose]);
  copyWechatRef.current = handleCopyWechat;

  const isWechat = format === "wechat";

  return (
    <div className="export-preview-overlay">
      <div ref={dialogRef} className="export-preview-dialog">
        <div className="export-preview-header">
          <span className="export-preview-title">{t("exportPreview.title", { label: t(`app.export.${format}`) })}</span>
          <div className="export-preview-header-actions">
            {error && <span className="export-preview-error">{t("exportPreview.exportFailed", { error })}</span>}
            {copied && <span className="export-preview-copied">{t("exportPreview.copiedToClipboard")}</span>}
            {isWechat ? (
              <button className="export-preview-btn export-preview-btn-confirm" onClick={handleCopyWechat} disabled={saving}>
                {copied ? t("exportPreview.copied") : saving ? t("exportPreview.copying") : t("exportPreview.copyToClipboard")}
              </button>
            ) : (
              <button className="export-preview-btn export-preview-btn-confirm" onClick={handleConfirm} disabled={saving}>
                {saving ? t("exportPreview.exporting") : t("exportPreview.exportAs", { label: t(`app.export.${format}`) })}
              </button>
            )}
            <button className="export-preview-close" onClick={onClose} disabled={saving} title={t("settings.close")}>
              ✕
            </button>
          </div>
        </div>

        <div className={`export-preview-body${format === "pdf" ? " export-preview-body--pdf" : ""}`}>
          {previewHtml ? (
            <iframe
              className={`export-preview-frame${format === "pdf" ? " export-preview-frame--pdf" : ""}`}
              title={t("exportPreview.dialogTitle")}
              srcDoc={previewHtml}
              sandbox={format === "pdf" ? "allow-scripts" : ""}
            />
          ) : artifact.previewPng ? (
            <div className="export-preview-img-wrap">
              <img className="export-preview-img" src={artifact.previewPng} alt={t("exportPreview.dialogTitle")} />
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
