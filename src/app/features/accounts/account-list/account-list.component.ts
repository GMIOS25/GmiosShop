import { Component, computed, effect, inject, OnInit, signal, untracked } from '@angular/core';
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

  // Pagination signals
  readonly currentPage = signal<number>(1);
  readonly pageSize = signal<number>(3);

  readonly totalPages = computed(() => {
    return Math.ceil(this.filteredAccounts().length / this.pageSize());
  });

  readonly pages = computed(() => {
    const current = this.currentPage();
    const total = this.totalPages();
    
    if (total <= 7) {
      return Array.from({ length: total }, (_, i) => i + 1);
    }
    
    const pagesList: number[] = [];
    pagesList.push(1);
    
    const start = Math.max(2, current - 1);
    const end = Math.min(total - 1, current + 1);
    
    if (start > 2) {
      pagesList.push(-1);
    }
    
    for (let i = start; i <= end; i++) {
      pagesList.push(i);
    }
    
    if (end < total - 1) {
      pagesList.push(-1);
    }
    
    pagesList.push(total);
    return pagesList;
  });

  readonly paginatedAccounts = computed(() => {
    const start = (this.currentPage() - 1) * this.pageSize();
    const end = start + this.pageSize();
    return this.filteredAccounts().slice(start, end);
  });

  constructor() {
    // Keep currentPage in bounds when filters/accounts change
    effect(() => {
      const total = this.filteredAccounts().length;
      const pageSize = this.pageSize();
      const maxPage = Math.ceil(total / pageSize) || 1;
      
      if (this.currentPage() > maxPage) {
        untracked(() => this.currentPage.set(maxPage));
      }
    });
  }

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
      this.currentPage.set(1);

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
    this.currentPage.set(1);
  }

  goToPage(page: number): void {
    if (page >= 1 && page <= this.totalPages()) {
      this.currentPage.set(page);
      const grid = document.querySelector('.grid-section');
      if (grid) {
        grid.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }
  }
}
