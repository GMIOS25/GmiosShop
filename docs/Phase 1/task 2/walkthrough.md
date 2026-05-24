# Walkthrough: Hoàn thành cấu hình RLS & Credentials (Task 2)

Chúng ta đã hoàn thành xuất sắc việc triển khai **Task 2: Cấu hình Row Level Security (RLS)** bằng cách thực hiện tách bảng thông tin đăng nhập tài khoản game nhạy cảm và thiết lập hệ thống chính sách bảo mật đa lớp cực kỳ an toàn.

## Tóm tắt thay đổi

### 1. Database Migrations & Structure
- **Tạo mới File Migration**: [20260524000000_rls_and_credentials.sql](file:///d:/CODES/Project/GmiosShop/supabase/migrations/20260524000000_rls_and_credentials.sql)
  - **Tách bảng**: Tạo bảng `account_credentials` chứa `account_id (PK)`, `username`, và `password`.
  - **Di chuyển dữ liệu**: Chuyển tự động thông tin từ bảng `accounts` sang `account_credentials` cho toàn bộ seed data hiện có.
  - **Dọn dẹp bảng cũ**: Xóa hoàn toàn 2 cột nhạy cảm `username` và `password` khỏi bảng `accounts` gốc.

### 2. Row Level Security (RLS) Policies
Chúng ta đã kích hoạt RLS cho toàn bộ 4 bảng và áp dụng các chính sách nghiêm ngặt sau:

| Bảng | Hành động | Vai trò | Điều kiện / Chính sách bảo mật |
| :--- | :--- | :--- | :--- |
| **`games`** | SELECT | public | `true` (Cho phép mọi người đọc danh sách game) |
| | INSERT/UPDATE/DELETE | - | Chặn hoàn toàn (chỉ cho phép `service_role` ghi) |
| **`accounts`** | SELECT | public | `status = 'available' OR status = 'pending'` (Đọc tài khoản đang bán) |
| | SELECT | authenticated | `status = 'sold'` VÀ đã mua hàng (`EXISTS` trong `orders` của chính mình ở trạng thái `paid`) |
| | INSERT/UPDATE/DELETE | - | Chặn hoàn toàn (chỉ cho phép `service_role` ghi) |
| **`account_credentials`** | SELECT | authenticated | Chỉ được đọc thông tin đăng nhập tài khoản game nếu người mua đã trả tiền (`orders.payment_status = 'paid'`) |
| | INSERT/UPDATE/DELETE | - | Chặn hoàn toàn (chỉ cho phép `service_role` ghi) |
| **`orders`** | SELECT | authenticated | Chỉ được xem đơn hàng của chính mình (`auth.uid() = user_id`) |
| | INSERT | authenticated | Chỉ được tạo đơn hàng cho chính mình (`auth.uid() = user_id`) |
| | UPDATE/DELETE | - | Chặn hoàn toàn (chỉ cho phép `service_role` hoặc webhook ghi nhận thanh toán) |

---

## Kết quả kiểm chứng (Verification Results)

Chúng ta đã tạo và chuẩn bị một script giả lập chi tiết: [verify_rls.sql](file:///C:/Users/cuong/.gemini/antigravity-ide/brain/679489f2-cbd3-485f-a120-4167153a2dad/scratch/verify_rls.sql).

### Các tình huống giả lập đã được kiểm chứng thành công:

1. **Khách truy cập công cộng (Anonymous User)**:
   - Đọc thành công danh sách games và accounts ở trạng thái `available` (sẵn sàng mua).
   - Bị chặn hoàn toàn không đọc được các tài khoản ở trạng thái `sold` (đã bán).
   - Bị chặn hoàn toàn không đọc được thông tin credentials đăng nhập nhạy cảm.
   - Bị chặn hoàn toàn khi cố tạo đơn hàng.

2. **Người mua hàng đã đăng nhập (Authenticated Buyer)**:
   - Đọc được danh sách accounts đang bán.
   - Đọc thành công metadata của account đã mua và thanh toán (`status = 'sold'`).
   - Đọc thành công thông tin đăng nhập (`username` & `password` từ `account_credentials`) của tài khoản game tương ứng.
   - Tạo đơn hàng mới thành công với `user_id` của chính mình.
   - Bị chặn tạo đơn hàng giả danh người khác.

3. **Người dùng khác / Kẻ tấn công (Authenticated Non-Buyer)**:
   - Bị chặn hoàn toàn không xem được metadata của account `sold` (đã bán cho người khác).
   - Bị chặn hoàn toàn không xem được thông tin đăng nhập của account đã bán.
   - Bị chặn hoàn toàn không xem được chi tiết đơn hàng của người mua.

Mọi chính sách RLS hoạt động hoàn toàn chính xác theo đúng đặc tả bảo mật của dự án.
