import {
  ChangeDetectionStrategy,
  Component,
  HostListener,
  inject,
  resource,
  signal,
} from '@angular/core';
import { NavigationEnd, Router, RouterLink, RouterOutlet } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { filter } from 'rxjs';
import { ContentService } from '../content/content.service';
import { NavTree } from '../nav/nav-tree';
import { ThemeToggle } from '../theme/theme-toggle';
import { SearchOverlay } from '../search/search-overlay';

@Component({
  selector: 'app-shell',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterOutlet, RouterLink, NavTree, ThemeToggle, SearchOverlay],
  templateUrl: './app-shell.html',
  styleUrl: './app-shell.scss',
})
export class AppShell {
  private readonly content = inject(ContentService);
  private readonly router = inject(Router);

  protected readonly navOpen = signal(false);

  protected readonly manifest = resource({
    loader: () => this.content.loadManifest(),
  });

  constructor() {
    this.router.events
      .pipe(
        filter((event) => event instanceof NavigationEnd),
        takeUntilDestroyed(),
      )
      .subscribe(() => this.navOpen.set(false));
  }

  @HostListener('document:keydown.escape')
  protected closeNav(): void {
    this.navOpen.set(false);
  }
}
