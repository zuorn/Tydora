import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'app-not-found',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink],
  template: `
    <div class="not-found">
      <h1>404</h1>
      <p>This page does not exist.</p>
      <a routerLink="/">Back to home</a>
    </div>
  `,
  styles: [
    `
      .not-found {
        text-align: center;
        padding: 4rem 1rem;
      }
    `,
  ],
})
export class NotFound {}
