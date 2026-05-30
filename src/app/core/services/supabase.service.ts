import { Inject, Injectable, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { environment } from '../../../environments/environment';

@Injectable({
  providedIn: 'root'
})
export class SupabaseService {
  private supabaseClient!: SupabaseClient;
  private readonly isBrowser: boolean;

  constructor(@Inject(PLATFORM_ID) private platformId: Object) {
    this.isBrowser = isPlatformBrowser(this.platformId);
    if (this.isBrowser) {
      this.supabaseClient = createClient(environment.supabaseUrl, environment.supabaseKey, {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: true
        }
      });
    }
  }

  get client(): SupabaseClient {
    if (!this.isBrowser) {
      return new Proxy({} as SupabaseClient, {
        get: (_, prop) => {
          return () => {
            console.warn(`Attempted to call Supabase client.${String(prop)} on server-side SSR. Guard this call using isPlatformBrowser.`);
            return Promise.resolve({ data: null, error: new Error('Cannot access Supabase client on SSR server.') });
          };
        }
      });
    }
    return this.supabaseClient;
  }

  get isBrowserEnv(): boolean {
    return this.isBrowser;
  }
}
