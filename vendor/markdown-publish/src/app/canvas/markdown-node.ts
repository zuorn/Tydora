import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  PLATFORM_ID,
} from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { DomSanitizer } from '@angular/platform-browser';
import DOMPurify from 'dompurify';
import type { CanvasNode, TextPayload } from '@shared/content-model';
import { CONNECTOR_IMPORTS, CONNECTORS_STYLES, CONNECTORS_TEMPLATE, CanvasNodeBase } from './connectors';

@Component({
  selector: 'app-markdown-node',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [...CONNECTOR_IMPORTS],
  host: {
    '[style.width.px]': 'node().width',
    '[style.height.px]': 'node().height',
    '[style.border-color]': 'node().color || null',
  },
  template:
    `
    <div class="content" [innerHTML]="safeHtml()"></div>
  ` + CONNECTORS_TEMPLATE,
  styles: [
    CONNECTORS_STYLES,
    `
      :host {
        display: block;
        position: relative;
        box-sizing: border-box;
        height: 100%;
        overflow: auto;
        border: 0.0625rem solid var(--df-node-border-color, var(--global--background-modifier-border));
        border-radius: 0.5rem;
        background: var(--global--background-primary);
        padding: 0.5rem 0.75rem;
      }
    `,
  ],
})
export class MarkdownNode extends CanvasNodeBase {
  private readonly sanitizer = inject(DomSanitizer);
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  protected readonly node = computed(() => this.modelSignal() as unknown as CanvasNode);

  protected readonly safeHtml = computed(() => {
    const html = (this.node().payload as TextPayload).html ?? '';
    return this.sanitizer.bypassSecurityTrustHtml(
      this.isBrowser ? DOMPurify.sanitize(html) : html,
    );
  });
}
