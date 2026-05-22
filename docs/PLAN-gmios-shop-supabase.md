# Project Plan: Shop bán Account Game (Angular + Supabase + PayOS + Resend)

Dự án phát triển cửa hàng bán tài khoản game trực tuyến (LOL, FC Online, Liên Quân Mobile...) sử dụng Angular 21 Standalone cho Frontend, Supabase làm Backend-as-a-Service (BaaS), tích hợp cổng thanh toán tự động PayOS và hệ thống gửi email tự động qua Resend. Quản lý trạng thái ứng dụng sử dụng Angular Signals.

## 📋 Project Type
- **Project Type**: WEB (Angular Standalone, Supabase BaaS)
- **Primary Agent**: `frontend-specialist` (for UI/UX and client components), `backend-specialist` (for Supabase Edge Function & DB schema)

---

## 🎯 Success Criteria
- [ ] Khách hàng xem được danh sách tài khoản theo từng game.
- [ ] Bộ lọc hoạt động tốt: lọc theo tựa game, khoảng giá, sắp xếp giá cao-thấp.
- [ ] **Ràng buộc đăng nhập**: Khách hàng bắt buộc phải đăng ký/đăng nhập tài khoản trước mới có thể mua hàng.
- [ ] Khi click mua và đã đăng nhập, gọi Supabase Edge Function tạo link thanh toán PayOS thành công.
- [ ] Tích hợp thanh toán PayOS thông qua popup/mở tab checkout của PayOS.
- [ ] Supabase Edge Function nhận webhook từ PayOS, xác thực chữ ký bảo mật (checksum) và cập nhật trạng thái đơn hàng + tài khoản tự động.
- [ ] **Gửi Email tự động (Resend)**: Sau khi thanh toán thành công, hệ thống tự động gửi thông tin đăng nhập tài khoản game (username, password) về email của khách hàng.
- [ ] Khách hàng nhận được tài khoản ngay trên màn hình Checkout qua Supabase Realtime khi giao dịch hoàn tất.

---

## 🛠️ Tech Stack
- **Frontend**: Angular 21, Angular Signals, RxJS (để polling/realtime), Vanilla CSS/SCSS (Dark Mode).
- **Backend**: Supabase Database, Supabase Realtime, Supabase Edge Functions (Deno/TypeScript).
- **Authentication**: Supabase Auth (Email & Password login/register).
- **Payment**: PayOS API & Webhook (sử dụng thư viện HmacSHA256 để xác thực signature).
- **Email Service**: Resend API (Gửi email giao dịch tự động từ backend Edge Function).

---

## 📂 Proposed File Structure
```plaintext
supabase/
├── migrations/
│   └── 20260522000000_init_schema.sql  # Database tables & RLS (includes auth.users relationship)
└── functions/
    ├── payos-create-link/
    │   └── index.ts                     # API tạo link thanh toán PayOS
    └── payos-webhook/
        └── index.ts                     # Webhook nhận callback từ PayOS & gửi email qua Resend
src/
└── app/
    ├── core/
    │   ├── services/
    │   │   ├── supabase.service.ts
    │   │   ├── auth.service.ts          # Quản lý Auth State & Sign In / Sign Up
    │   │   ├── account.service.ts
    │   │   └── order.service.ts
    │   └── models/
    │       ├── game.model.ts
    │       ├── account.model.ts
    │       └── order.model.ts
    ├── features/
    │   ├── home/
    │   │   └── home.component.ts
    │   ├── auth/
    │   │   └── auth.component.ts        # Giao diện đăng nhập / đăng ký
    │   ├── accounts/
    │   │   ├── account-list.component.ts
    │   │   └── account-detail.component.ts
    │   └── checkout/
    │       └── checkout-modal.component.ts
    ├── layouts/
    │   ├── header/
    │   └── footer/
    ├── app.routes.ts
    └── app.config.ts
```

---

## 📝 Task Breakdown

### Phase 1: Database Setup & RLS (P0 - Foundation)
- [x] **Task 1**: Thiết kế file SQL khởi tạo `supabase/migrations/20260522000000_init_schema.sql` gồm các bảng `games`, `accounts` (có thông tin nhạy cảm), và `orders` liên kết với `auth.users(id)`.
  - **Agent**: `database-architect`
  - **Input**: Schema thiết kế
  - **Output**: File SQL khởi tạo
  - **Verify**: Chạy SQL file thành công trong SQL Editor của Supabase.
- [ ] **Task 2**: Cấu hình Row Level Security (RLS) cho các bảng.
  - **Agent**: `security-auditor`
  - **Input**: Bảng database đã khởi tạo
  - **Output**: RLS Policies cho phép:
    - Bất kỳ ai cũng đọc được danh mục game và danh sách tài khoản `available`.
    - Ẩn trường `username`, `password` của tài khoản đối với tất cả mọi người, ngoại trừ người dùng đã đăng nhập và đã thanh toán thành công đơn hàng chứa tài khoản đó.
    - Người dùng chỉ có thể xem các đơn hàng (`orders`) do chính mình thực hiện.
  - **Verify**: Kiểm tra thử bảo mật bằng truy vấn ẩn danh và truy vấn có đăng nhập.

### Phase 2: PayOS & Resend Edge Functions (P1 - Core Backend)
- [ ] **Task 3**: Cấu hình các biến môi trường cho Supabase Edge Functions (`PAYOS_CLIENT_ID`, `PAYOS_API_KEY`, `PAYOS_CHECKSUM_KEY`, `RESEND_API_KEY`).
  - **Agent**: `devops-engineer`
  - **Input**: Thông tin API Key từ dashboard PayOS và Resend.
  - **Output**: Các biến môi trường được cấu hình trên Supabase CLI/Dashboard
  - **Verify**: Chạy thử câu lệnh kiểm tra biến môi trường thành công.
- [ ] **Task 4**: Triển khai Edge Function `payos-create-link` để tạo link thanh toán.
  - **Agent**: `backend-specialist`
  - **Input**: PayOS API schema tạo link thanh toán (gồm orderCode, amount, description, cancelUrl, returnUrl, signature).
  - **Output**: File `supabase/functions/payos-create-link/index.ts`
  - **Verify**: Gửi thử request POST từ Postman kèm JWT token đăng nhập và thông tin account cần mua -> Nhận được URL thanh toán từ PayOS.
- [ ] **Task 5**: Triển khai Edge Function `payos-webhook` nhận kết quả giao dịch và tích hợp gửi Email qua Resend.
  - **Agent**: `backend-specialist`
  - **Input**: Cấu trúc webhook payload của PayOS, thuật toán SHA256 đối soát chữ ký, API gửi mail của Resend.
  - **Output**: File `supabase/functions/payos-webhook/index.ts`
  - **Verify**: Giả lập webhook gọi từ PayOS -> Database cập nhật đơn hàng thành `'paid'`, tài khoản thành `'sold'`, đồng thời kích hoạt gửi email chứa thông tin account game (username/password) thành công qua Resend đến khách hàng.

### Phase 3: Angular Infrastructure & Auth (P2 - Core Frontend)
- [ ] **Task 6**: Cài đặt Supabase JS SDK, viết `SupabaseService`, `AuthService`, `AccountService` và `OrderService` sử dụng Signals.
  - **Agent**: `frontend-specialist`
  - **Input**: Supabase API credentials
  - **Output**: `supabase.service.ts`, `auth.service.ts`, `account.service.ts`, `order.service.ts`
  - **Verify**: Angular biên dịch thành công, kết nối Supabase và theo dõi trạng thái Auth state thành công.
- [ ] **Task 6.5**: Triển khai component `AuthComponent` (Đăng ký / Đăng nhập).
  - **Agent**: `frontend-specialist`
  - **Input**: Form input email, password
  - **Output**: Component đăng ký/đăng nhập với UI đẹp mắt, xử lý thông báo lỗi.
  - **Verify**: Đăng ký và đăng nhập được tài khoản vào hệ thống thông qua Supabase Auth.

### Phase 4: UI/UX & Realtime Integration (P2 - UI/UX)
- [ ] **Task 7**: Triển khai các component: `HomeComponent`, `AccountListComponent`, `AccountDetailComponent`.
  - **Agent**: `frontend-specialist`
  - **Input**: Layout mockups, bộ lọc
  - **Output**: Các component Angular Standalone cùng style SCSS tối ưu cho việc hiển thị tài khoản game.
  - **Verify**: Hiển thị danh sách, chạy thử bộ lọc giá và bộ lọc game hoạt động mượt mà.
- [ ] **Task 8**: Triển khai `CheckoutModalComponent` tích hợp thanh toán PayOS và lắng nghe sự thay đổi trạng thái đơn hàng theo thời gian thực (Supabase Realtime).
  - **Agent**: `frontend-specialist`
  - **Input**: URL thanh toán trả về từ PayOS, kết nối Realtime, trạng thái Auth.
  - **Output**: Component Checkout hoàn thiện. Kiểm tra nếu người dùng chưa đăng nhập, bắt buộc hiển thị màn hình Auth trước.
  - **Verify**: Tiến hành thanh toán giả lập -> Webhook nhận được -> UI cập nhật hiển thị thông tin tài khoản tự động mà không cần reload trang.

---

## 🏁 Phase X: Verification
- [ ] No purple/violet color hex codes in CSS (`GEMINI.md` Design guidelines).
- [ ] No standard generic template layouts.
- [ ] Run checklist verification: `python .agent/scripts/checklist.py .`
- [ ] Run full build: `npm run build`
- [ ] Run tests: `ng test`
