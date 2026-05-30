import { Injectable, signal } from '@angular/core';
import { SupabaseService } from './supabase.service';
import { Game } from '../models/game.model';
import { Account, AccountCredentials } from '../models/account.model';

@Injectable({
  providedIn: 'root'
})
export class AccountService {
  // Private Writable Signals
  readonly #games = signal<Game[]>([]);
  readonly #accounts = signal<Account[]>([]);
  readonly #selectedAccount = signal<Account | null>(null);
  readonly #loading = signal<boolean>(false);

  // Public Read-Only Signals
  readonly games = this.#games.asReadonly();
  readonly accounts = this.#accounts.asReadonly();
  readonly selectedAccount = this.#selectedAccount.asReadonly();
  readonly loading = this.#loading.asReadonly();

  constructor(private supabaseService: SupabaseService) {}

  async loadGames(): Promise<void> {
    this.#loading.set(true);
    try {
      const { data, error } = await this.supabaseService.client
        .from('games')
        .select('*')
        .order('name', { ascending: true });

      if (error) throw error;
      this.#games.set(data || []);
    } catch (err) {
      console.error('Error loading games:', err);
    } finally {
      this.#loading.set(false);
    }
  }

  async loadAccounts(gameId?: string): Promise<void> {
    this.#loading.set(true);
    try {
      let query = this.supabaseService.client
        .from('accounts')
        .select(`
          *,
          game:games(name, slug)
        `)
        .order('created_at', { ascending: false });

      if (gameId) {
        query = query.eq('game_id', gameId);
      }

      const { data, error } = await query;
      if (error) throw error;
      this.#accounts.set((data as any) || []);
    } catch (err) {
      console.error('Error loading accounts:', err);
    } finally {
      this.#loading.set(false);
    }
  }

  async loadAccountDetails(id: string): Promise<void> {
    this.#loading.set(true);
    try {
      const { data, error } = await this.supabaseService.client
        .from('accounts')
        .select(`
          *,
          game:games(name, slug)
        `)
        .eq('id', id)
        .single();

      if (error) throw error;
      this.#selectedAccount.set(data as any);
    } catch (err) {
      console.error('Error loading account details:', err);
      this.#selectedAccount.set(null);
    } finally {
      this.#loading.set(false);
    }
  }

  async getAccountCredentials(accountId: string): Promise<AccountCredentials | null> {
    try {
      const { data, error } = await this.supabaseService.client
        .from('account_credentials')
        .select('*')
        .eq('account_id', accountId)
        .single();

      if (error) {
        // If RLS prevents reading, Supabase might return an empty dataset or error.
        console.warn('Could not retrieve credentials. Ensure you have purchased this account.', error.message);
        return null;
      }
      return data;
    } catch (err) {
      console.error('Error fetching account credentials:', err);
      return null;
    }
  }
}
