export const SIDEBAR_COLLAPSED_KEY = "sidebarCollapsed";
export const SIDEBAR_EXPANDED_MEDIA_QUERY = "(min-width: 1280px)";

/**
 * Trạng thái thu gọn ban đầu của sidebar desktop.
 * Ưu tiên lựa chọn người dùng đã lưu ("true"/"false"); nếu chưa có thì mở rộng khi màn hình >= 1280px.
 */
export const resolveInitialSidebarCollapsed = (storedValue, isWideScreen) => {
  if (storedValue === "true") return true;
  if (storedValue === "false") return false;
  return !isWideScreen;
};
