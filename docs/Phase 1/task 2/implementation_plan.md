# Kế hoạch Triển khai: Row Level Security (RLS) & Tách Bảng Credentials

Kế hoạch này thực hiện cấu hình Row Level Security (RLS) cho cơ sở dữ liệu Supabase của GmiosShop (Task 2), bao gồm việc tách các cột thông tin đăng nhập nhạy cảm (`username`, `password`) từ bảng `accounts` sang bảng mới `account_credentials` để tối ưu hóa bảo mật, đồng thời thiết lập các chính sách truy cập chi tiết cho tất cả các bảng.

## User Review Required

> [!IMPORTANT]
> **Thay đổi cấu trúc bảng `accounts`:** 
> Cột `username` và `password` sẽ bị loại bỏ khỏi bảng `accounts` và chuyển sang bảng mới `account_credentials`. Các truy vấn Client-side sau này khi lấy thông tin tài khoản bán sẽ không thể vô tình đọc được thông tin đăng nhập. Thông tin đăng nhập chỉ được cung cấp cho người mua sau khi đơn hàng được thanh toán thành công.

> [!NOTE]
> **Quyền Admin ghi dữ liệu:**
> Tất cả các hành động ghi (`INSERT`, `UPDATE`, `DELETE`) trên bảng `games`, `accounts`, và `account_credentials` chỉ được thực hiện thông qua quyền hệ thống (`service_role`). Điều này giúp đơn giản hóa RLS và bảo mật tuyệt đối dữ liệu khỏi các cuộc tấn công thay đổi dữ liệu từ phía Client.

## Proposed Changes

Chúng ta sẽ tạo một file migration mới để áp dụng các thay đổi này một cách an toàn và tự động di chuyển dữ liệu seed hiện tại.

### Database Components

#### [NEW] [20260524000000_rls_and_credentials.sql](file:///d:/CODES/Project/GmiosShop/supabase/migrations/20260524000000_rls_and_credentials.sql)

File migration mới thực hiện các bước sau:
1. **Tạo bảng `account_credentials`** để chứa thông tin đăng nhập của tài khoản game.
2. **Di chuyển dữ liệu** `username` và `password` hiện tại từ `accounts` sang `account_credentials`.
3. **Xóa các cột** `username` và `password` khỏi bảng `accounts`.
4. **Bật Row Level Security (RLS)** trên cả 4 bảng: `games`, `accounts`, `account_credentials`, và `orders`.
5. **Thiết lập các chính sách (Policies) bảo mật chi tiết**:
   - **`games`**: Cho phép mọi người đọc (`SELECT`), chỉ `service_role` được ghi.
   - **`accounts`**: 
     - Cho phép mọi người xem tài khoản đang bán (`status = 'available'` hoặc `'pending'`).
     - Cho phép người mua xem tài khoản đã mua (`status = 'sold'` và có đơn hàng thành công tương ứng với `auth.uid()`).
     - Chỉ `service_role` được ghi.
   - **`account_credentials`**:
     - Chỉ cho phép người mua có đơn hàng đã thanh toán (`orders.payment_status = 'paid'`) cho tài khoản này đọc thông tin credentials.
     - Chỉ `service_role` được ghi.
   - **`orders`**:
     - Cho phép người dùng đã đăng nhập xem đơn hàng của chính mình (`auth.uid() = user_id`).
     - Cho phép người dùng tạo đơn hàng cho chính mình (`auth.uid() = user_id`).
     - Chặn quyền cập nhật (`UPDATE`) và xóa (`DELETE`) từ phía Client (chỉ `service_role` xử lý trạng thái đơn hàng).

## Verification Plan

### Manual Verification
Chúng ta sẽ viết một script SQL test trong thư mục scratch để chạy thử các trường hợp truy cập giả lập (Simulated Roll Play) dưới các vai trò khác nhau (Public Anonymous, Authenticated User thường, Authenticated User mua hàng, và Service Role) để kiểm chứng:
1. Người dùng công cộng không xem được username/password.
2. Người dùng công cộng xem được danh sách games và accounts đang bán.
3. Người dùng đã đăng nhập tạo được đơn hàng mới.
4. Người dùng thường không xem được credentials của account chưa mua.
5. Người dùng đã mua hàng (đơn hàng `paid`) xem được credentials của account đã mua.
