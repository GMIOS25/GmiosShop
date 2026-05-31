import { Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [RouterLink],
  templateUrl: './home.component.html',
  styleUrl: './home.component.scss'
})
export class HomeComponent {
  readonly authService = inject(AuthService);

  readonly gamesList = [
    { name: 'League of Legends', slug: 'lol', count: '124 tài khoản', icon: '🏆' },
    { name: 'FC Online', slug: 'fco', count: '89 tài khoản', icon: '⚽' },
    { name: 'Arena of Valor', slug: 'aov', count: '145 tài khoản', icon: '⚔️' }
  ];
}
