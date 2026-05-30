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
    beforeEach(() => {
      TestBed.configureTestingModule({
        providers: [
          SupabaseService,
          AuthService,
          { provide: PLATFORM_ID, useValue: 'server' } // Safe server platform for tests
        ]
      });
    });

    it('should be created', () => {
      const service = TestBed.inject(AuthService);
      expect(service).toBeTruthy();
      expect(service.currentUser()).toBeNull();
      expect(service.isAuthenticated()).toBe(false);
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
