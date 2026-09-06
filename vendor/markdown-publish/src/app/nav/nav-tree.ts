import { ChangeDetectionStrategy, Component, inject, input, signal } from '@angular/core';
import { NavigationEnd, Router, RouterLink, RouterLinkActive } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { filter, map } from 'rxjs';
import type { NavNode } from '@shared/content-model';

@Component({
  selector: 'app-nav-tree',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, RouterLinkActive, NavTree],
  template: `
    @for (node of nodes(); track node.name) {
      @if (node.type === 'folder') {
        <div class="tree-item" [class.is-collapsed]="!isOpen(node)">
          <button
            type="button"
            class="tree-item-self is-clickable mod-collapsible"
            (click)="toggle(node)"
          >
            <span class="tree-item-icon collapse-icon">
              <svg
                viewBox="0 0 24 24"
                width="16"
                height="16"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
              >
                <path d="m9 18 6-6-6-6" />
              </svg>
            </span>
            <span class="tree-item-inner">{{ node.name }}</span>
          </button>

          @if (isOpen(node)) {
            <div
              class="tree-item-children"
              animate.enter="children-enter"
              animate.leave="children-leave"
            >
              <div class="tree-item-children-inner">
                <app-nav-tree [nodes]="node.children ?? []" />
              </div>
            </div>
          }
        </div>
      } @else {
        <div class="tree-item">
          <a
            class="tree-item-self is-clickable mod-leaf"
            [routerLink]="['/' + node.slug]"
            routerLinkActive="is-active"
            [routerLinkActiveOptions]="{ exact: true }"
          >
            <span class="tree-item-icon is-leaf">
              @if (node.type === 'canvas') {
                <svg
                  class="canvas-icon"
                  viewBox="0 0 24 24"
                  width="14"
                  height="14"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  aria-label="Canvas"
                >
                  <rect width="7" height="9" x="3" y="3" rx="1" />
                  <rect width="7" height="5" x="14" y="3" rx="1" />
                  <rect width="7" height="9" x="14" y="12" rx="1" />
                  <rect width="7" height="5" x="3" y="16" rx="1" />
                </svg>
              }
            </span>
            <span class="tree-item-inner">{{ node.name }}</span>
          </a>
        </div>
      }
    }
  `,
  styles: [
    `
      :host {
        display: block;
      }

      .tree-item-self {
        display: flex;
        align-items: center;
        gap: 2px;
        width: 100%;
        box-sizing: border-box;
        padding: 4px 8px 4px 6px;
        border: none;
        border-radius: 4px;
        background: transparent;
        font: inherit;
        font-size: 14px;
        line-height: 1.4;
        color: var(--global--text-muted);
        text-align: start;
        text-decoration: none;
        cursor: pointer;
        transition: background 140ms ease, color 140ms ease;
      }

      .tree-item-self:hover {
        background: var(--global--background-modifier-hover);
        color: var(--global--text-normal);
      }

      .tree-item-self.is-active {
        background: var(--global--nav-item-background-active);
        color: var(--global--text-accent);
        font-weight: 500;
      }

      .tree-item-inner {
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .tree-item-icon {
        flex: 0 0 18px;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 18px;
        height: 18px;
        color: var(--global--text-faint);
      }

      .collapse-icon svg {
        transition: transform 180ms ease;
        transform: rotate(90deg);
      }

      .tree-item.is-collapsed .collapse-icon svg {
        transform: rotate(0deg);
      }

      .canvas-icon {
        color: var(--global--text-faint);
      }

      /* Children expand/collapse: the 0fr->1fr grid track animates height
         without measuring; the inner wrapper clips during the transition. */
      .tree-item-children {
        display: grid;
        grid-template-rows: 1fr;
        margin-inline-start: 14px;
        padding-inline-start: 4px;
        border-inline-start: 1px solid var(--global--indentation-guide);
      }

      .tree-item-children-inner {
        overflow: hidden;
        min-height: 0;
      }

      .children-enter {
        animation: nav-children-expand 180ms ease;
      }

      .children-leave {
        animation: nav-children-collapse 180ms ease forwards;
      }

      @keyframes nav-children-expand {
        from {
          grid-template-rows: 0fr;
          opacity: 0.4;
        }
        to {
          grid-template-rows: 1fr;
          opacity: 1;
        }
      }

      @keyframes nav-children-collapse {
        from {
          grid-template-rows: 1fr;
          opacity: 1;
        }
        to {
          grid-template-rows: 0fr;
          opacity: 0.4;
        }
      }
    `,
  ],
})
export class NavTree {
  readonly nodes = input.required<NavNode[]>();

  private readonly router = inject(Router);

  private readonly currentUrl = toSignal(
    this.router.events.pipe(
      filter((event): event is NavigationEnd => event instanceof NavigationEnd),
      map(() => this.router.url),
    ),
    { initialValue: this.router.url },
  );

  // Explicit user overrides (name → open?); absent means "follow active path".
  private readonly overrides = signal<ReadonlyMap<string, boolean>>(new Map());

  protected isOpen(node: NavNode): boolean {
    const override = this.overrides().get(node.name);
    return override ?? this.containsActive(node);
  }

  protected toggle(node: NavNode): void {
    const open = this.isOpen(node);
    this.overrides.update((map) => new Map(map).set(node.name, !open));
  }

  private containsActive(node: NavNode): boolean {
    const url = decodeURIComponent(this.currentUrl().split('?')[0]);
    const walk = (candidate: NavNode): boolean =>
      candidate.type === 'folder'
        ? (candidate.children ?? []).some(walk)
        : '/' + candidate.slug === url;
    return (node.children ?? []).some(walk);
  }
}
