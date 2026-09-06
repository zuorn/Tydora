import { ChangeDetectionStrategy, Component, computed } from '@angular/core';
import type { CanvasNode, LinkPayload } from '@shared/content-model';
import { CONNECTOR_IMPORTS, CONNECTORS_STYLES, CONNECTORS_TEMPLATE, CanvasNodeBase } from './connectors';

@Component({
  selector: 'app-link-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [...CONNECTOR_IMPORTS],
  host: {
    '[style.width.px]': 'node().width',
    '[style.height.px]': 'node().height',
    '[style.border-color]': 'node().color || null',
  },
  template:
    `
    <a class="card" [href]="payload().url" target="_blank" rel="noopener" (click)="onClick($event)">
      @if (payload().favicon) {
        <img class="favicon" [src]="payload().favicon" alt="" />
      }
      <span class="title">{{ payload().title || host() }}</span>
      <span class="url">{{ payload().url }}</span>
    </a>
  ` + CONNECTORS_TEMPLATE,
  styles: [
    CONNECTORS_STYLES,
    `
      :host {
        display: block;
        position: relative;
        box-sizing: border-box;
        height: 100%;
        border: 0.0625rem solid var(--df-node-border-color, var(--global--background-modifier-border));
        border-radius: 0.5rem;
        background: var(--global--background-primary);
        overflow: hidden;
      }

      .card {
        display: flex;
        flex-direction: column;
        gap: 0.25rem;
        height: 100%;
        padding: 0.5rem 0.75rem;
        text-decoration: none;
        color: inherit;
      }

      .favicon {
        width: 1rem;
        height: 1rem;
      }

      .title {
        font-weight: 600;
      }

      .url {
        font-size: 0.75rem;
        color: var(--global--text-muted);
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
    `,
  ],
})
export class LinkCard extends CanvasNodeBase {
  protected readonly node = computed(() => this.modelSignal() as unknown as CanvasNode);
  protected readonly payload = computed(() => this.node().payload as LinkPayload);

  protected readonly host = computed(() => {
    try {
      return new URL(this.payload().url).host;
    } catch {
      return this.payload().url;
    }
  });

  protected onClick(event: MouseEvent): void {
    if (this.wasDragged(event)) {
      event.preventDefault(); // the click ended a drag — don't open the link
    }
  }
}
