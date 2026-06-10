import { Component, inject } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { map } from 'rxjs/operators';

@Component({
  selector: 'app-error',
  standalone: true,
  imports: [RouterLink],
  templateUrl: './error.component.html',
  styleUrl: './error.component.scss'
})
export class ErrorComponent {
  private readonly route = inject(ActivatedRoute);

  // Lấy câu thông báo lỗi từ query parameters, mặc định là lỗi không xác định
  readonly message = toSignal(
    this.route.queryParams.pipe(
      map((params) => params['message'] || 'Đã xảy ra lỗi không xác định.')
    ),
    { initialValue: 'Đã xảy ra lỗi không xác định.' }
  );
}
