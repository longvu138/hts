import { useMemo } from "react";
import { App as AntApp } from "antd";

/**
 * Thông báo thao tác dùng chung (góc phải trên) thay cho việc mỗi màn tự bọc `notification` thành `message`.
 * Trả về object ổn định: { success(content, title?), error(content, title?), info(content, title?) }.
 */
export const useFeedback = () => {
  const { notification } = AntApp.useApp();
  return useMemo(() => {
    const show = (type, defaultTitle) => (description, title = defaultTitle) =>
      notification[type]({ title, description, placement: "topRight" });
    return {
      success: show("success", "Thành công"),
      error: show("error", "Lỗi"),
      info: show("info", "Thông báo"),
      warning: show("warning", "Lưu ý"),
    };
  }, [notification]);
};
