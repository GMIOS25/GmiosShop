# Project Plan: Shop bán Account Game (Angular + Supabase + SePay + Resend)

Dự án phát triển cửa hàng bán tài khoản game trực tuyến (LOL, FC Online, Liên Quân Mobile...) sử dụng Angular 21 Standalone cho Frontend, Supabase làm Backend-as-a-Service (BaaS), tích hợp giải pháp tự động hóa ngân hàng qua SePay và hệ thống gửi email tự động qua Resend. Quản lý trạng thái ứng dụng sử dụng Angular Signals.

## 📋 Project Type

- **Project Type**: WEB (Angular Standalone, Supabase BaaS)
- **Primary Agent**: `frontend-specialist` (for UI/UX and client components), `backend-specialist` (for Supabase Edge Function & DB schema)

---

## 🎯 Success Criteria

- [x] Khách hàng xem được danh sách tài khoản theo từng game.
- [x] Bộ lọc hoạt động tốt: lọc theo tựa game, khoảng giá, sắp xếp giá cao-thấp.
- [x] **Ràng buộc đăng nhập**: Khách hàng bắt buộc phải đăng ký/đăng nhập tài khoản trước mới có thể mua hàng.
- [x] Khi click mua và đã đăng nhập, tạo đơn hàng trong database và hiển thị modal checkout chứa mã QR chuyển khoản VietQR tự động.
- [x] Tích hợp thanh toán SePay bằng cách hiển thị mã QR VietQR (chứa số tài khoản, số tiền và nội dung chuyển khoản có dạng `GMS[payment_code]`).
- [x] Supabase Edge Function `sepay-webhook` nhận webhook từ SePay, xác thực API Key từ Authorization header (`Apikey <token>`), khớp nội dung chuyển khoản và cập nhật trạng thái đơn hàng + tài khoản tự động.
- [x] **Gửi Email tự động (Resend)**: Sau khi thanh toán thành công, hệ thống tự động gửi thông tin đăng nhập tài khoản game (username, password) về email của khách hàng.
- [x] Khách hàng nhận được tài khoản ngay trên màn hình Checkout qua Supabase Realtime khi giao dịch hoàn tất.
- [ ] **Admin Dashboard (New)**: Giao diện thống kê trực quan hiển thị tổng doanh thu từ đơn hàng đã thanh toán, số lượng tài khoản bán/còn lại, và danh sách đơn hàng gần đây.
- [ ] **Admin Account Management (New)**: Cho phép admin tạo thêm/xóa tài khoản game (kèm theo thông tin đăng nhập game nhạy cảm) trực tiếp từ giao diện admin để tránh việc thêm thủ công trên database Supabase.

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
│   ├── 20260522000000_init_schema.sql  # Database tables & RLS (includes auth.users relationship)
│   ├── 20260524000000_rls_and_credentials.sql
│   ├── 20260531000000_order_triggers_and_update_policy.sql
│   └── 20260608000000_admin_roles_and_policies.sql # [NEW] Bảng roles, helpers và cập nhật RLS
└── functions/
    ├── sepay-webhook/
    │   └── index.ts                     # Webhook nhận callback từ SePay, xác thực API Key & cập nhật DB + gửi email qua Resend
    └── cloudinary-upload/
        └── index.ts                     # Nhận file ảnh từ client, sinh chữ ký số và upload có bảo mật lên Cloudinary, trả về URL
src/
└── app/
    ├── core/
    │   ├── guards/
    │   │   └── admin.guard.ts           # [NEW] Guard bảo vệ route admin
    │   ├── services/
    │   │   ├── supabase.service.ts
    │   │   ├── auth.service.ts          # Quản lý Auth State, Sign In / Sign Up & Roles
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
    │   └── admin/
    │       └── admin.component.ts       # [NEW] Dashboard admin & form quản lý tài khoản/game
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
- [x] **Task 4**: [DELETE] Không cần Edge Function tạo link thanh toán (QR Code được sinh trực tiếp ở Client-side thông qua VietQR API).
- [x] **Task 5**: Triển khai Edge Function `sepay-webhook` nhận kết quả giao dịch từ SePay và tích hợp gửi Email qua Resend.
  - **Agent**: `backend-specialist`
  - **Input**: Webhook payload từ SePay (chứa `amount_in`, `transaction_content` khớp với `payment_code`), header `Authorization: Apikey <token>` và API gửi mail của Resend.
  - **Output**: File `supabase/functions/sepay-webhook/index.ts`
  - **Verify**: Giả lập webhook gọi từ SePay kèm header `Authorization: Apikey <SEPAY_API_KEY>` -> Database cập nhật trạng thái đơn hàng thành `'paid'`, tài khoản thành `'sold'`, và kích hoạt gửi email chứa tài khoản game (username/password) qua Resend thành công.
- [ ] **Task 5.5**: Triển khai Edge Function `cloudinary-upload` nhận file ảnh từ frontend và upload bảo mật lên Cloudinary.
  - **Agent**: `backend-specialist`
  - **Input**: Request body chứa file ảnh (multipart/form-data), sử dụng Deno Crypto sinh signature từ `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET` và `CLOUDINARY_CLOUD_NAME`.
  - **Output**: File `supabase/functions/cloudinary-upload/index.ts` thực hiện POST đến API Cloudinary và trả về JSON chứa URL của ảnh đã upload.
  - **Verify**: Sử dụng cURL/Postman upload một ảnh thực tế lên Edge Function -> Nhận lại URL ảnh hợp lệ.

### Phase 3: Angular Infrastructure & Auth (P2 - Core Frontend)

- [x] **Task 6**: Cài đặt Supabase JS SDK, viết `SupabaseService`, `AuthService`, `AccountService` và `OrderService` sử dụng Signals.
  - **Agent**: `frontend-specialist`
  - **Input**: Supabase API credentials
  - **Output**: `supabase.service.ts`, `auth.service.ts`, `account.service.ts`, `order.service.ts`
  - **Verify**: Angular biên dịch thành công, kết nối Supabase và theo dõi trạng thái Auth state thành công.
- [x] **Task 6.5**: Triển khai component `AuthComponent` (Đăng ký / Đăng nhập).
  - **Agent**: `frontend-specialist`
  - **Input**: Form input email, password
  - **Output**: Component đăng ký/đăng nhập với UI đẹp mắt, xử lý thông báo lỗi.
  - **Verify**: Đăng ký và đăng nhập được tài khoản vào hệ thống thông qua Supabase Auth.

### Phase 4: UI/UX & Realtime Integration (P2 - UI/UX)

- [x] **Task 7**: Triển khai các component: `HomeComponent`, `AccountListComponent`, `AccountDetailComponent`.
  - **Agent**: `frontend-specialist`
  - **Input**: Layout mockups, bộ lọc
  - **Output**: Các component Angular Standalone cùng style SCSS tối ưu cho việc hiển thị tài khoản game.
  - **Verify**: Hiển thị danh sách, chạy thử bộ lọc giá và bộ lọc game hoạt động mượt mà.
- [x] **Task 8**: Triển khai `CheckoutModalComponent` hiển thị thông tin chuyển khoản VietQR và lắng nghe sự thay đổi trạng thái đơn hàng theo thời gian thực (Supabase Realtime).
  - **Agent**: `frontend-specialist`
  - **Input**: Mã `payment_code` và số tiền từ đơn hàng vừa tạo, kết nối Realtime, trạng thái Auth.
  - **Output**: Component Checkout hoàn thiện hiển thị mã QR VietQR động (`https://img.vietqr.io/image/...`). Lắng nghe trạng thái đơn hàng chuyển sang `paid` qua Realtime.
  - **Verify**: Người dùng tạo đơn hàng -> hiển thị đúng QR với nội dung chuyển khoản tương ứng -> chuyển khoản thành công -> UI tự động cập nhật hiển thị thông tin đăng nhập của tài khoản game vừa mua trên màn hình Checkout mà không cần tải lại trang.

### Phase 5: Admin Panel & Security (P1.5 - Admin Features)

- [x] **Task 9**: Thiết kế file SQL `supabase/migrations/20260608000000_admin_roles_and_policies.sql` cấu hình bảng `user_roles` (mặc định role `'customer'`), trigger `on_auth_user_created` và RLS policies để tự chạy thủ công trên Supabase Cloud.
  - **Agent**: `database-architect`, `security-auditor`
  - **Input**: Yêu cầu phân quyền admin và thông tin đăng nhập
  - **Output**: File migration SQL mới cấu hình bảng roles, function helper và các policy tương ứng.
  - **Verify**: File SQL được tạo thành công và sẵn sàng để chạy trên SQL Editor của Supabase.
- [ ] **Task 10**: Cập nhật `AuthService` để lấy quyền người dùng (`role`) từ database và lưu dưới dạng Signals.
  - **Agent**: `frontend-specialist`
  - **Input**: API gọi đến bảng `user_roles`
  - **Output**: `AuthService` với signal `currentUserRole` và computed check `isAdmin()`.
  - **Verify**: Người dùng có role là `'admin'` trong database sẽ nhận role là `'admin'` trên frontend, người dùng khác mặc định là `'customer'`.
- [ ] **Task 11**: Triển khai `AdminGuard` để chặn truy cập trái phép vào route `/admin`.
  - **Agent**: `frontend-specialist`
  - **Input**: `AuthService` check `isAdmin()`
  - **Output**: File `src/app/core/guards/admin.guard.ts` bảo vệ route `/admin`.
  - **Verify**: Thử dùng tài khoản thường truy cập `/admin` sẽ bị chuyển hướng về `/`. Dùng tài khoản admin truy cập thành công.
- [ ] **Task 12**: Triển khai `AdminComponent` gồm: dashboard thống kê (Doanh thu, tài khoản, đơn hàng), form quản lý game, form thêm tài khoản game (với credentials, nút chọn file và tự động upload lên Cloudinary qua Edge Function), và quản lý xóa tài khoản.
  - **Agent**: `frontend-specialist`
  - **Input**: Layout mockups, dashboard stats, game lists, forms, nút chọn file hình ảnh.
  - **Output**: Standalone component `AdminComponent` với giao diện cao cấp, biểu đồ/thẻ chỉ số đơn giản, form thêm tài khoản game tích hợp nút chọn file và tự động upload qua Edge Function `cloudinary-upload` để hiển thị preview và lưu URL ảnh.
  - **Verify**: Chọn file ảnh -> Xác nhận ảnh được upload thành công và hiển thị preview trong form -> Bấm tạo tài khoản -> Tài khoản mới được lưu đúng các URL ảnh vừa upload. Thao tác xóa hoạt động chuẩn.
- [ ] **Task 13**: Tích hợp liên kết "Quản Trị" trên header ứng dụng cho tài khoản admin và cấu hình route.
  - **Agent**: `frontend-specialist`
  - **Input**: `app.html`, `app.routes.ts`, `AuthService`
  - **Output**: Thay đổi trong `app.routes.ts` để khai báo route `/admin` (được bảo vệ bằng `adminGuard`), và hiển thị menu dẫn tới `/admin` trên Header khi đăng nhập bằng tài khoản admin.
  - **Verify**: Đăng nhập admin hiển thị nút "Quản trị" trên header, bấm vào dẫn tới đúng giao diện Admin Panel.

---

## 🏁 Phase X: Verification

- [ ] No purple/violet color hex codes in CSS (`GEMINI.md` Design guidelines).
- [ ] No standard generic template layouts.
- [ ] Run checklist verification: `python .agent/scripts/checklist.py .`
- [ ] Run full build: `npm run build`
- [ ] Run tests: `ng test`
- [ ] Verify Admin route protection and functional account creation workflow.
