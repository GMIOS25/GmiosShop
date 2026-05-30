# Tasks - Shop bán Account Game

- `[]` Phase 1: Database Setup & RLS
  - `[x]` **Task 1**: Thiết kế file SQL khởi tạo `supabase/migrations/20260522000000_init_schema.sql` gồm các bảng `games`, `accounts`, và `orders`.
  - `[x]` **Task 2**: Cấu hình Row Level Security (RLS) cho các bảng.
- `[x]` Phase 2: SePay & Resend Edge Functions
  - `[x]` **Task 3**: Cấu hình các biến môi trường cho Supabase Edge Functions (SePay + Resend).
  - `[x]` **Task 4**: [DELETE] Không cần Edge Function tạo link thanh toán (QR sinh trực tiếp ở Client-side).
  - `[x]` **Task 5**: Triển khai Edge Function `sepay-webhook` nhận kết quả giao dịch từ SePay và gửi Email qua Resend.
- `[/]` Phase 3: Angular Infrastructure
  - `[x]` **Task 6**: Cài đặt Supabase JS SDK, viết `SupabaseService`, `AccountService` và `OrderService` sử dụng Signals.
  - `[ ]` **Task 6.5**: Triển khai component `AuthComponent` (Đăng ký / Đăng nhập).
- `[ ]` Phase 4: UI/UX & Realtime Integration
  - `[ ]` **Task 7**: Triển khai các component: `HomeComponent`, `AccountListComponent`, `AccountDetailComponent`.
  - `[ ]` **Task 8**: Triển khai `CheckoutModalComponent` hiển thị thông tin chuyển khoản VietQR và lắng nghe sự thay đổi trạng thái đơn hàng theo thời gian thực (Supabase Realtime).
- `[ ]` Phase X: Verification
  - `[ ]` Kiểm tra màu sắc (không dùng màu tím/violet).
  - `[ ]` Chạy script checklist.py.
  - `[ ]` Build dự án production.
-
