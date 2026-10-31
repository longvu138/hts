# Hướng dẫn triển khai HTS từng bước

**Lần đầu:** làm từ bước 1 đến bước 9 theo thứ tự. **Những lần cập nhật sau:** chỉ làm phần “Cập nhật phiên bản” bên dưới.

Trong hướng dẫn:

- **LOCAL:** máy của bạn đang có source `/Users/lovu/Desktop/hts`.
- **VPS:** máy chủ chạy ứng dụng, không cần chép source lên.
- Tài khoản Docker Hub đang dùng: **130820**. Các lệnh đã điền sẵn tài khoản này.
- Thay `IP_VPS` bằng IP thật của VPS.
- Ví dụ lần đầu dùng phiên bản `1.0.2`; lần cập nhật sau dùng `1.0.3`.

Nếu một lệnh báo lỗi, dừng tại bước đó để xử lý rồi mới tiếp tục.

## Bước 1. Kiểm tra Docker — LOCAL và VPS

Trên LOCAL, bật Docker Desktop. Trên VPS cần cài Docker và Docker Compose v2 trước.

Trên Mac LOCAL:

```bash
docker version
docker compose version
```

Trên VPS Ubuntu, nếu đang dùng tài khoản thường (ví dụ `lovu`):

```bash
sudo docker version
sudo docker compose version
```

Lệnh `version` cần thấy cả Client và Server; nếu không kết nối được Docker daemon thì xử lý trước khi tiếp tục.

Tại bước 4 sẽ chuyển sang shell root trên VPS bằng `sudo -i`. Sau đó đăng nhập Docker và chạy tất cả lệnh VPS trong cùng shell root, tránh lỗi đăng nhập bằng user thường nhưng pull bằng sudo. Trên Mac LOCAL không dùng sudo cho Docker.

## Bước 2. Sửa tên image và phiên bản — LOCAL

Mở file `compose.build.yaml` trong source. Sửa trực tiếp hai dòng `image`:

```yaml
# Service backend:
image: 130820/hts-backend:1.0.2

# Service web:
image: 130820/hts-web:1.0.2
```

Giữ cùng tag `1.0.2` cho cả hai image. Không cần `export` biến môi trường.

Giữ nguyên `build.platforms` gồm `linux/amd64` và `linux/arm64` cho cả hai service. Mỗi tag sẽ chứa đủ hai kiến trúc; Docker tự chọn bản phù hợp khi pull trên Mac M1, Ubuntu ARM hoặc Ubuntu Intel/AMD. Không cần đổi platform theo từng server.

## Bước 3. Build và push image — LOCAL

Mở terminal tại source:

```bash
cd /Users/lovu/Desktop/hts
docker login -u 130820
```

Chuẩn bị builder đa kiến trúc **một lần trên LOCAL**:

```bash
docker buildx create --name hts-multi --driver docker-container
```

Nếu báo builder `hts-multi` đã tồn tại thì bỏ qua lệnh create. Builder này không thay đổi builder mặc định của Docker.

Đăng nhập Docker Hub xong, build và push cả hai kiến trúc bằng **một lệnh**:

```bash
docker compose -f compose.build.yaml build --builder hts-multi --push
```

Kết quả cần có đủ hai image trên Docker Hub:

```text
130820/hts-backend:1.0.2
130820/hts-web:1.0.2
```

Kiểm tra image đã có đủ hai kiến trúc:

```bash
docker buildx imagetools inspect 130820/hts-backend:1.0.2
docker buildx imagetools inspect 130820/hts-web:1.0.2
```

Mỗi image phải có `linux/amd64` và `linux/arm64`. Chỉ làm bước 4 khi cả hai image đã push thành công. Không dùng build rồi push riêng trong quy trình này để tránh chỉ đẩy một kiến trúc từ image local.

## Bước 4. Tạo compose.yaml trực tiếp trên VPS

Trên LOCAL, mở file **compose.yaml** trong source và copy toàn bộ nội dung. Đây là file dùng để chạy ứng dụng, khác với `compose.build.yaml` dùng build image.

Mở terminal và đăng nhập VPS:

```bash
ssh lovu@IP_VPS
```

Ví dụ tài khoản SSH là `lovu`; nếu tài khoản trên VPS khác thì thay tên cho đúng. Sau khi đăng nhập, chuyển sang root:

```bash
sudo -i
```

Nếu đang ở VPS rồi, không cần SSH lại, chỉ chạy `sudo -i`. Tiếp theo tạo thư mục và mở file mới:

```bash
mkdir -p /opt/hts
cd /opt/hts
nano compose.yaml
```

Dán toàn bộ nội dung vừa copy vào file. Giữ nguyên thụt dòng YAML. Trong nano:

1. Bấm **Ctrl + O**, rồi **Enter** để lưu tên `compose.yaml`.
2. Bấm **Ctrl + X** để thoát.

Kiểm tra file đã lưu:

```bash
ls -l compose.yaml
```

Không cần chép source backend/frontend, node_modules hay Dockerfile lên VPS. Từ đây đến bước 9, các lệnh terminal đều chạy trên VPS trong `/opt/hts`.

## Bước 5. Đăng nhập Docker Hub — VPS, trong shell root

Giữ terminal root ở bước 4, chạy:

```bash
docker login -u 130820
```

Nhập mật khẩu/PAT Docker Hub. Cần thấy `Login Succeeded` trước khi tiếp tục. Đăng nhập ở Mac không thay thế đăng nhập ở VPS; đăng nhập bằng user thường cũng không thay thế phiên đăng nhập của root.

## Bước 6. Tạo cấu hình lần đầu — VPS

Trước tiên, bảo đảm đang ở đúng thư mục:

```bash
cd /opt/hts
ls -la
```

**Nếu chưa có `.env`**, chạy lệnh setup sau:

```bash
docker run --rm --user 0 -v "$PWD:/deploy" \
  130820/hts-backend:1.0.2 \
  node scripts/setup-deploy.js 130820 1.0.2
```

Lệnh lấy công cụ setup từ image để tự tạo:

- `.env`: tên image, phiên bản, cổng, mật khẩu database và các khóa bảo mật.
- `data/`: nơi lưu database, log và backup.

**Chỉ làm bước này một lần.** Các lần cập nhật không chạy lại setup, không xóa hoặc ghi đè `.env`.

Cần thấy thông báo **“Đã tạo .env và data/”**. Nếu setup lỗi, chưa chạy bước 7.

**Nếu đã có `.env`**, không chạy lại setup. Mở file:

```bash
nano .env
```

Sửa hai dòng sau rồi lưu, giữ nguyên mật khẩu/khóa:

```dotenv
HTS_IMAGE_NAMESPACE=130820
HTS_IMAGE_TAG=1.0.2
```

Nếu cấu hình cũ có `HTS_BACKEND_IMAGE` hoặc `HTS_WEB_IMAGE`, chúng ưu tiên hơn hai dòng trên; sửa chúng lần lượt thành `130820/hts-backend:1.0.2` và `130820/hts-web:1.0.2`. Các dòng `MYSQL_PASSWORD`, `MYSQL_ROOT_PASSWORD`, `JWT_SECRET`, `CSRF_SECRET` phải có giá trị. Nếu thiếu cấu hình nhưng database đã có dữ liệu, dừng để tìm lại `.env` cũ, không tự sinh lại mật khẩu.


## Bước 7. Pull image và chạy — VPS

Vẫn trong shell root, kiểm tra Compose đọc đúng `.env`:

```bash
cd /opt/hts
docker compose --env-file .env config --quiet
```

Lệnh không in lỗi thì tiếp tục:

```bash
docker compose --env-file .env pull
```

Pull thành công thì chạy:

```bash
docker compose --env-file .env up -d --wait
```

Hệ thống tự chạy theo thứ tự: **MySQL → migration → backend → web**. Bạn không cần chạy lệnh migrate riêng. Migration đã áp dụng sẽ không chạy lại; migration mới sẽ được áp dụng.

Kiểm tra:

```bash
docker compose --env-file .env ps -a
```

`db`, `backend`, `web` cần ở trạng thái chạy/healthy. `migrate` hiện `Exited (0)` là đã hoàn tất thành công. Lần đầu MySQL khởi tạo có thể hơi lâu; nếu hết thời gian chờ, xem trạng thái/log trước khi chạy lại lệnh up.

Mở cổng **3180** trên firewall VPS nếu cần, sau đó thử **http://IP_VPS:3180**.

## Bước 8. Tạo admin qua API — lần đầu

Trên VPS, mở cấu hình:

```bash
nano .env
```

Lấy phần giá trị sau `BOOTSTRAP_TOKEN=`. Không gửi token công khai.

Trong Postman, chọn:

| Mục | Điền như sau |
| --- | --- |
| Method | POST |
| URL | `http://IP_VPS:3180/api/auth/bootstrap-admin` |
| Header thứ nhất | `Content-Type: application/json` |
| Header thứ hai | `X-Bootstrap-Token: giá trị vừa lấy trong .env` |
| Body | raw → JSON |

Nội dung Body:

```json
{
  "username": "admin",
  "password": "THAY_MAT_KHAU_MANH",
  "fullName": "Quản trị hệ thống"
}
```

Thay mật khẩu trước khi gửi: tối thiểu 10 ký tự, không chứa tên tài khoản. Bấm **Send**. Kết quả **201** nghĩa là đã tạo thành công. Thiếu/sai token trả 403; dữ liệu sai trả 422; đã khởi tạo trả 409.

<details>
<summary>Nếu dùng cURL thay Postman</summary>

```bash
curl -X POST 'http://IP_VPS:3180/api/auth/bootstrap-admin' \
  -H 'Content-Type: application/json' \
  -H 'X-Bootstrap-Token: THAY_TOKEN_TRONG_ENV' \
  -d '{"username":"admin","password":"THAY_MAT_KHAU_MANH","fullName":"Quản trị hệ thống"}'
```

</details>

API này không cần đăng nhập/cookie/CSRF, nhưng bắt buộc token bí mật và chỉ tạo được admin một lần. Khi gọi qua mạng, ưu tiên HTTPS hoặc SSH tunnel vì HTTP chưa mã hóa mật khẩu/token.

## Bước 9. Đăng nhập và sử dụng

Mở **http://IP_VPS:3180**, đăng nhập bằng admin vừa tạo. Tạo phòng ban, vai trò và tài khoản người dùng từ giao diện.

Cài lần đầu đã xong. Không làm lại bước 6 hoặc bước 8 khi cập nhật phiên bản.

## Cập nhật phiên bản — những lần sau

### Bước 1. Sửa tag mới trong source — LOCAL

Trong `compose.build.yaml`, đổi cả hai image sang phiên bản mới, ví dụ:

```yaml
image: 130820/hts-backend:1.0.3
image: 130820/hts-web:1.0.3
```

Mỗi bản phát hành dùng tag mới; không ghi đè tag cũ.

### Bước 2. Build và push — LOCAL

```bash
cd /Users/lovu/Desktop/hts
docker compose -f compose.build.yaml build --builder hts-multi --push
```

Chỉ tiếp tục khi lệnh build/push thành công cho cả hai image.

### Bước 3. Sửa phiên bản cần chạy — VPS

Dùng lại shell root; nếu mở terminal VPS mới, chạy `sudo -i` trước.

```bash
cd /opt/hts
nano .env
```

Chỉ đổi tag cho trùng phiên bản vừa push, giữ các mật khẩu/khóa cũ. Nếu còn hai biến image đầy đủ từ cấu hình cũ, cập nhật tag của cả hai biến đó cho trùng:

```dotenv
HTS_IMAGE_TAG=1.0.3
```

### Bước 4. Pull và chạy bản mới — VPS

```bash
docker compose --env-file .env pull
docker compose --env-file .env up -d --wait
```

Migration mới tự chạy trước backend. Không có migration mới thì không thay đổi schema. Dữ liệu và tài khoản được giữ nguyên.

Nếu bản phát hành thay schema, dùng thứ tự sau **thay cho hai lệnh ở trên**, để backup và dừng ứng dụng cũ trước migration:

```bash
docker compose --env-file .env pull
docker compose --env-file .env run --rm backup
docker compose --env-file .env stop web backend
docker compose --env-file .env up -d --wait
```

Không cần tạo/dán lại `compose.yaml`, trừ khi bản phát hành có thay đổi chính file này; khi đó mở file trên VPS và cập nhật nội dung từ source. Migration lỗi thì xem `docker compose --env-file .env logs migrate`, xử lý rồi chạy lại up; không xóa database để thử lại.

## Thử luồng giống VPS trong thư mục riêng trên LOCAL

Làm **bước 1–3 của cài lần đầu** để build/push image. Sau đó, thay phần tạo file trên VPS/SSH bằng:

```bash
mkdir -p /Users/lovu/Desktop/hts-server
cp /Users/lovu/Desktop/hts/compose.yaml /Users/lovu/Desktop/hts-server/
cd /Users/lovu/Desktop/hts-server
```

Tiếp tục **bước 6–9 ngay trên LOCAL**, không SSH và không chạy `sudo -i`; dùng Docker Desktop bằng tài khoản Mac hiện tại. Thay `IP_VPS:3180` bằng `localhost:3180`. Cần Docker Desktop đang chạy.

Khi cập nhật, làm cùng bốn bước cập nhật ở trên; phần VPS thực hiện ngay tại `/Users/lovu/Desktop/hts-server`.

## Dữ liệu, backup và xem lỗi

```text
/opt/hts/                  # Local thử nghiệm: /Users/lovu/Desktop/hts-server/
├── compose.yaml
├── .env                  # Cấu hình riêng, không đưa lên Git
└── data/
    ├── mysql/            # Database
    ├── logs/             # Log ứng dụng
    ├── caddy/            # Dữ liệu web/chứng chỉ
    └── backups/          # Bản sao lưu
```

Chạy tại thư mục chứa compose.yaml:

```bash
docker compose --env-file .env run --rm backup             # Backup vào data/backups/
docker compose --env-file .env ps -a                       # Xem trạng thái
docker compose --env-file .env logs --tail=100 backend web # Xem lỗi ứng dụng
docker compose --env-file .env logs migrate               # Xem migration
docker compose --env-file .env stop                       # Dừng, giữ dữ liệu
docker compose --env-file .env up -d --wait                # Chạy lại
```

Backup có SQL, checksum `.sha256` và bản sao `.env`. Chưa tự backup theo lịch hoặc tự xóa bản cũ; nên chép backup sang máy khác. Không copy thư mục MySQL đang chạy để thay cho backup.

### Quyền truy cập data/ trên Ubuntu

Setup chạy bằng root nên user thường có thể gặp `Permission denied` khi vào `data/`. Đây là thư mục dữ liệu riêng, không phải lỗi ứng dụng. **Để deploy, luôn đứng ở `/opt/hts`, không cần cd vào data/.**

Nếu chỉ cần xem thư mục bằng user thường:

```bash
sudo ls -la /opt/hts/data
```

Nếu cần vào thư mục để quản trị:

```bash
sudo -i
cd /opt/hts/data
```

`sudo cd data/` không hoạt động vì `cd` là lệnh của shell. Không dùng `chmod 777` hoặc đổi owner toàn bộ `data/`: MySQL và backend có quyền riêng; setup đã đặt quyền log cho user trong image.

### Các lỗi đã gặp và cách tránh lần cài sau

| Lỗi | Nguyên nhân/cách xử lý |
| --- | --- |
| Login thành công nhưng pull access denied | Đăng nhập bằng user thường nhưng chạy Docker bằng sudo/root. Theo bước 4–5: `sudo -i` rồi `docker login -u 130820` trong cùng shell root. Nếu vẫn lỗi, kiểm tra đúng repository, tag và quyền pull. |
| Thiếu CSRF_SECRET/JWT_SECRET/MYSQL_PASSWORD | Setup chưa xong, `.env` thiếu giá trị hoặc chạy sai thư mục. Theo bước 6, giữ đúng `/opt/hts`, rồi chạy `docker compose --env-file .env config --quiet`. Không tự đổi mật khẩu khi đã có dữ liệu. |
| exec format error, AMD64 không khớp ARM64 | Tag cũ chỉ chứa một kiến trúc. Theo bước 3: build/push đa kiến trúc và kiểm tra manifest của cả hai image trước khi deploy. Đổi tag trong `.env` sang bản mới. |
| cd data/: Permission denied / sudo cd: command not found | Dùng `sudo -i` rồi `cd /opt/hts/data`, hoặc chỉ xem bằng `sudo ls`. Không cần vào data/ khi deploy. |
| Website không mở được từ máy khác | Kiểm tra `docker compose --env-file .env ps -a`, log backend/web, cổng 3180 có trùng không và firewall/security group của VPS đã cho phép cổng này chưa. |

Trước khi chạy trên VPS mới, cần đủ: Docker/Compose hoạt động, quyền pull image, tag có đúng kiến trúc, file Compose dán đầy đủ, setup tạo `.env` thành công, cổng 3180 còn trống và được mở. Source không thể tự xử lý lỗi tài khoản Docker Hub, mạng, firewall hoặc thiếu tài nguyên của máy chủ.

Image/cache và log nội bộ container do Docker quản lý riêng. Dữ liệu ứng dụng và backup nằm trong `data/`. Nếu chạy nhiều bản HTS trên cùng máy, đổi `COMPOSE_PROJECT_NAME` và cổng trong từng `.env` để tránh trùng.

<details>
<summary>Khôi phục dữ liệu từ backup — chỉ dùng khi cần</summary>

**Thao tác này thay dữ liệu hiện tại bằng dữ liệu trong backup.** Chọn đúng file, kiểm tra checksum và backup hiện tại trước. Thực hiện trên bản thử nghiệm để xác nhận trước khi áp dụng server thật.

```bash
# Thay đường dẫn bằng file SQL cần phục hồi:
HTS_RESTORE_FILE=data/backups/hts-TEN_FILE.sql
# Chỉ so sánh digest (đường dẫn trong file checksum là đường dẫn bên trong container):
shasum -a 256 "$HTS_RESTORE_FILE"
cat "$HTS_RESTORE_FILE.sha256"
# Chỉ tiếp tục nếu hai digest giống nhau.
docker compose --env-file .env run --rm backup
docker compose --env-file .env stop web backend
# Database mẫu mặc định tên hts; lệnh dùng tên thật từ cấu hình trong container.
docker compose --env-file .env exec -T db sh -ec 'case "$MYSQL_DATABASE" in ""|*[!a-zA-Z0-9_]*) exit 1;; esac; export MYSQL_PWD="$MYSQL_ROOT_PASSWORD"; mysql -u root -e "DROP DATABASE IF EXISTS \`$MYSQL_DATABASE\`; CREATE DATABASE \`$MYSQL_DATABASE\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"'
docker compose --env-file .env exec -T db sh -ec 'export MYSQL_PWD="$MYSQL_ROOT_PASSWORD"; exec mysql -u root "$MYSQL_DATABASE"' < "$HTS_RESTORE_FILE"
docker compose --env-file .env run --rm migrate
docker compose --env-file .env up -d --wait
```

Dừng khi có bất kỳ lỗi nào, không mở ứng dụng nếu import thất bại. Tài khoản lấy từ bản backup. Không tự đổi `.env` hiện tại theo bản sao `.env` của backup; nếu phục hồi lên máy mới cần giữ đúng khóa/mật khẩu cũ.


</details>

<details>
<summary>Cấu hình tên miền và HTTPS sau này</summary>

HTTP chưa mã hóa đường truyền; PWA/Web Push cần HTTPS (ngoại trừ localhost). Khi có tên miền trỏ tới server, đổi trong `.env`:

```dotenv
HTS_SITE_ADDRESS=https://hts.example.vn
PUBLIC_ORIGIN=https://hts.example.vn
HTTP_PORT=80
HTTPS_PORT=443
AUTH_COOKIE_NAME=__Host-hts_session
AUTH_COOKIE_SECURE=true
ACME_EMAIL=your-email@example.com
```

Mở cổng 80/443 rồi chạy `docker compose --env-file .env up -d --wait`. Không đổi JWT_SECRET/CSRF_SECRET hay mật khẩu database. Nếu muốn Web Push, cấu hình thêm VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY và VAPID_SUBJECT.


</details>

<details>
<summary>Ghi chú cho người bảo trì source</summary>

Kiểm tra cấu hình: `pnpm test:deploy`. Test Docker tách biệt: `python3 tests/deploy-smoke.py`. Với cấu hình cũ chưa có token tạo admin, thêm `BOOTSTRAP_TOKEN` ngẫu nhiên tối thiểu 32 ký tự vào `.env` và chạy lại Compose.

</details>
