import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { ThemeService } from './theme.service';

@Component({
  selector: 'app-theme-toggle',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <button
      type="button"
      class="theme-toggle"
      [class.is-dark]="theme.darkMode()"
      [attr.aria-pressed]="theme.darkMode()"
      aria-label="Toggle theme"
      (click)="theme.toggle()"
    >
      <span class="track">
        <svg class="bg bg-moon" viewBox="0 0 24 24" width="12" height="12" fill="none"
          stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z" />
        </svg>
        <svg class="bg bg-sun" viewBox="0 0 24 24" width="12" height="12" fill="none"
          stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="4" />
          <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" />
        </svg>
        <span class="knob">
          @if (theme.darkMode()) {
            <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor"
              stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z" />
            </svg>
          } @else {
            <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor"
              stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="12" cy="12" r="4" />
              <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" />
            </svg>
          }
        </span>
      </span>
    </button>
  `,
  styles: [
    `
      .theme-toggle {
        display: inline-flex;
        align-items: center;
        margin-inline-start: 6px;
        padding: 0;
        border: none;
        background: transparent;
        cursor: pointer;
      }

      .track {
        position: relative;
        width: 46px;
        height: 24px;
        border-radius: 12px;
        background: var(--global--background-modifier-border);
        transition: background 120ms ease;
      }

      /* both icons sit inside the pill, faint; the knob highlights the active one */
      .bg {
        position: absolute;
        top: 50%;
        transform: translateY(-50%);
        color: var(--global--text-faint);
        pointer-events: none;
      }

      .bg-moon {
        inset-inline-start: 6px;
      }

      .bg-sun {
        inset-inline-end: 6px;
      }

      .knob {
        position: absolute;
        top: 2px;
        inset-inline-start: 2px;
        display: grid;
        place-items: center;
        width: 20px;
        height: 20px;
        border-radius: 50%;
        background: var(--global--background-primary);
        color: var(--global--text-normal);
        box-shadow: 0 1px 3px rgba(0, 0, 0, 0.3);
        transition: transform 150ms ease;
      }

      .theme-toggle:not(.is-dark) .knob {
        transform: translateX(22px);
      }
    `,
  ],
})
export class ThemeToggle {
  protected readonly theme = inject(ThemeService);
}
