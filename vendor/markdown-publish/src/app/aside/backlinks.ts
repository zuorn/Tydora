import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import type { LinkRef } from '@shared/content-model';

@Component({
  selector: 'app-backlinks',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink],
  template: `
    @if (backlinks().length) {
      <nav class="backlinks" aria-label="Backlinks">
        <p class="backlinks-title">Linked references</p>
        @for (link of backlinks(); track link.slug) {
          <a class="backlinks-link" [routerLink]="['/' + link.slug]">
            {{ link.title }}
          </a>
        }
      </nav>
    }
  `,
  styles: [
    `
      :host {
        display: block;
      }

      .backlinks-title {
        margin: 0 0 0.5rem;
        font-weight: 600;
        font-size: 0.6875rem;
        letter-spacing: 0.05em;
        text-transform: uppercase;
        color: var(--global--text-faint);
      }

      .backlinks-link {
        display: block;
        padding-block: 0.25rem;
        color: var(--global--text-muted);
        text-decoration: none;
        font-size: 0.8125rem;
        line-height: 1.4;
      }

      .backlinks-link:hover {
        color: var(--global--text-accent);
      }
    `,
  ],
})
export class Backlinks {
  readonly backlinks = input.required<LinkRef[]>();
}
