import { Component, signal, inject } from '@angular/core';
import { RouterOutlet, RouterLink, RouterLinkActive } from '@angular/router';
import { AuthService } from './core/services/auth.service';
import { AuthComponent } from './features/auth/auth.component';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, AuthComponent],
  templateUrl: './app.html',
  styleUrl: './app.scss'
})
export class App {

  protected readonly authService = inject(AuthService);
  protected readonly title = signal('GmiosShop');
  readonly authModalOpen = signal(false);

  async logout(): Promise<void> {
    try {
      await this.authService.signOut();
    } catch (err) {
      console.error('Error signing out:', err);
    }
  }

  readonly contactFacebook = "https://www.facebook.com/Thanh.Cuong.IT";
}

