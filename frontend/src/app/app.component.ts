import { Component, inject } from '@angular/core';
import { Router, RouterOutlet } from '@angular/router';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { ToastComponent } from './components/toast/toast.component';
import { ReconnectOverlayComponent } from './components/reconnect-overlay/reconnect-overlay.component';
import { UpperCasePipe } from '@angular/common';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, ToastComponent, ReconnectOverlayComponent, TranslateModule, UpperCasePipe],
  templateUrl: './app.component.html',
  styleUrl: './app.component.scss',
})
export class AppComponent {
  private readonly translate = inject(TranslateService);
  private readonly router = inject(Router);

  readonly languages = ['en', 'fr'];
  showLeaveDialog = false;

  constructor() {
    this.translate.addLangs(this.languages);
    const browserLang = navigator.language?.split('-')[0];
    const defaultLang = browserLang === 'en' ? 'en' : 'fr';
    this.translate.use(defaultLang);
  }

  get currentLang(): string {
    return this.translate.getCurrentLang() || 'fr';
  }

  get isInGame(): boolean {
    return this.router.url !== '/';
  }

  switchLang(lang: string): void {
    this.translate.use(lang);
  }

  goHome(): void {
    // Check if user is in a game page (not the hub)
    if (this.isInGame) {
      this.showLeaveDialog = true;
    }
  }

  confirmLeave(): void {
    this.showLeaveDialog = false;
    this.router.navigate(['/']);
  }

  cancelLeave(): void {
    this.showLeaveDialog = false;
  }
}
