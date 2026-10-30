#!/usr/bin/env bash
# =============================================================================
# DEPLOY HTS BẰNG DOCKER IMAGE — KHÔNG CẦN NHẬP IP/TÊN MIỀN
# =============================================================================
# MÁY PHÁT TRIỂN (có source):
#   docker login
#   bash deploy.sh publish <tai-khoan-dockerhub> <phien-ban>
# Ví dụ: bash deploy.sh publish ten-cua-ban 1.0.0
# Lệnh build và đẩy 2 image: <tài khoản>/hts-backend:1.0.0 và hts-web:1.0.0.
# Mặc định build cho VPS linux/amd64; VPS ARM dùng HTS_PLATFORMS=linux/arm64.
# Có thể build cả hai bằng HTS_PLATFORMS=linux/amd64,linux/arm64.
# Không cần build trên VPS; không đưa database/cấu hình bí mật vào image.
#
# VPS chỉ cần Docker/Compose v2, openssl, gzip và 3 file:
#   deploy.sh, compose.yaml, deploy/.env.example
# Để nguyên cấu trúc thư mục đó; không cần source backend/frontend/node_modules.
# Nếu image private, chạy sudo docker login trên VPS trước.
#
# LẦN ĐẦU TRÊN VPS:
#   sudo bash deploy.sh deploy <tai-khoan-dockerhub> 1.0.0
# 1. Tự tạo /srv/hts-data/hts.env và các mật khẩu/khóa ngẫu nhiên.
#    Không hỏi IP, tên miền hay DNS. Dữ liệu nằm ngoài source/container.
# 2. Pull image backend/web/MySQL, khởi động MySQL và chạy migration.
# 3. Hỏi tên + mật khẩu admin để tạo tài khoản đầu tiên.
# 4. Mở HTTP cổng 80; bạn truy cập http://IP_VPS (hoặc cổng HTTP_PORT đã đặt).
#    Database/backend không được mở cổng trực tiếp ra Internet.
#
# CẬP NHẬT CÁC LẦN SAU:
# - Máy phát triển: publish một phiên bản mới, ví dụ 1.0.1.
# - VPS: sudo bash deploy.sh deploy <tai-khoan-dockerhub> 1.0.1
# Script giữ mật khẩu/dữ liệu, pull image, backup nếu DB có bảng, tạm dừng
# web/backend, chạy migration chưa áp dụng rồi mở lại. Không tạo lại admin.
# Chạy sudo bash deploy.sh (không thêm tham số) để dùng phiên bản đã lưu.
# Nếu pull/backup lỗi thì chưa dừng web/backend; migration lỗi thì giữ dừng
# để bạn kiểm tra, không tự reset hay rollback database.
#
# DỮ LIỆU /srv/hts-data/:
#   hts.env    cấu hình, tên image, mật khẩu và khóa bảo mật — giữ riêng
#   mysql/     dữ liệu MySQL — không xóa khi cập nhật image
#   logs/      log ứng dụng
#   caddy/     dữ liệu/chứng chỉ HTTPS nếu cấu hình sau này
#   backups/   SQL nén, SHA-256 và bản sao cấu hình; nên chép sang máy khác
# File cấu hình cũ deploy/.env vẫn được dùng nếu đã có, không đổi khóa cũ.
# HTS_ENV_FILE và HTS_DATA_DIR cho phép dùng đường dẫn riêng ngoài source.
#
# TÊN MIỀN/HTTPS LÀM SAU:
# Trỏ DNS, mở 443, sửa PUBLIC_ORIGIN=https://ten-mien-cua-ban và ACME_EMAIL
# trong /srv/hts-data/hts.env, rồi chạy lại sudo bash deploy.sh.
# Nếu cấu hình cũ có HTS_DOMAIN, sửa nó cho trùng tên miền mới hoặc để trống.
# Mặc định HTTP dùng cookie thường; HTTPS tự chuyển sang cookie Secure.
# Cùng website gọi API được phép; website khác vẫn bị chặn, không dùng CORS '*'.
# Web Push/PWA cần HTTPS; các chức năng quản lý/giao việc dùng được qua HTTP.
#
# LỆNH PHỤ (không cần chạy riêng khi deploy):
#   sudo bash deploy.sh status
#   sudo bash deploy.sh logs        100 dòng log gần nhất mỗi dịch vụ
#   sudo bash deploy.sh backup
#   sudo bash deploy.sh stop        dừng, giữ dữ liệu
#   sudo bash deploy.sh restore /duong-dan/backup.sql.gz
# Restore THAY TOÀN BỘ database, cần gõ KHOI PHUC; có backup hiện tại trước.
# Không tự khôi phục file .env đi kèm; tài khoản lấy từ database phục hồi.
# Hướng dẫn chi tiết: docs/DEPLOY_VPS_DOCKER.md.
# =============================================================================
set -euo pipefail
umask 077
HTS_ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
if [[ -n "${HTS_ENV_FILE:-}" ]]; then
  ENV_FILE="$HTS_ENV_FILE"
elif [[ -f "$HTS_ROOT/deploy/.env" ]]; then
  ENV_FILE="$HTS_ROOT/deploy/.env" # Preserve configuration of an existing installation.
else
  ENV_FILE="${HTS_DATA_DIR:-/srv/hts-data}/hts.env"
fi
TEMP_FILE=""
cleanup() { if [[ -n "$TEMP_FILE" ]]; then rm -f -- "$TEMP_FILE"; fi; }
trap cleanup EXIT
fail() { printf 'Lỗi: %s\n' "$*" >&2; exit 1; }
# Tách lệnh Docker không cần nhập liệu để không lấy nhầm phần nhập tài khoản admin.
compose_input() { docker compose --project-directory "$HTS_ROOT" --env-file "$ENV_FILE" -f "$HTS_ROOT/compose.yaml" "$@"; }
compose() { compose_input "$@" < /dev/null; }

# Đọc một giá trị trong file cấu hình; không thực thi nội dung file như lệnh shell.
config_value() {
  local key="$1" line value=""
  while IFS= read -r line || [[ -n "$line" ]]; do
    case "$line" in "$key="*) value="${line#*=}"; value="${value%$'\r'}";; esac
  done < "$ENV_FILE"
  case "$value" in \"*\") value="${value#\"}"; value="${value%\"}";; \'*\') value="${value#\'}"; value="${value%\'}";; esac
  printf '%s' "$value"
}
# Kiểm tra đường dẫn dữ liệu riêng, nằm ngoài source để không mất khi thay code.
validate_data_dir() {
  [[ "$DATA_ROOT" =~ ^/[A-Za-z0-9_./-]+$ ]] || fail 'Thư mục dữ liệu phải là đường dẫn tuyệt đối, không chứa khoảng trắng.'
  case "$DATA_ROOT" in /|/srv|/var|/opt|/home|/root|/tmp|*/../*|*/..|*/./*) fail 'Hãy dùng thư mục dữ liệu riêng, ví dụ /srv/hts-data.';; esac
  case "$DATA_ROOT/" in "$HTS_ROOT/"*) fail 'Thư mục dữ liệu phải nằm ngoài source.';; esac
}
# Nhận IPv4 dạng thông thường (không có số 0 thừa), tránh nhầm với tên miền.
is_ipv4() {
  local address="$1" octet
  local -a octets
  [[ "$address" =~ ^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$ ]] || return 1
  IFS=. read -r -a octets <<< "$address"
  for octet in "${octets[@]}"; do
    [[ "$octet" =~ ^(0|[1-9][0-9]{0,2})$ ]] && (( 10#$octet <= 255 )) || return 1
  done
}
valid_host() {
  is_ipv4 "$1" || [[ "$1" =~ ^([A-Za-z0-9]([A-Za-z0-9-]*[A-Za-z0-9])?\.)+[A-Za-z]{2,63}$ ]]
}
# Mặc định HTTP nhận mọi địa chỉ trên cổng 80. Khi cấu hình origin cố định,
# dùng host đó và chọn cookie phù hợp; không đổi khóa/mật khẩu hiện có.
configure_access() {
  local host origin
  host="${HTS_DOMAIN:-$(config_value HTS_DOMAIN)}"
  origin="${PUBLIC_ORIGIN:-$(config_value PUBLIC_ORIGIN)}"
  if [[ -z "$origin" && -z "$host" ]]; then
    HTS_SITE_ADDRESS=:80
    AUTH_COOKIE_NAME=hts_session
    AUTH_COOKIE_SECURE=false
    CORS_ALLOW_SAME_ORIGIN=true
  else
    [[ "$origin" =~ ^(http|https)://([^/:]+)(:[0-9]+)?$ ]] || fail 'PUBLIC_ORIGIN cần dạng http://IP hoặc https://ten-mien, có thể kèm cổng.'
    local scheme="${BASH_REMATCH[1]}" origin_host="${BASH_REMATCH[2]}"
    [[ -z "$host" || "$host" == "$origin_host" ]] || fail 'Địa chỉ trong PUBLIC_ORIGIN phải trùng HTS_DOMAIN hoặc để HTS_DOMAIN trống.'
    valid_host "$origin_host" || [[ "$origin_host" == localhost ]] || fail 'Địa chỉ truy cập không hợp lệ.'
    HTS_SITE_ADDRESS="$scheme://$origin_host"
    CORS_ALLOW_SAME_ORIGIN=false
    if [[ "$scheme" == http ]]; then AUTH_COOKIE_NAME=hts_session; AUTH_COOKIE_SECURE=false;
    else AUTH_COOKIE_NAME=__Host-hts_session; AUTH_COOKIE_SECURE=true; fi
  fi
  export HTS_SITE_ADDRESS AUTH_COOKIE_NAME AUTH_COOKIE_SECURE CORS_ALLOW_SAME_ORIGIN
}
# Kiểm tra tên Docker Hub và phiên bản trước khi tạo/cập nhật cấu hình.
release_images() {
  [[ "$RELEASE_NAMESPACE" =~ ^[a-z0-9][a-z0-9_-]*$ ]] || fail 'Tên tài khoản/organization Docker Hub không hợp lệ.'
  [[ "$RELEASE_TAG" =~ ^[A-Za-z0-9_][A-Za-z0-9_.-]{0,127}$ ]] || fail 'Cần phiên bản image hợp lệ, ví dụ 1.0.0.'
  RELEASE_BACKEND="$RELEASE_NAMESPACE/hts-backend:$RELEASE_TAG"
  RELEASE_WEB="$RELEASE_NAMESPACE/hts-web:$RELEASE_TAG"
}
# Chỉ máy phát triển chạy publish. Không đọc cấu hình VPS hoặc tạo database.
publish() {
  release_images
  command -v docker >/dev/null || fail 'Chưa cài Docker.'
  docker buildx version >/dev/null || fail 'Cần Docker Buildx để build image.'
  local platforms="${HTS_PLATFORMS:-linux/amd64}"
  docker buildx build --platform "$platforms" -f "$HTS_ROOT/backend/Dockerfile" -t "$RELEASE_BACKEND" --push "$HTS_ROOT" < /dev/null
  docker buildx build --platform "$platforms" -f "$HTS_ROOT/frontend/Dockerfile" -t "$RELEASE_WEB" --push "$HTS_ROOT" < /dev/null
  printf 'Đã publish. Trên VPS chạy: sudo bash deploy.sh deploy %s %s\n' "$RELEASE_NAMESPACE" "$RELEASE_TAG"
}
# Lưu image mục tiêu; giữ nguyên các cấu hình và mật khẩu khác, kể cả file cũ.
update_release() {
  [[ -n "$RELEASE_NAMESPACE" ]] || return 0
  release_images
  TEMP_FILE="$(mktemp "${ENV_FILE}.tmp.XXXXXX")"
  while IFS= read -r line || [[ -n "$line" ]]; do
    case "$line" in HTS_BACKEND_IMAGE=*|HTS_WEB_IMAGE=*) ;; *) printf '%s\n' "$line";; esac
  done < "$ENV_FILE" > "$TEMP_FILE"
  printf 'HTS_BACKEND_IMAGE=%s\nHTS_WEB_IMAGE=%s\n' "$RELEASE_BACKEND" "$RELEASE_WEB" >> "$TEMP_FILE"
  mv -- "$TEMP_FILE" "$ENV_FILE"; TEMP_FILE=""
}
# Lần đầu tự tạo cấu hình HTTP, không hỏi địa chỉ; chỉ admin được hỏi sau migration.
create_config() {
  local app_password root_password jwt csrf line
  if [[ -n "$RELEASE_NAMESPACE" ]]; then release_images;
  elif [[ -n "${HTS_BACKEND_IMAGE:-}" && -n "${HTS_WEB_IMAGE:-}" ]]; then
    RELEASE_BACKEND="$HTS_BACKEND_IMAGE"; RELEASE_WEB="$HTS_WEB_IMAGE"
  else fail 'Lần đầu chạy: sudo bash deploy.sh deploy <tai-khoan-dockerhub> <phien-ban>'; fi
  DATA_ROOT="${HTS_DATA_DIR:-/srv/hts-data}"
  validate_data_dir
  mkdir -p -- "$DATA_ROOT"
  DATA_ROOT="$(cd -- "$DATA_ROOT" && pwd -P)"
  validate_data_dir
  app_password="$(openssl rand -hex 32)"; root_password="$(openssl rand -hex 32)"
  jwt="$(openssl rand -hex 32)"; csrf="$(openssl rand -hex 32)"
  mkdir -p -- "$(dirname -- "$ENV_FILE")"
  TEMP_FILE="$(mktemp "${ENV_FILE}.tmp.XXXXXX")"
  while IFS= read -r line || [[ -n "$line" ]]; do
    case "$line" in
      HTS_BACKEND_IMAGE=*) printf 'HTS_BACKEND_IMAGE=%s\n' "$RELEASE_BACKEND";;
      HTS_WEB_IMAGE=*) printf 'HTS_WEB_IMAGE=%s\n' "$RELEASE_WEB";;
      HTS_DATA_DIR=*) printf 'HTS_DATA_DIR=%s\n' "$DATA_ROOT";;
      MYSQL_PASSWORD=*) printf 'MYSQL_PASSWORD=%s\n' "$app_password";;
      MYSQL_ROOT_PASSWORD=*) printf 'MYSQL_ROOT_PASSWORD=%s\n' "$root_password";;
      JWT_SECRET=*) printf 'JWT_SECRET=%s\n' "$jwt";;
      CSRF_SECRET=*) printf 'CSRF_SECRET=%s\n' "$csrf";;
      *) printf '%s\n' "$line";;
    esac
  done < "$HTS_ROOT/deploy/.env.example" > "$TEMP_FILE"
  # Không ghi đè khóa/mật khẩu nếu một lần chạy khác vừa tạo file cấu hình trước.
  (set -o noclobber; cat "$TEMP_FILE" > "$ENV_FILE") || fail 'File cấu hình đã tồn tại; giữ nguyên và chạy lại.'
  rm -f -- "$TEMP_FILE"; TEMP_FILE=""
  printf 'Đã tạo cấu hình riêng tại %s\n' "$ENV_FILE"
}
# Chạy trước các lệnh chính: kiểm tra Docker/cấu hình, tạo thư mục và đặt quyền.
prepare() {
  for command in docker openssl gzip; do command -v "$command" >/dev/null || fail "VPS chưa có $command."; done
  docker compose version >/dev/null || fail 'Cần cài Docker Compose v2.'
  docker info >/dev/null 2>&1 || fail 'Docker chưa chạy hoặc tài khoản hiện tại chưa được phép dùng Docker.'
  if [[ "$(uname -s)" == Linux && "$(id -u)" != 0 ]]; then fail 'Trên VPS, chạy bằng sudo bash deploy.sh.'; fi
  [[ -f "$ENV_FILE" ]] || fail 'Chưa triển khai. Chạy sudo bash deploy.sh trước.'
  DATA_ROOT="${HTS_DATA_DIR:-$(config_value HTS_DATA_DIR)}"
  validate_data_dir
  configure_access
  compose config --quiet
  mkdir -p -- "$DATA_ROOT"
  # Xác định đường dẫn thật nếu có liên kết thư mục, rồi kiểm tra lại trước khi tạo dữ liệu.
  DATA_ROOT="$(cd -- "$DATA_ROOT" && pwd -P)"
  validate_data_dir
  mkdir -p -- "$DATA_ROOT/mysql" "$DATA_ROOT/logs" "$DATA_ROOT/caddy/data" "$DATA_ROOT/caddy/config" "$DATA_ROOT/backups"
  chmod 600 "$ENV_FILE"
  chmod 700 "$DATA_ROOT/backups"
  if [[ "$(id -u)" == 0 ]]; then chown 1000:1000 "$DATA_ROOT/logs"; chmod 750 "$DATA_ROOT/logs"; fi
}
# Tạo mã SHA-256 để kiểm tra file backup có còn nguyên vẹn hay không.
checksum() { openssl dgst -sha256 -r "$1" | awk '{print $1}'; }
# Xuất database MySQL thành SQL nén, kiểm tra file rồi lưu kèm mã kiểm tra và cấu hình.
# Không sao chép trực tiếp thư mục mysql đang chạy; không tự xóa các backup cũ.
backup() {
  local file digest
  file="$DATA_ROOT/backups/hts-$(date -u +%Y%m%dT%H%M%SZ)-$$.sql.gz"
  TEMP_FILE="${file}.tmp"
  if ! compose exec -T db sh -ec 'export MYSQL_PWD="$MYSQL_ROOT_PASSWORD"; exec mysqldump --user=root --single-transaction --quick --no-tablespaces --set-gtid-purged=OFF --default-character-set=utf8mb4 --routines --events --triggers "$MYSQL_DATABASE"' | gzip -c > "$TEMP_FILE"; then fail 'Backup database thất bại; chưa tạo bản sao lưu hoàn chỉnh.'; fi
  gzip -t "$TEMP_FILE" || fail 'File backup không hợp lệ.'
  mv -- "$TEMP_FILE" "$file" || fail 'Không lưu được bản backup.'
  TEMP_FILE=""
  digest="$(checksum "$file")" || fail 'Không tạo được mã kiểm tra backup.'
  printf '%s  %s\n' "$digest" "$(basename -- "$file")" > "${file}.sha256"
  cp -- "$ENV_FILE" "${file%.sql.gz}.env"
  printf '%s\n' "$file"
}
# Tạo admin DUY NHẤT lúc hệ thống chưa khởi tạo và chưa có cán bộ.
# Các lần cập nhật bình thường sẽ thoát hàm ngay, không hỏi/đổi mật khẩu admin cũ.
bootstrap_admin() {
  local needed username password confirm
  needed="$(compose exec -T backend node -e '
    const db=require("./src/config/database");
    (async()=>{const state=await db("administration_state").where({id:1}).first();const staff=await db("staff_members").first("id");console.log(!state?.bootstrap_completed&&!staff?"yes":"no");})().catch(e=>{console.error(e.message);process.exitCode=1}).finally(()=>db.destroy());
  ')"
  [[ "$needed" == no ]] && return 0
  [[ "$needed" == yes ]] || fail 'Không kiểm tra được trạng thái tài khoản quản trị.'
  while true; do
    read -r -p 'Tài khoản admin [admin]: ' username || fail 'Chưa nhập tài khoản admin.'
    username="${username:-admin}"
    read -r -s -p 'Mật khẩu admin (tối thiểu 10 ký tự): ' password || fail 'Chưa nhập mật khẩu.'; printf '\n'
    read -r -s -p 'Nhập lại mật khẩu: ' confirm || fail 'Chưa xác nhận mật khẩu.'; printf '\n'
    if [[ ${#password} -ge 10 && "$password" == "$confirm" ]]; then break; fi
    printf 'Mật khẩu cần ít nhất 10 ký tự và hai lần nhập phải giống nhau.\n' >&2
  done
  # Truyền thông tin đăng nhập qua stdin, không đặt mật khẩu trong tham số lệnh/lịch sử shell.
  printf '%s\n%s\n' "$username" "$password" | compose_input exec -T backend node -e '
    const fs=require("node:fs"),{spawnSync}=require("node:child_process");
    const [username,password]=fs.readFileSync(0,"utf8").split("\n");
    const result=spawnSync(process.execPath,["scripts/bootstrap-admin.js"],{input:JSON.stringify({username,password}),stdio:["pipe","inherit","inherit"]});
    if(result.error){console.error(result.error.message);}process.exitCode=result.status??1;
  '
  unset password confirm
}
# Luồng cài mới/cập nhật dùng chung: build -> kiểm tra/backup DB -> migration
# -> backend/admin -> website. Bốn dòng 1/4...4/4 là tiến độ của luồng này.
deploy() {
  local tables previous
  printf '1/4 — Tải Docker image...\n'
  if [[ "${HTS_SKIP_PULL:-0}" != 1 ]]; then compose pull backend web db; fi
  compose up -d --wait db
  tables="$(compose exec -T db sh -ec 'export MYSQL_PWD="$MYSQL_PASSWORD"; exec mysql --user="$MYSQL_USER" --database="$MYSQL_DATABASE" --batch --skip-column-names -e "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema=DATABASE()"')"
  [[ "$tables" =~ ^[0-9]+$ ]] || fail 'Không đọc được trạng thái database.'
  if [[ "$tables" -gt 0 ]]; then previous="$(backup)"; printf 'Đã backup trước cập nhật: %s\n' "$previous"; fi
  printf '2/4 — Chuẩn bị database...\n'
  compose stop web backend
  if ! compose run --rm --no-deps migrate; then fail 'Migration thất bại. Ứng dụng chưa được mở lại; hãy kiểm tra lỗi phía trên.'; fi
  printf '3/4 — Khởi động backend và tài khoản quản trị...\n'
  compose up -d --wait --no-deps backend
  bootstrap_admin
  printf '4/4 — Khởi động website...\n'
  compose up -d --wait --no-deps web
  local address="${PUBLIC_ORIGIN:-$(config_value PUBLIC_ORIGIN)}"
  [[ -n "$address" ]] || address="http://IP_VPS (cổng ${HTTP_PORT:-$(config_value HTTP_PORT)})"
  printf 'Hoàn tất. Truy cập: %s\nDữ liệu: %s\n' "$address" "$DATA_ROOT"
}
# Chỉ chạy khi bạn chủ động dùng lệnh restore; deploy bình thường không gọi hàm này.
# Kiểm tra file + xác nhận -> dừng ứng dụng -> backup hiện tại -> thay DB -> mở lại.
restore() {
  local archive="${1:-}" expected actual answer previous
  [[ -n "$archive" && -f "$archive" ]] || fail 'Cách dùng: sudo bash deploy.sh restore /duong-dan/backup.sql.gz'
  gzip -t "$archive" || fail 'File backup bị hỏng; chưa thay đổi database.'
  if [[ -f "${archive}.sha256" ]]; then
    read -r expected _ < "${archive}.sha256" || fail 'Không đọc được mã kiểm tra backup.'
    actual="$(checksum "$archive")"
    [[ "$actual" == "$expected" ]] || fail 'Checksum không khớp; chưa thay đổi database.'
  fi
  read -r -p 'Thao tác này thay toàn bộ database. Gõ KHOI PHUC để tiếp tục: ' answer || fail 'Chưa xác nhận khôi phục.'
  [[ "$answer" == 'KHOI PHUC' ]] || fail 'Đã hủy khôi phục; chưa thay đổi database.'
  compose up -d --wait db
  compose stop web backend
  previous="$(backup)"; printf 'Đã backup dữ liệu hiện tại: %s\n' "$previous"
  compose exec -T db sh -ec '
    case "$MYSQL_DATABASE" in ""|*[!a-zA-Z0-9_]*) echo "Tên database không hợp lệ" >&2; exit 1;; esac
    export MYSQL_PWD="$MYSQL_ROOT_PASSWORD"
    mysql --user=root -e "DROP DATABASE IF EXISTS \`$MYSQL_DATABASE\`; CREATE DATABASE \`$MYSQL_DATABASE\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"
  '
  gzip -dc "$archive" | compose_input exec -T db sh -ec 'export MYSQL_PWD="$MYSQL_ROOT_PASSWORD"; exec mysql --user=root --default-character-set=utf8mb4 "$MYSQL_DATABASE"'
  compose run --rm --no-deps migrate
  compose up -d --wait --no-deps backend
  compose up -d --wait --no-deps web
  printf 'Đã khôi phục database. Đăng nhập bằng tài khoản có trong bản backup.\n'
}

# publish chạy trên máy có source; các lệnh còn lại vận hành VPS.
ACTION="${1:-deploy}"
RELEASE_NAMESPACE=""; RELEASE_TAG=""
case "$ACTION" in
  -h|--help|help)
    printf 'Máy phát triển: bash deploy.sh publish <dockerhub> <phien-ban>\nVPS: sudo bash deploy.sh deploy [dockerhub phien-ban]\nLệnh khác: backup | restore FILE | status | logs | stop\n'; exit 0;;
  publish|deploy)
    RELEASE_NAMESPACE="${2:-${HTS_IMAGE_NAMESPACE:-}}"; RELEASE_TAG="${3:-${HTS_IMAGE_TAG:-}}"
    [[ -z "$RELEASE_NAMESPACE" ]] || release_images
    if [[ "$ACTION" == publish ]]; then publish; exit 0; fi;;
  backup|restore|status|logs|stop) ;;
  *) fail 'Lệnh không hợp lệ. Xem bash deploy.sh --help.';;
esac
if [[ "$ACTION" == deploy && ! -f "$ENV_FILE" ]]; then
  for command in docker openssl gzip; do command -v "$command" >/dev/null || fail "VPS chưa có $command."; done
  docker compose version >/dev/null || fail 'Cần cài Docker Compose v2.'
  docker info >/dev/null 2>&1 || fail 'Docker chưa chạy hoặc chưa có quyền truy cập.'
  if [[ "$(uname -s)" == Linux && "$(id -u)" != 0 ]]; then fail 'Trên VPS, chạy bằng sudo bash deploy.sh.'; fi
  create_config
fi
[[ "$ACTION" != deploy ]] || update_release
prepare
case "$ACTION" in
  deploy) deploy;;
  backup) backup;;
  restore) restore "${2:-}";;
  status) compose ps -a;;
  logs) compose logs --tail=100 backend web db migrate;;
  stop) compose stop web backend db;;
esac
