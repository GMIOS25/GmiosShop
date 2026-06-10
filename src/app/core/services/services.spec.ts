import { describe, it, expect, beforeEach } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { PLATFORM_ID } from '@angular/core';
import { SupabaseService } from './supabase.service';
import { AuthService } from './auth.service';
import { AccountService } from './account.service';
import { OrderService } from './order.service';

describe('GmiosShop Core Services', () => {
  describe('SupabaseService', () => {
    it('should fall back gracefully on non-browser platform', () => {
      TestBed.configureTestingModule({
        providers: [
          SupabaseService,
          { provide: PLATFORM_ID, useValue: 'server' }
        ]
      });

      const service = TestBed.inject(SupabaseService);
      expect(service).toBeTruthy();
      expect(service.isBrowserEnv).toBe(false);

      // Attempting to access client on server should trigger warn and not throw immediate critical crash on construct,
      // but client access returns a Proxy that handles methods gracefully.
      const client = service.client;
      expect(client).toBeTruthy();
    });

    it('should initialize on browser platform', () => {
      TestBed.configureTestingModule({
        providers: [
          SupabaseService,
          { provide: PLATFORM_ID, useValue: 'browser' }
        ]
      });

      const service = TestBed.inject(SupabaseService);
      expect(service).toBeTruthy();
      expect(service.isBrowserEnv).toBe(true);
      expect(service.client).toBeTruthy();
    });
  });

  describe('AuthService', () => {
    describe('Server Environment', () => {
      beforeEach(() => {
        TestBed.configureTestingModule({
          providers: [
            SupabaseService,
            AuthService,
            { provide: PLATFORM_ID, useValue: 'server' } // Safe server platform for tests
          ]
        });
      });

      it('should be created with null signals', () => {
        const service = TestBed.inject(AuthService);
        expect(service).toBeTruthy();
        expect(service.currentUser()).toBeNull();
        expect(service.userRole()).toBeNull();
        expect(service.isAuthenticated()).toBe(false);
        expect(service.isAdmin()).toBe(false);
      });
    });

    describe('Browser Environment with Roles', () => {
      let mockSupabaseClient: any;
      let mockSupabaseService: any;
      let authStateCallback: ((event: string, session: any) => void) | null = null;

      beforeEach(() => {
        authStateCallback = null;
        mockSupabaseClient = {
          auth: {
            getSession: () => Promise.resolve({ data: { session: null }, error: null }),
            onAuthStateChange: (callback: any) => {
              authStateCallback = callback;
              return { data: { subscription: { unsubscribe: () => {} } } };
            },
            signUp: () => Promise.resolve({ data: {}, error: null }),
            signInWithPassword: () => Promise.resolve({ data: {}, error: null }),
            signOut: () => Promise.resolve({ error: null })
          },
          from: () => ({
            select: () => ({
              eq: () => ({
                maybeSingle: () => Promise.resolve({ data: null, error: null })
              })
            })
          })
        };

        mockSupabaseService = {
          isBrowserEnv: true,
          client: mockSupabaseClient
        };

        TestBed.configureTestingModule({
          providers: [
            AuthService,
            { provide: SupabaseService, useValue: mockSupabaseService }
          ]
        });
      });

      it('should initialize role and update on auth state change', async () => {
        const service = TestBed.inject(AuthService);
        
        // Wait for microtasks to process initAuth
        await new Promise(resolve => setTimeout(resolve, 0));
        
        expect(service.currentUser()).toBeNull();
        expect(service.userRole()).toBeNull();
        expect(service.isAdmin()).toBe(false);

        // Mock role fetch behavior for table query
        let queryRoleResult: any = { data: { role: 'admin' }, error: null };
        mockSupabaseClient.from = () => ({
          select: () => ({
            eq: () => ({
              maybeSingle: () => Promise.resolve(queryRoleResult)
            })
          })
        });

        // Trigger sign in
        const mockUser = { id: 'admin-uuid', email: 'admin@gmios.com' };
        if (authStateCallback) {
          await authStateCallback('SIGNED_IN', { user: mockUser });
          // Wait for setTimeout to execute fetchUserRole
          await new Promise(resolve => setTimeout(resolve, 0));
        }

        expect(service.currentUser()).toEqual(mockUser as any);
        expect(service.isAuthenticated()).toBe(true);
        expect(service.userRole()).toBe('admin');
        expect(service.isAdmin()).toBe(true);

        // Trigger sign out
        if (authStateCallback) {
          await authStateCallback('SIGNED_OUT', null);
        }

        expect(service.currentUser()).toBeNull();
        expect(service.isAuthenticated()).toBe(false);
        expect(service.userRole()).toBeNull();
        expect(service.isAdmin()).toBe(false);
      });

      it('should fallback to customer if role fetch fails', async () => {
        const service = TestBed.inject(AuthService);
        await new Promise(resolve => setTimeout(resolve, 0));

        // Mock error on fetch
        mockSupabaseClient.from = () => ({
          select: () => ({
            eq: () => ({
              maybeSingle: () => Promise.resolve({ data: null, error: new Error('DB Error') })
            })
          })
        });

        const mockUser = { id: 'customer-uuid', email: 'customer@gmios.com' };
        if (authStateCallback) {
          await authStateCallback('SIGNED_IN', { user: mockUser });
          // Wait for setTimeout to execute fetchUserRole
          await new Promise(resolve => setTimeout(resolve, 0));
        }

        expect(service.currentUser()).toEqual(mockUser as any);
        expect(service.userRole()).toBe('customer');
        expect(service.isAdmin()).toBe(false);
      });
    });
  });

  describe('AccountService', () => {
    beforeEach(() => {
      TestBed.configureTestingModule({
        providers: [
          SupabaseService,
          AccountService,
          { provide: PLATFORM_ID, useValue: 'server' }
        ]
      });
    });

    it('should be created and initialized with empty signals', () => {
      const service = TestBed.inject(AccountService);
      expect(service).toBeTruthy();
      expect(service.games()).toEqual([]);
      expect(service.accounts()).toEqual([]);
      expect(service.selectedAccount()).toBeNull();
      expect(service.loading()).toBe(false);
    });
  });

  describe('OrderService', () => {
    beforeEach(() => {
      TestBed.configureTestingModule({
        providers: [
          SupabaseService,
          AuthService,
          OrderService,
          { provide: PLATFORM_ID, useValue: 'server' }
        ]
      });
    });

    it('should be created and initialized with empty signals', () => {
      const service = TestBed.inject(OrderService);
      expect(service).toBeTruthy();
      expect(service.orders()).toEqual([]);
      expect(service.activeOrder()).toBeNull();
      expect(service.loading()).toBe(false);
    });
  });
});
