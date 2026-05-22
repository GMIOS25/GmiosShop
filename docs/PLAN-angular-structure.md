# Cấu trúc thư mục cho dự án Angular

Đề xuất cấu trúc thư mục chuẩn, dễ bảo trì và mở rộng cho dự án Angular (phù hợp với Standalone Components trong Angular 14+).

## Open Questions

> [!IMPORTANT]
> Vui lòng trả lời 3 câu hỏi sau để cấu trúc thư mục được tối ưu nhất cho dự án của bạn:
> 1. **Mục đích và phạm vi**: Dự án này thuộc lĩnh vực gì (ví dụ: E-commerce, Admin Dashboard, CMS...)?
> 2. **UI/UX Stack**: Bạn dự định sử dụng CSS Framework/Library nào (ví dụ: Tailwind CSS thuần, Angular Material, PrimeNG, hay Custom CSS)? (Lưu ý: Không dùng mặc định shadcn/Radix nếu chưa thống nhất).
> 3. **Tính năng cốt lõi**: Các tính năng chính (features) mà bạn biết chắc chắn sẽ cần là gì (ví dụ: Auth, Product List, Checkout, Dashboard)?

## Proposed Changes

### Core Structure

Chúng tôi sẽ tạo các thư mục sau trong workspace:

#### [NEW] src/app/core/
Thư mục chứa các singleton services, interceptors, guards, và models.
- `guards/`
- `interceptors/`
- `services/`
- `models/`

#### [NEW] src/app/shared/
Thư mục chứa các thành phần dùng chung (dumb components, UI components).
- `components/`
- `directives/`
- `pipes/`
- `utils/`

#### [NEW] src/app/features/
Thư mục chứa các nghiệp vụ cụ thể (Smart components, pages).
- `home/`
- `auth/`

#### [NEW] src/app/layouts/
Thư mục chứa các cấu trúc trang.
- `header/`
- `footer/`
- `main-layout/`

#### [NEW] src/styles/
Thư mục chứa global SCSS/CSS, variables, mixins.

## Verification Plan

### Manual Verification
- Kiểm tra cây thư mục `src/app/` và `src/` để đảm bảo đã có đầy đủ các thư mục như đề xuất.
- Đảm bảo dự án vẫn build thành công sau khi tổ chức lại file (`npm run build`).
