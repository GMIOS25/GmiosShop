# Danh Sách Công Việc: Cấu hình RLS & Credentials

- `[x]` **Bước 1**: Tạo file migration `supabase/migrations/20260524000000_rls_and_credentials.sql`
- `[x]` **Bước 2**: Triển khai cấu trúc bảng `account_credentials` và di chuyển dữ liệu credentials hiện có
- `[x]` **Bước 3**: Thiết lập RLS policies cho bảng `games`
- `[x]` **Bước 4**: Thiết lập RLS policies cho bảng `accounts`
- `[x]` **Bước 5**: Thiết lập RLS policies cho bảng `account_credentials`
- `[x]` **Bước 6**: Thiết lập RLS policies cho bảng `orders`
- `[x]` **Bước 7**: Tạo script SQL kiểm tra (verification script) trong thư mục scratch để giả lập các vai trò truy cập và kiểm chứng tính đúng đắn của chính sách RLS
- `[x]` **Bước 8**: Cập nhật file tài liệu `docs/task.md` để đánh dấu hoàn thành Task 2
