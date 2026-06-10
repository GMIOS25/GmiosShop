import { describe, it, expect, beforeEach, vi } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { signal } from '@angular/core';
import { adminGuard } from './admin.guard';
import { AuthService } from '../services/auth.service';
import { firstValueFrom } from 'rxjs';

describe('AdminGuard', () => {
  let mockAuthService: any;
  let mockRouter: any;

  beforeEach(() => {
    mockAuthService = {
      isInitialized: signal(true),
      isAdmin: signal(false),
    };

    mockRouter = {
      navigate: vi.fn(),
    };

    TestBed.configureTestingModule({
      providers: [
        { provide: AuthService, useValue: mockAuthService },
        { provide: Router, useValue: mockRouter },
      ],
    });
  });

  it('should allow access if user is admin', () => {
    mockAuthService.isInitialized.set(true);
    mockAuthService.isAdmin.set(true);

    const result = TestBed.runInInjectionContext(() => adminGuard(null as any, null as any));

    expect(result).toBe(true);
    expect(mockRouter.navigate).not.toHaveBeenCalled();
  });

  it('should redirect to /error and deny access if user is not admin', () => {
    mockAuthService.isInitialized.set(true);
    mockAuthService.isAdmin.set(false);

    const result = TestBed.runInInjectionContext(() => adminGuard(null as any, null as any));

    expect(result).toBe(false);
    expect(mockRouter.navigate).toHaveBeenCalledWith(['/error'], {
      queryParams: { message: 'Bạn không có quyền truy cập trang này' },
    });
  });

  it('should wait for initialization if not initialized yet', async () => {
    const isInitialized = signal(false);
    mockAuthService.isInitialized = isInitialized;
    mockAuthService.isAdmin.set(true);

    const result$ = TestBed.runInInjectionContext(() => adminGuard(null as any, null as any));

    // Result should be an observable
    expect(result$).not.toBe(true);
    expect(result$).not.toBe(false);

    // Resolve the observable
    const resultPromise = firstValueFrom(result$ as any);

    // Change state to initialized
    isInitialized.set(true);

    const result = await resultPromise;
    expect(result).toBe(true);
    expect(mockRouter.navigate).not.toHaveBeenCalled();
  });

  it('should wait for initialization and redirect to /error if not admin', async () => {
    const isInitialized = signal(false);
    mockAuthService.isInitialized = isInitialized;
    mockAuthService.isAdmin.set(false);

    const result$ = TestBed.runInInjectionContext(() => adminGuard(null as any, null as any));

    // Result should be an observable
    expect(result$).not.toBe(true);
    expect(result$).not.toBe(false);

    // Resolve the observable
    const resultPromise = firstValueFrom(result$ as any);

    // Change state to initialized
    isInitialized.set(true);

    const result = await resultPromise;
    expect(result).toBe(false);
    expect(mockRouter.navigate).toHaveBeenCalledWith(['/error'], {
      queryParams: { message: 'Bạn không có quyền truy cập trang này' },
    });
  });
});
