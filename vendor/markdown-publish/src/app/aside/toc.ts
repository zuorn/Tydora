import {
  afterRenderEffect,
  ChangeDetectionStrategy,
  Component,
  DOCUMENT,
  inject,
  input,
  PLATFORM_ID,
  signal,
} from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import type { Heading } from '@shared/content-model';

@Component({
  selector: 'app-toc',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (headings().length) {
      <nav class="toc" aria-label="On this page">
        <p class="toc-title">On this page</p>
        @for (heading of headings(); track heading.slug) {
          <a
            class="toc-link"
            [class.toc-active]="active() === heading.slug"
            [style.paddingInlineStart.rem]="(heading.level - 1) * 0.75"
            [href]="'#' + heading.slug"
            (click)="onClick($event, heading.slug)"
          >
            {{ heading.text }}
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

      .toc-title {
        margin: 0 0 0.5rem;
        font-weight: 600;
        font-size: 0.6875rem;
        letter-spacing: 0.05em;
        text-transform: uppercase;
        color: var(--global--text-faint);
      }

      .toc-link {
        display: block;
        padding-block: 0.25rem;
        color: var(--global--text-muted);
        text-decoration: none;
        font-size: 0.8125rem;
        line-height: 1.4;
        transition: color 80ms ease;
      }

      .toc-link:hover {
        color: var(--global--text-normal);
      }

      .toc-active {
        color: var(--global--text-accent);
        font-weight: 600;
      }
    `,
  ],
})
export class Toc {
  readonly headings = input.required<Heading[]>();

  private readonly platformId = inject(PLATFORM_ID);
  private readonly doc = inject(DOCUMENT);
  protected readonly active = signal<string | null>(null);
  private observer?: IntersectionObserver;

  constructor() {
    afterRenderEffect(() => {
      const headings = this.headings();
      if (!isPlatformBrowser(this.platformId)) {
        return;
      }
      this.observer?.disconnect();
      this.observer = new IntersectionObserver(
        (entries) => {
          for (const entry of entries) {
            if (entry.isIntersecting) {
              this.active.set(entry.target.id);
            }
          }
        },
        { rootMargin: '0px 0px -70% 0px' },
      );
      for (const heading of headings) {
        const el = this.doc.getElementById(heading.slug);
        if (el) {
          this.observer.observe(el);
        }
      }
    });
  }

  protected onClick(event: Event, slug: string): void {
    if (!isPlatformBrowser(this.platformId)) {
      return;
    }
    event.preventDefault();
    this.doc.getElementById(slug)?.scrollIntoView({ behavior: 'smooth' });
    this.active.set(slug);
  }
}
