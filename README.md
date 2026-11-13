# Traffic Server & Web Demo (`/boost`)

Ứng dụng Node.js (Express + Socket.IO) quản lý chiến dịch điều phối traffic theo phân bố thời gian, kèm web demo đặt đơn / thanh toán / theo dõi trực tiếp không cần đăng ký tài khoản tại `/boost`.

## Yêu cầu môi trường

- **Node.js** (khuyến nghị LTS v18+ / v20+)
- **npm**
- (Tùy chọn cho test giao diện trình duyệt) **Microsoft Edge / Playwright** (`playwright` nằm trong dependencies)

## Cài đặt & Chạy nhanh

```bash
# 1. Cài đặt thư viện
npm install

# 2. Khởi động server (mặc định cổng 3005)
npm start
```

Có thể đổi cổng bằng biến môi trường `PORT`, ví dụ trên PowerShell:

```powershell
$env:PORT=3005; npm start
```

## Các đường dẫn chính sau khi chạy

- **Web Demo 1 màn hình (không cần tạo tài khoản):** `http://localhost:3005/boost`
- **Trang đặt đơn riêng / theo dõi đơn công khai:** `http://localhost:3005/order.html`, `http://localhost:3005/track.html`
- **Trang quản trị Admin:** `http://localhost:3005/` (đăng nhập tại `http://localhost:3005/login.html`)
  - Khi clone mới chưa có `admin.json`, server tự khởi tạo tài khoản mặc định `admin` / `admin123456`. Hãy đổi mật khẩu ngay khi triển khai thực tế.

## Cấu hình cục bộ (được `.gitignore` loại trừ khỏi Git)

Các file chứa thông tin nhạy cảm hoặc dữ liệu runtime không được đẩy lên GitHub:

- `admin.json`, `sessions.json`: Tài khoản quản trị và phiên đăng nhập.
- `proxy_config.json`: Khóa API KiotProxy và cấu hình xoay proxy (`region`, `keys`, `cooldownSec`).
- `payment_config.json`: Thông tin ngân hàng VietQR & `webhookSecret` cho `/api/payment/webhook`.
- `telegram_config.json`: `botToken` và `chatIds` nhận thông báo Telegram (có thể truyền `TELEGRAM_BOT_TOKEN` qua biến môi trường khi chưa có `telegram_config.json`).
- `orders/`, `campaigns/`: Dữ liệu đơn hàng và chiến dịch được tạo khi chạy.

## Chạy kiểm thử (Test Suite)

> Lưu ý: Chạy **tuần tự từng lệnh** (không chạy song song vì các suite dùng chung file cấu hình snapshot và port nội bộ).

```bash
# 1. Kiểm tra phân bố thời gian (timeDistribution)
node test_distribution.js

# 2. Unit & Integration tests + UI Web Demo (/boost)
npm test

# 3. Bộ kiểm thử End-to-End (Tier 1 -> Tier 4)
node e2e_tests/run_all_tests.js
```
