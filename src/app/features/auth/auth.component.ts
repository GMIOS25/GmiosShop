import { Component, EventEmitter, Input, Output, signal, inject } from '@angular/core';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';

@Component({
  selector: 'app-auth',
  standalone: true,
  imports: [ReactiveFormsModule],
  templateUrl: './auth.component.html',
  styleUrl: './auth.component.scss'
})
export class AuthComponent {
  private readonly fb = inject(FormBuilder);
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);

  @Input() mode: 'page' | 'modal' = 'page';
  @Output() close = new EventEmitter<void>();

  // State signals
  readonly activeTab = signal<'login' | 'register'>('login');
  readonly isLoading = signal<boolean>(false);
  readonly errorMessage = signal<string | null>(null);
  readonly successMessage = signal<string | null>(null);

  // Forms
  readonly loginForm: FormGroup;
  readonly registerForm: FormGroup;

  constructor() {
    this.loginForm = this.fb.group({
      email: ['', [Validators.required, Validators.email]],
      password: ['', [Validators.required, Validators.minLength(6)]]
    });

    this.registerForm = this.fb.group({
      email: ['', [Validators.required, Validators.email]],
      password: ['', [Validators.required, Validators.minLength(6)]],
      confirmPassword: ['', [Validators.required]]
    }, {
      validators: this.passwordMatchValidator
    });
  }

  // Custom password match validator
  private passwordMatchValidator(group: FormGroup): { [key: string]: boolean } | null {
    const password = group.get('password')?.value;
    const confirmPassword = group.get('confirmPassword')?.value;
    return password === confirmPassword ? null : { passwordMismatch: true };
  }

  // Toggle between tabs
  switchTab(tab: 'login' | 'register'): void {
    this.activeTab.set(tab);
    this.errorMessage.set(null);
    this.successMessage.set(null);
    this.loginForm.reset();
    this.registerForm.reset();
  }

  // Handle Login submission
  async onLogin(): Promise<void> {
    if (this.loginForm.invalid) {
      this.loginForm.markAllAsTouched();
      return;
    }

    this.isLoading.set(true);
    this.errorMessage.set(null);
    this.successMessage.set(null);

    const { email, password } = this.loginForm.value;

    try {
      await this.authService.signIn(email, password);
      this.successMessage.set('Đăng nhập thành công!');
      
      // Delay slightly for visual feedback before redirect/closing
      setTimeout(() => {
        this.isLoading.set(false);
        if (this.mode === 'page') {
          this.router.navigate(['/']);
        } else {
          this.close.emit();
        }
      }, 800);
    } catch (error: any) {
      this.isLoading.set(false);
      this.errorMessage.set(error.message || 'Có lỗi xảy ra khi đăng nhập. Vui lòng kiểm tra lại thông tin.');
    }
  }

  // Handle Registration submission
  async onRegister(): Promise<void> {
    if (this.registerForm.invalid) {
      this.registerForm.markAllAsTouched();
      return;
    }

    this.isLoading.set(true);
    this.errorMessage.set(null);
    this.successMessage.set(null);

    const { email, password } = this.registerForm.value;

    try {
      await this.authService.signUp(email, password);
      this.successMessage.set('Đăng ký thành công! Vui lòng kiểm tra email của bạn để xác thực tài khoản (nếu cần) hoặc đăng nhập.');
      this.isLoading.set(false);
      
      // Auto-switch to login tab after brief pause
      setTimeout(() => {
        this.switchTab('login');
      }, 2500);
    } catch (error: any) {
      this.isLoading.set(false);
      this.errorMessage.set(error.message || 'Đăng ký thất bại. Email có thể đã tồn tại hoặc mật khẩu không hợp lệ.');
    }
  }

  // Handle Close (Modal mode only)
  onCloseModal(): void {
    if (this.mode === 'modal') {
      this.close.emit();
    }
  }

  // Helper validation getters
  isFieldInvalid(form: FormGroup, field: string): boolean {
    const control = form.get(field);
    return !!(control && control.invalid && (control.dirty || control.touched));
  }
}
