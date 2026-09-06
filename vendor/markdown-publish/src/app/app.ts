import { afterNextRender, Component, inject } from '@angular/core';
import { AppShell } from './shell/app-shell';
import { ThemeService } from './theme/theme.service';
import { WebmcpService } from './webmcp/webmcp.service';

@Component({
  selector: 'app-root',
  imports: [AppShell],
  templateUrl: './app.html',
  styleUrl: './app.scss',
})
export class App {
  private readonly theme = inject(ThemeService);
  private readonly webmcp = inject(WebmcpService);

  constructor() {
    afterNextRender(() => void this.webmcp.register());
  }
}
