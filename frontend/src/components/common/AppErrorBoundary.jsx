import { Component } from "react";
import { Button, Result } from "antd";
import { safeSessionStorage } from "../../utils/safeStorage";

const DYNAMIC_IMPORT_ERROR_PATTERN =
  /Failed to fetch dynamically imported module|Importing a module script failed|error loading dynamically imported module|Loading chunk [\w-]+ failed|ChunkLoadError/i;
const DYNAMIC_IMPORT_RELOAD_KEY = "hts:dynamic-import-reload";
const DYNAMIC_IMPORT_RELOAD_PARAM = "_uiReload";

const DYNAMIC_IMPORT_ERROR_DESCRIPTION = import.meta.env.DEV
  ? "Kết nối tới máy chủ giao diện bị gián đoạn hoặc trình duyệt đang giữ phiên bản cũ. Hãy kiểm tra Vite đang chạy rồi thử tải lại."
  : "Ứng dụng vừa được cập nhật hoặc kết nối mạng bị gián đoạn. Vui lòng tải lại trang để dùng phiên bản mới nhất.";

const isDynamicImportError = (error) =>
  DYNAMIC_IMPORT_ERROR_PATTERN.test(String(error?.message || error));

export class AppErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error("Lỗi giao diện:", error, info);

    if (!isDynamicImportError(error)) return;

    const recoveryUrl = new URL(window.location.href);
    recoveryUrl.searchParams.delete(DYNAMIC_IMPORT_RELOAD_PARAM);
    const recoveryTarget = `${recoveryUrl.pathname}${recoveryUrl.search}`;
    const previousTarget = safeSessionStorage.getItem(DYNAMIC_IMPORT_RELOAD_KEY);
    if (previousTarget === recoveryTarget) return;

    safeSessionStorage.setItem(DYNAMIC_IMPORT_RELOAD_KEY, recoveryTarget);
    recoveryUrl.searchParams.set(DYNAMIC_IMPORT_RELOAD_PARAM, String(Date.now()));
    window.location.replace(recoveryUrl);
  }

  componentDidMount() {
    this.recoveryTimer = window.setTimeout(() => {
      safeSessionStorage.removeItem(DYNAMIC_IMPORT_RELOAD_KEY);
      const currentUrl = new URL(window.location.href);
      if (currentUrl.searchParams.has(DYNAMIC_IMPORT_RELOAD_PARAM)) {
        currentUrl.searchParams.delete(DYNAMIC_IMPORT_RELOAD_PARAM);
        window.history.replaceState(window.history.state, "", currentUrl);
      }
    }, 10_000);
  }

  componentWillUnmount() {
    window.clearTimeout(this.recoveryTimer);
  }

  render() {
    if (this.state.error) {
      const dynamicImportFailed = isDynamicImportError(this.state.error);
      return (
        <Result
          status="error"
          title={dynamicImportFailed ? "Không tải được mã giao diện mới" : "Không thể hiển thị màn hình"}
          subTitle={dynamicImportFailed
            ? DYNAMIC_IMPORT_ERROR_DESCRIPTION
            : "Dữ liệu trả về không hợp lệ hoặc giao diện gặp lỗi. Vui lòng tải lại trang."}
          extra={[
            <Button
              key="reload"
              type="primary"
              onClick={() => {
                safeSessionStorage.removeItem(DYNAMIC_IMPORT_RELOAD_KEY);
                const retryUrl = new URL(window.location.href);
                retryUrl.searchParams.set(DYNAMIC_IMPORT_RELOAD_PARAM, String(Date.now()));
                window.location.replace(retryUrl);
              }}
            >
              Thử tải lại
            </Button>,
            <Button key="home" onClick={() => window.location.assign("/")}>
              Về trang chủ
            </Button>,
          ]}
        />
      );
    }

    return this.props.children;
  }
}
