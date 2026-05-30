import { Injectable, signal, computed } from '@angular/core';
import { User } from '@supabase/supabase-js';
import { SupabaseService } from './supabase.service';

@Injectable({
  providedIn: 'root'
})
export class AuthService {
  // Private writable signal
  readonly #currentUser = signal<User | null>(null);

  // Public read-only signals
  readonly currentUser = this.#currentUser.asReadonly();
  readonly isAuthenticated = computed(() => !!this.currentUser());

  constructor(private supabaseService: SupabaseService) {
    if (this.supabaseService.isBrowserEnv) {
      this.initAuth();
    }
  }

  private async initAuth(): Promise<void> {
    try {
      const { data: { session } } = await this.supabaseService.client.auth.getSession();
      this.#currentUser.set(session?.user ?? null);
    } catch (err) {
      console.error('Error fetching initial auth session:', err);
    }

    this.supabaseService.client.auth.onAuthStateChange((_event, session) => {
      this.#currentUser.set(session?.user ?? null);
    });
  }

  async signUp(email: string, password: string) {
    const { data, error } = await this.supabaseService.client.auth.signUp({
      email,
      password
    });
    if (error) throw error;
    return data;
  }

  async signIn(email: string, password: string) {
    const { data, error } = await this.supabaseService.client.auth.signInWithPassword({
      email,
      password
    });
    if (error) throw error;
    return data;
  }

  async signOut() {
    const { error } = await this.supabaseService.client.auth.signOut();
    if (error) throw error;
    this.#currentUser.set(null);
  }
}
