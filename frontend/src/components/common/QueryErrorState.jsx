import { Alert, Button, Typography } from "antd";
import { ReloadOutlined } from "@ant-design/icons";
import { getApiErrorMessage, getApiRequestId } from "../../utils/apiError";

const DEFAULT_DESCRIPTION = "Vui lòng kiểm tra kết nối và thử lại.";

/**
 * Trạng thái lỗi tải dữ liệu dùng chung. Truyền `error` (lỗi axios/React Query) để tự hiển thị
 * thông điệp thân thiện cho lỗi 5xx/mất mạng và "Mã tra cứu" khi máy chủ trả về X-Request-Id.
 * `description` vẫn được dùng cho lỗi 4xx không có message hoặc khi không truyền `error`.
 */
export const QueryErrorState = ({
  title = "Không tải được dữ liệu",
  description,
  error,
  onRetry,
  retrying = false,
}) => {
  const fallback = description || DEFAULT_DESCRIPTION;
  const message = error ? getApiErrorMessage(error, fallback) : fallback;
  const requestId = error ? getApiRequestId(error) : "";
  return (
    <Alert
      type="error"
      showIcon
      title={title}
      description={
        requestId ? (
          <>
            <div>{message}</div>
            <Typography.Text type="secondary" copyable={{ text: requestId, tooltips: ["Sao chép mã", "Đã sao chép"] }} style={{ fontSize: 13 }}>
              Mã tra cứu: {requestId}
            </Typography.Text>
          </>
        ) : message
      }
      action={onRetry ? (
        <Button aria-label="Thử lại" icon={<ReloadOutlined />} loading={retrying} onClick={onRetry}>
          Thử lại
        </Button>
      ) : null}
    />
  );
};
