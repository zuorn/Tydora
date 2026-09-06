import { ChangeDetectionStrategy, Component, computed } from '@angular/core';
import type { CanvasNode, GroupPayload } from '@shared/content-model';
import { CONNECTOR_IMPORTS, CONNECTORS_STYLES, CONNECTORS_TEMPLATE, CanvasNodeBase } from './connectors';

@Component({
  selector: 'app-group-node',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [...CONNECTOR_IMPORTS],
  host: {
    '[style.width.px]': 'node().width',
    '[style.height.px]': 'node().height',
    '[style.border-color]': 'node().color || null',
  },
  template:
    `
    @if (payload().label) {
      <span class="label">{{ payload().label }}</span>
    }
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
        background: rgba(127, 127, 127, 0.06);
      }

      .label {
        position: absolute;
        top: 0.25rem;
        left: 0.5rem;
        font-size: 0.75rem;
        font-weight: 600;
        color: var(--global--text-muted);
      }
    `,
  ],
})
export class GroupNode extends CanvasNodeBase {
  protected readonly node = computed(() => this.modelSignal() as unknown as CanvasNode);
  protected readonly payload = computed(() => this.node().payload as GroupPayload);
}
