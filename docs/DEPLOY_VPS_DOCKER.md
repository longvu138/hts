# Deploy HTS bằng Docker image

Luồng dùng hằng ngày: **máy phát triển build và đẩy lên Docker Hub → VPS pull image rồi chạy**. VPS không cần source backend/frontend, Node.js hoặc pnpm. Lần đầu không hỏi IP/tên miền; mở website bằng HTTP trước, cấu hình HTTPS sau.

## 1. Máy phát triển: build và đẩy image

Cần Docker + Buildx. Trong thư mục source:

```bash
docker login
bash deploy.sh publish yourname 1.0.0
```

Thay `yourname` bằng tài khoản/organization Docker Hub của bạn. Script build và push hai image:

```text
yourname/hts-backend:1.0.0
yourname/hts-web:1.0.0
```

Backend image cũng được dùng để chạy migration. Web image đã chứa frontend build và Caddy; không cần copy riêng Caddyfile lên VPS.

Mặc định build cho VPS `linux/amd64`, kể cả máy phát triển là Mac Apple Silicon. Nếu VPS dùng ARM:

```bash
HTS_PLATFORMS=linux/arm64 bash deploy.sh publish yourname 1.0.0
# Hoặc một lần publish hỗ trợ cả hai:
HTS_PLATFORMS=linux/amd64,linux/arm64 bash deploy.sh publish yourname 1.0.0
```

Nên dùng số phiên bản mới mỗi lần phát hành, không ghi đè tag cũ. Chỉ deploy sau khi cả hai image đã push thành công. Script không tự tạo repository hoặc đổi quyền public/private trên Docker Hub; tài khoản đăng nhập phải có quyền push.

## 2. VPS: chỉ cần ba file và một lệnh

VPS Linux cần Docker Engine, Docker Compose v2, `openssl`, `gzip`. Cổng 80/443 phải trống; mở cổng 80 trước, chưa cần DNS. Không mở cổng MySQL/backend ra Internet.

Tại máy phát triển có thể đóng gói đúng các file vận hành:

```bash
tar -czf hts-deploy.tar.gz deploy.sh compose.yaml deploy/.env.example
```

Chép gói lên VPS rồi giải nén, ví dụ trong `/opt/hts`:

```bash
mkdir -p /opt/hts
cd /opt/hts
tar -xzf /duong-dan/hts-deploy.tar.gz
sudo bash deploy.sh deploy yourname 1.0.0
```

Nếu image private, chạy `sudo docker login` trên VPS trước khi deploy. Các lần cập nhật vẫn dùng quyền đăng nhập Docker của tài khoản chạy script.

Script sẽ:

1. Tự tạo cấu hình `/srv/hts-data/hts.env`, mật khẩu database và khóa bảo mật ngẫu nhiên.
2. Pull image backend/web/MySQL, tạo thư mục dữ liệu và khởi động MySQL.
3. Chạy migration trên database mới.
4. Hỏi tên tài khoản admin, mật khẩu và nhập lại mật khẩu. Enter ở tên tài khoản để dùng `admin`. Mật khẩu tối thiểu 10 ký tự và không chứa tên đăng nhập; không hiện khi gõ.
5. Khởi động website HTTP trên cổng 80.

Không hỏi IP, tên miền hay DNS. Sau khi xong, bạn tự mở **http://IP_VPS**, đăng nhập bằng admin vừa tạo rồi thêm phòng ban, vai trò và người dùng. HTTP chưa mã hóa đường truyền; Web Push/PWA cần HTTPS khi bạn cấu hình sau.

## 3. Cập nhật phiên bản

Máy phát triển:

```bash
bash deploy.sh publish yourname 1.0.1
```

VPS:

```bash
cd /opt/hts
sudo bash deploy.sh deploy yourname 1.0.1
```

Không cần chép source lên VPS mỗi lần sửa giao diện/nghiệp vụ. Chỉ cập nhật ba file vận hành nếu phiên bản mới thay đổi script/Compose/cấu hình mẫu; giữ nguyên file cấu hình riêng và thư mục dữ liệu.

Script lưu tên image mới, pull image, backup database nếu đã có bảng, tạm dừng web/backend, chạy migration chưa áp dụng rồi mở lại. Dữ liệu và mật khẩu hiện có được giữ; không hỏi tạo lại admin. Có khoảng gián đoạn khi dừng ứng dụng/chạy migration.

Chạy `sudo bash deploy.sh` không thêm tham số để dùng lại phiên bản đã lưu. Nếu pull/backup lỗi, ứng dụng chưa bị dừng. Nếu migration lỗi, ứng dụng được giữ dừng để xử lý lỗi; không tự reset/rollback database. Sửa migration cũ đã chạy không làm nó tự chạy lại; thay đổi schema cần migration nâng cấp phù hợp.

## 4. Dữ liệu và backup

```text
/srv/hts-data/
  hts.env        cấu hình, tên image, mật khẩu database và khóa bảo mật
  mysql/         dữ liệu database
  logs/          log ứng dụng
  caddy/         dữ liệu/chứng chỉ HTTPS khi cấu hình
  backups/       SQL nén, mã kiểm tra và bản sao cấu hình
```

Thay image/container vẫn giữ các thư mục này. Không xóa thư mục dữ liệu, không dùng việc copy thư mục MySQL đang chạy thay cho backup.

```bash
sudo bash deploy.sh backup
sudo bash deploy.sh status
sudo bash deploy.sh logs
sudo bash deploy.sh stop
```

`backup` in đường dẫn `.sql.gz`, kèm `.sql.gz.sha256` và `.env`. Chép backup sang máy/ổ khác để phòng VPS hỏng. Các file `.env` có mật khẩu, không đưa lên Git hoặc gửi công khai. Script không tự xóa backup cũ; bạn chủ động quản lý dung lượng.

Khôi phục khi cần:

```bash
sudo bash deploy.sh restore /srv/hts-data/backups/ten-file.sql.gz
```

Lệnh kiểm tra file, yêu cầu gõ **KHOI PHUC**, backup hiện tại rồi **thay toàn bộ database** bằng bản đã chọn. Các thay đổi sau thời điểm backup sẽ mất khỏi database sau restore. Tài khoản lấy từ bản backup; file cấu hình VPS hiện tại không tự đổi theo `.env` đi kèm backup.

## 5. Tên miền/HTTPS làm sau

Trỏ DNS về VPS, mở cổng 443. Sửa file đang dùng, mặc định:

```bash
sudo nano /srv/hts-data/hts.env
```

Điền:

```dotenv
PUBLIC_ORIGIN=https://hts.example.vn
ACME_EMAIL=email-cua-ban@example.vn
HTS_DOMAIN=
```

`HTS_DOMAIN` chỉ giữ để tương thích cấu hình cũ; có thể để trống hoặc nhập đúng tên miền trên. Sau đó:

```bash
sudo bash deploy.sh
```

Caddy tự xin chứng chỉ. Script tự đổi cookie đăng nhập sang Secure, giữ nguyên database và khóa. Mở tên miền rồi đăng nhập lại. Không đổi mật khẩu MySQL, JWT_SECRET hoặc CSRF_SECRET chỉ để thêm tên miền.

Mặc định API chỉ chấp nhận yêu cầu từ cùng website đang truy cập (IP/cổng/tên miền), không dùng CORS `*`. Backend chỉ được truy cập qua Caddy trong mạng Docker. Khi đã đặt `PUBLIC_ORIGIN`, origin đó được dùng cho CORS.

## 6. Cấu hình nâng cao khi cần

- Đổi cổng HTTP: sửa `HTTP_PORT=8080` rồi deploy lại; truy cập `http://IP_VPS:8080`.
- File cấu hình: ưu tiên `HTS_ENV_FILE`, sau đó `deploy/.env` của bản cài cũ, cuối cùng `/srv/hts-data/hts.env`. Giữ file cũ khi nâng cấp.
- Thư mục dữ liệu riêng: lần đầu dùng `sudo HTS_DATA_DIR=/srv/hts-khac bash deploy.sh deploy yourname 1.0.0`; các lần sau dùng `sudo HTS_ENV_FILE=/srv/hts-khac/hts.env bash deploy.sh`.
- Có thể chỉ định `HTS_BACKEND_IMAGE` / `HTS_WEB_IMAGE` trong file cấu hình để dùng registry khác. Lệnh `publish` rút gọn ở trên dành cho Docker Hub.
- `HTS_SKIP_PULL=1` chỉ dành cho người phát triển kiểm thử image đã build local; deploy VPS bình thường luôn pull image.

## Kiểm thử dành cho người phát triển

```bash
pnpm test:deploy
# Tùy chọn: build image local và chạy stack Docker tạm riêng, không push Hub:
python3 tests/deploy-smoke.py
```
