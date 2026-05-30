# Project Plan: Shop bán Account Game (Angular + Supabase + SePay + Resend)

Dự án phát triển cửa hàng bán tài khoản game trực tuyến (LOL, FC Online, Liên Quân Mobile...) sử dụng Angular 21 Standalone cho Frontend, Supabase làm Backend-as-a-Service (BaaS), tích hợp giải pháp tự động hóa ngân hàng qua SePay và hệ thống gửi email tự động qua Resend. Quản lý trạng thái ứng dụng sử dụng Angular Signals.

## 📋 Project Type

- **Project Type**: WEB (Angular Standalone, Supabase BaaS)
- **Primary Agent**: `frontend-specialist` (for UI/UX and client components), `backend-specialist` (for Supabase Edge Function & DB schema)

---

## 🎯 Success Criteria

- [ ] Khách hàng xem được danh sách tài khoản theo từng game.
- [ ] Bộ lọc hoạt động tốt: lọc theo tựa game, khoảng giá, sắp xếp giá cao-thấp.
- [ ] **Ràng buộc đăng nhập**: Khách hàng bắt buộc phải đăng ký/đăng nhập tài khoản trước mới có thể mua hàng.
- [ ] Khi click mua và đã đăng nhập, tạo đơn hàng trong database và hiển thị modal checkout chứa mã QR chuyển khoản VietQR tự động.
- [ ] Tích hợp thanh toán SePay bằng cách hiển thị mã QR VietQR (chứa số tài khoản, số tiền và nội dung chuyển khoản có dạng `GMS[payment_code]`).
- [ ] Supabase Edge Function `sepay-webhook` nhận webhook từ SePay, xác thực API Key từ Authorization header (`Apikey <token>`), khớp nội dung chuyển khoản và cập nhật trạng thái đơn hàng + tài khoản tự động.
- [ ] **Gửi Email tự động (Resend)**: Sau khi thanh toán thành công, hệ thống tự động gửi thông tin đăng nhập tài khoản game (username, password) về email của khách hàng.
- [ ] Khách hàng nhận được tài khoản ngay trên màn hình Checkout qua Supabase Realtime khi giao dịch hoàn tất.

---

## 🛠️ Tech Stack

- **Frontend**: Angular 21, Angular Signals, RxJS (để polling/realtime), Vanilla CSS/SCSS (Dark Mode).
- **Backend**: Supabase Database, Supabase Realtime, Supabase Edge Functions (Deno/TypeScript).
- **Authentication**: Supabase Auth (Email & Password login/register).
- **Payment**: SePay Webhook (tự động hóa ngân hàng, xác thực API Key bằng Authorization header).
- **Email Service**: Resend API (Gửi email giao dịch tự động từ backend Edge Function).

---

## 📂 Proposed File Structure

```plaintext
supabase/
├── migrations/
│   └── 20260522000000_init_schema.sql  # Database tables & RLS (includes auth.users relationship)
└── functions/
    └── sepay-webhook/
        └── index.ts                     # Webhook nhận callback từ SePay, xác thực API Key & cập nhật DB + gửi email qua Resend
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
- [x] **Task 2**: Cấu hình Row Level Security (RLS) cho các bảng.
  - **Agent**: `security-auditor`
  - **Input**: Bảng database đã khởi tạo
  - **Output**: RLS Policies cho phép:
    - Bất kỳ ai cũng đọc được danh mục game và danh sách tài khoản `available`.
    - Ẩn trường `username`, `password` của tài khoản đối với tất cả mọi người, ngoại trừ người dùng đã đăng nhập và đã thanh toán thành công đơn hàng chứa tài khoản đó.
    - Người dùng chỉ có thể xem các đơn hàng (`orders`) do chính mình thực hiện.
  - **Verify**: Kiểm tra thử bảo mật bằng truy vấn ẩn danh và truy vấn có đăng nhập.

### Phase 2: SePay & Resend Edge Functions (P1 - Core Backend)

- [x] **Task 3**: Cấu hình các biến môi trường cho Supabase Edge Functions (`SEPAY_API_KEY`, `RESEND_API_KEY`).
  - **Agent**: `devops-engineer`
  - **Input**: API Key của SePay (làm token đối soát webhook) và API Key của Resend.
  - **Output**: Các biến môi trường được cấu hình trên Supabase CLI/Dashboard.
  - **Verify**: Chạy lệnh kiểm tra cấu hình biến môi trường trên dashboard Supabase thành công.
- [ ] **Task 4**: [DELETE] Không cần Edge Function tạo link thanh toán (QR Code được sinh trực tiếp ở Client-side thông qua VietQR API).
- [ ] **Task 5**: Triển khai Edge Function `sepay-webhook` nhận kết quả giao dịch từ SePay và tích hợp gửi Email qua Resend.
  - **Agent**: `backend-specialist`
  - **Input**: Webhook payload từ SePay (chứa `amount_in`, `transaction_content` khớp với `payment_code`), header `Authorization: Apikey <token>` và API gửi mail của Resend.
  - **Output**: File `supabase/functions/sepay-webhook/index.ts`
  - **Verify**: Giả lập webhook gọi từ SePay kèm header `Authorization: Apikey <SEPAY_API_KEY>` -> Database cập nhật trạng thái đơn hàng thành `'paid'`, tài khoản thành `'sold'`, và kích hoạt gửi email chứa tài khoản game (username/password) qua Resend thành công.

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
- [ ] **Task 8**: Triển khai `CheckoutModalComponent` hiển thị thông tin chuyển khoản VietQR và lắng nghe sự thay đổi trạng thái đơn hàng theo thời gian thực (Supabase Realtime).
  - **Agent**: `frontend-specialist`
  - **Input**: Mã `payment_code` và số tiền từ đơn hàng vừa tạo, kết nối Realtime, trạng thái Auth.
  - **Output**: Component Checkout hoàn thiện hiển thị mã QR VietQR động (`https://img.vietqr.io/image/...`). Lắng nghe trạng thái đơn hàng chuyển sang `paid` qua Realtime.
  - **Verify**: Người dùng tạo đơn hàng -> hiển thị đúng QR với nội dung chuyển khoản tương ứng -> chuyển khoản thành công -> UI tự động cập nhật hiển thị thông tin đăng nhập của tài khoản game vừa mua trên màn hình Checkout mà không cần tải lại trang.

---

## 🏁 Phase X: Verification

- [ ] No purple/violet color hex codes in CSS (`GEMINI.md` Design guidelines).
- [ ] No standard generic template layouts.
- [ ] Run checklist verification: `python .agent/scripts/checklist.py .`
- [ ] Run full build: `npm run build`
- [ ] Run tests: `ng test`
