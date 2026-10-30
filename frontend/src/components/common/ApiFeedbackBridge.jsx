import { useEffect } from "react";
import { useFeedback } from "../../hooks/useFeedback";

/** Hiển thị thông báo cho sự kiện toàn cục do httpClient phát ra (403 không có quyền). */
export const ApiFeedbackBridge = () => {
  const feedback = useFeedback();

  useEffect(() => {
    const handleForbidden = (event) => {
      feedback.error(event.detail?.message || "Bạn không có quyền thực hiện thao tác này", "Lỗi quyền truy cập");
    };
    window.addEventListener("api-forbidden", handleForbidden);
    return () => window.removeEventListener("api-forbidden", handleForbidden);
  }, [feedback]);

  return null;
};
