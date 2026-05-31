import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { AccountService } from '../../../core/services/account.service';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

@Component({
  selector: 'app-account-list',
  standalone: true,
  imports: [CommonModule, RouterLink, FormsModule],
  templateUrl: './account-list.component.html',
  styleUrl: './account-list.component.scss'
})
export class AccountListComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  readonly accountService = inject(AccountService);

  // Active game info signals
  readonly activeGameSlug = signal<string | null>(null);
  readonly activeGame = computed(() => {
    const slug = this.activeGameSlug();
    if (!slug) return null;
    return this.accountService.games().find(g => g.slug === slug) || null;
  });

  // Filter & Search signals
  readonly searchQuery = signal<string>('');
  readonly minPrice = signal<number | null>(null);
  readonly maxPrice = signal<number | null>(null);
  readonly sortBy = signal<'newest' | 'price_asc' | 'price_desc'>('newest');

  // Filtered Accounts
  readonly filteredAccounts = computed(() => {
    const rawAccounts = this.accountService.accounts();
    const query = this.searchQuery().toLowerCase().trim();
    const min = this.minPrice();
    const max = this.maxPrice();
    const sort = this.sortBy();

    let filtered = [...rawAccounts];

    // Filter by search query
    if (query) {
      filtered = filtered.filter(acc => 
        acc.title.toLowerCase().includes(query) || 
        (acc.description && acc.description.toLowerCase().includes(query))
      );
    }

    // Filter by price range
    if (min !== null) {
      filtered = filtered.filter(acc => acc.price >= min);
    }
    if (max !== null) {
      filtered = filtered.filter(acc => acc.price <= max);
    }

    // Sort accounts
    if (sort === 'price_asc') {
      filtered.sort((a, b) => a.price - b.price);
    } else if (sort === 'price_desc') {
      filtered.sort((a, b) => b.price - a.price);
    } else {
      // newest
      filtered.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    }

    return filtered;
  });

  ngOnInit(): void {
    // Listen to route parameter changes
    this.route.paramMap.subscribe(async (params) => {
      const slug = params.get('slug');
      this.activeGameSlug.set(slug);
      
      this.resetFilters();

      // Ensure games are loaded first
      if (this.accountService.games().length === 0) {
        await this.accountService.loadGames();
      }

      const game = this.activeGame();
      if (game) {
        await this.accountService.loadAccounts(game.id);
      } else {
        // If game not found, load all accounts
        await this.accountService.loadAccounts();
      }
    });
  }

  resetFilters(): void {
    this.searchQuery.set('');
    this.minPrice.set(null);
    this.maxPrice.set(null);
    this.sortBy.set('newest');
  }
}
