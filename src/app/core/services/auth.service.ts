import { Injectable, signal, computed } from '@angular/core';
import { User } from '@supabase/supabase-js';
import { SupabaseService } from './supabase.service';

@Injectable({
  providedIn: 'root'
})
export class AuthService {
  // Private writable signals
  readonly #currentUser = signal<User | null>(null);
  readonly #userRole = signal<string | null>(null);
  readonly #isInitialized = signal<boolean>(false);

  // Public read-only signals
  readonly currentUser = this.#currentUser.asReadonly();
  readonly userRole = this.#userRole.asReadonly();
  readonly isInitialized = this.#isInitialized.asReadonly();
  readonly isAuthenticated = computed(() => !!this.currentUser());
  readonly isAdmin = computed(() => this.userRole() === 'admin');

  constructor(private supabaseService: SupabaseService) {
    if (this.supabaseService.isBrowserEnv) {
      this.initAuth();
    } else {
      this.#isInitialized.set(true);
    }
  }

  private async initAuth(): Promise<void> {
    try {
      const { data: { session } } = await this.supabaseService.client.auth.getSession();
      const user = session?.user ?? null;
      this.#currentUser.set(user);
      if (user) {
        await this.fetchUserRole(user.id);
      } else {
        this.#userRole.set(null);
      }
    } catch (err) {
      console.error('Error fetching initial auth session:', err);
      this.#userRole.set(null);
    } finally {
      this.#isInitialized.set(true);
    }

    this.supabaseService.client.auth.onAuthStateChange(async (_event, session) => {
      const user = session?.user ?? null;
      this.#currentUser.set(user);
      if (user) {
        await this.fetchUserRole(user.id);
      } else {
        this.#userRole.set(null);
      }
    });
  }

  private async fetchUserRole(userId: string): Promise<void> {
    try {
      const { data, error } = await this.supabaseService.client
        .from('user_roles')
        .select('role')
        .eq('id', userId)
        .maybeSingle();

      if (error) {
        console.error('Error fetching user role:', error);
        this.#userRole.set('customer');
      } else if (data) {
        this.#userRole.set(data.role);
      } else {
        this.#userRole.set('customer');
      }
    } catch (err) {
      console.error('Failed to fetch user role:', err);
      this.#userRole.set('customer');
    }
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
    this.#userRole.set(null);
  }
}
