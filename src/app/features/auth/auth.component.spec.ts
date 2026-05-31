import { describe, it, expect, beforeEach, vi } from 'vitest';
import { TestBed, ComponentFixture } from '@angular/core/testing';
import { ReactiveFormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { signal, computed } from '@angular/core';
import { AuthComponent } from './auth.component';
import { AuthService } from '../../core/services/auth.service';

describe('AuthComponent', () => {
  let component: AuthComponent;
  let fixture: ComponentFixture<AuthComponent>;
  
  // Mock AuthService
  const mockCurrentUser = signal<any>(null);
  const mockAuthService = {
    currentUser: mockCurrentUser.asReadonly(),
    isAuthenticated: computed(() => !!mockCurrentUser()),
    signIn: vi.fn().mockImplementation(() => Promise.resolve({ user: { email: 'test@example.com' } })),
    signUp: vi.fn().mockImplementation(() => Promise.resolve({ user: { email: 'test@example.com' } })),
    signOut: vi.fn().mockImplementation(() => Promise.resolve())
  };

  // Mock Router
  const mockRouter = {
    navigate: vi.fn()
  };

  beforeEach(async () => {
    vi.clearAllMocks();
    mockCurrentUser.set(null);

    await TestBed.configureTestingModule({
      imports: [ReactiveFormsModule, AuthComponent],
      providers: [
        { provide: AuthService, useValue: mockAuthService },
        { provide: Router, useValue: mockRouter }
      ]
    }).compileComponents();

    fixture = TestBed.createComponent(AuthComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create the AuthComponent', () => {
    expect(component).toBeTruthy();
  });

  it('should start with login tab active', () => {
    expect(component.activeTab()).toBe('login');
  });

  it('should switch tabs and reset form states', () => {
    component.loginForm.get('email')?.setValue('test@example.com');
    component.switchTab('register');
    expect(component.activeTab()).toBe('register');
    expect(component.registerForm.get('email')?.value).toBeNull();
  });

  it('should validate form and show error for invalid inputs during login', async () => {
    component.loginForm.get('email')?.setValue('invalid-email');
    component.loginForm.get('password')?.setValue('123'); // shorter than 6 chars
    
    await component.onLogin();
    
    expect(mockAuthService.signIn).not.toHaveBeenCalled();
    expect(component.isFieldInvalid(component.loginForm, 'email')).toBe(true);
    expect(component.isFieldInvalid(component.loginForm, 'password')).toBe(true);
  });

  it('should call AuthService.signIn and navigate on successful login', async () => {
    component.loginForm.get('email')?.setValue('user@example.com');
    component.loginForm.get('password')?.setValue('validpassword');
    
    // Trigger login
    await component.onLogin();

    expect(mockAuthService.signIn).toHaveBeenCalledWith('user@example.com', 'validpassword');
    expect(component.successMessage()).toBe('Đăng nhập thành công!');
    
    // Fast forward timeouts
    await new Promise((resolve) => setTimeout(resolve, 850));
    expect(mockRouter.navigate).toHaveBeenCalledWith(['/']);
  });

  it('should handle login error gracefully', async () => {
    mockAuthService.signIn.mockRejectedValueOnce(new Error('Sai thông tin tài khoản'));
    component.loginForm.get('email')?.setValue('user@example.com');
    component.loginForm.get('password')?.setValue('wrongpassword');

    await component.onLogin();

    expect(mockAuthService.signIn).toHaveBeenCalled();
    expect(component.errorMessage()).toBe('Sai thông tin tài khoản');
    expect(component.isLoading()).toBe(false);
  });

  it('should validate password mismatch in register form', () => {
    component.switchTab('register');
    component.registerForm.get('email')?.setValue('register@example.com');
    component.registerForm.get('password')?.setValue('password123');
    component.registerForm.get('confirmPassword')?.setValue('password456');

    expect(component.registerForm.invalid).toBe(true);
    expect(component.registerForm.hasError('passwordMismatch')).toBe(true);
  });

  it('should call AuthService.signUp on valid registration', async () => {
    component.switchTab('register');
    component.registerForm.get('email')?.setValue('register@example.com');
    component.registerForm.get('password')?.setValue('password123');
    component.registerForm.get('confirmPassword')?.setValue('password123');

    await component.onRegister();

    expect(mockAuthService.signUp).toHaveBeenCalledWith('register@example.com', 'password123');
    expect(component.successMessage()).toContain('Đăng ký thành công!');
  });
});
