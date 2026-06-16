import { Component, inject, OnInit } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AccountService } from '../../core/services/account.service';

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [RouterLink],
  templateUrl: './home.component.html',
  styleUrl: './home.component.scss'
})
export class HomeComponent implements OnInit {
  readonly accountService = inject(AccountService);

  ngOnInit(): void {
    this.accountService.loadGames();
  }

  getGameIcon(slug: string): string {
    switch (slug) {
      case 'lol': return '/assets/icons/lol.png';
      case 'fco': return '/assets/icons/fco.png';
      case 'lqm': return '/assets/icons/lqm.png';
      case 'rb': return '/assets/icons/rb.png';
      case 'pubg': return '/assets/icons/pubg.png';
      case 'ff': return '/assets/icons/ff.png';
      default: return '🎮';
    }
  }
}
