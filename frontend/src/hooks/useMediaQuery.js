import { useCallback, useSyncExternalStore } from "react";

// Khớp breakpoint `md` của Ant Design (768px): dưới mức này dùng layout mobile.
export const MOBILE_MEDIA_QUERY = "(max-width: 767.98px)";

const getMediaQueryList = (query) =>
  typeof window !== "undefined" && typeof window.matchMedia === "function" ? window.matchMedia(query) : null;

/** Đọc media query đồng bộ ngay từ lần render đầu (khác Grid.useBreakpoint trả về {} ở lần đầu). */
export const useMediaQuery = (query) => {
  const subscribe = useCallback((onChange) => {
    const mediaQueryList = getMediaQueryList(query);
    if (!mediaQueryList) return () => {};
    mediaQueryList.addEventListener("change", onChange);
    return () => mediaQueryList.removeEventListener("change", onChange);
  }, [query]);
  const getSnapshot = () => Boolean(getMediaQueryList(query)?.matches);
  return useSyncExternalStore(subscribe, getSnapshot, () => false);
};

export const useIsMobile = () => useMediaQuery(MOBILE_MEDIA_QUERY);
