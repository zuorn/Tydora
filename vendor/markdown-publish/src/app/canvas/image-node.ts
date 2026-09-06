import { ChangeDetectionStrategy, Component, computed } from '@angular/core';
import type { CanvasNode, ImagePayload } from '@shared/content-model';
import { CONNECTOR_IMPORTS, CONNECTORS_STYLES, CONNECTORS_TEMPLATE, CanvasNodeBase } from './connectors';

@Component({
  selector: 'app-image-node',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [...CONNECTOR_IMPORTS],
  host: {
    '[style.width.px]': 'node().width',
    '[style.height.px]': 'node().height',
    '[style.border-color]': 'node().color || null',
  },
  template:
    `
    <img [src]="payload().src" [alt]="payload().alt" />
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
        overflow: hidden;
        background: var(--global--background-primary);
      }

      img {
        display: block;
        width: 100%;
        height: 100%;
        object-fit: contain;
      }
    `,
  ],
})
export class ImageNode extends CanvasNodeBase {
  protected readonly node = computed(() => this.modelSignal() as unknown as CanvasNode);
  protected readonly payload = computed(() => this.node().payload as ImagePayload);
}
