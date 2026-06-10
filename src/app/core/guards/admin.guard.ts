import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../services/auth.service';
import { toObservable } from '@angular/core/rxjs-interop';
import { filter, map, take } from 'rxjs/operators';

export const adminGuard: CanActivateFn = (route, state) => {
  const authService = inject(AuthService);
  const router = inject(Router);

  // Nếu đã khởi tạo xong, kiểm tra quyền admin ngay lập tức
  if (authService.isInitialized()) {
    if (authService.isAdmin()) {
      return true;
    }
    router.navigate(['/error'], { queryParams: { message: 'Bạn không có quyền truy cập trang này' } });
    return false;
  }

  // Nếu chưa khởi tạo xong, đợi cho đến khi isInitialized chuyển sang true
  return toObservable(authService.isInitialized).pipe(
    filter((initialized) => initialized),
    take(1),
    map(() => {
      if (authService.isAdmin()) {
        return true;
      }
      router.navigate(['/error'], { queryParams: { message: 'Bạn không có quyền truy cập trang này' } });
      return false;
    })
  );
};
