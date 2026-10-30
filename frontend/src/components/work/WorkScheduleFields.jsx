import { Checkbox, DatePicker, Form, Radio, TimePicker, Typography } from "antd";
import dayjs from "dayjs";
import { WORK_DATE_FORMAT, WORK_MINUTE_STEP, WORK_PERIODS, WORK_TIME_FORMAT } from "../../constants/workOptions";
import { workFormTimes } from "../../utils/workForm";
import { nextDate, today } from "../../utils/workTime";
import { useIsMobile } from "../../hooks/useMediaQuery";

const required = [{ required: true, message: "Vui lòng chọn thời gian" }];
const ISO_DATE = "YYYY-MM-DD";
// Presets in reading order: Sáng, Chiều, Cả ngày, then Tùy chọn.
const PERIOD_OPTIONS = WORK_PERIODS.map(({ value, label }) => ({ value, label }));

// The form keeps plain strings (YYYY-MM-DD / HH:mm) so workForm utils stay framework-free.
const dateProps = {
  getValueProps: (value) => ({ value: value ? dayjs(value) : null }),
  normalize: (value) => value ? value.format(ISO_DATE) : "",
};
const timeProps = {
  getValueProps: (value) => ({ value: value ? dayjs(`2000-01-01T${value}`) : null }),
  normalize: (value) => value ? value.format(WORK_TIME_FORMAT) : "",
};

// Commit on every hour/minute pick: the picker otherwise applies the value only when its popup closes,
// so tapping "Tạo việc" while the popup is open (common on mobile) would submit the old time.
const TimeInput = ({ onChange, ...props }) => (
  <TimePicker
    {...props}
    onChange={onChange}
    onCalendarChange={(value) => { if (value) onChange?.(value); }}
    className="full-width"
    format={WORK_TIME_FORMAT}
    minuteStep={WORK_MINUTE_STEP}
    needConfirm={false}
    showNow={false}
    allowClear={false}
  />
);

export const WorkScheduleFields = ({ form, onUserChange }) => {
  const small = useIsMobile();
  const period = Form.useWatch("period", form) || "morning";
  const overnight = Form.useWatch("overnight", form);
  const date = Form.useWatch("date", form);
  const preset = WORK_PERIODS.find((item) => item.value === period);
  const syncEndDate = (value, isOvernight) => form.setFieldValue("endDate", value && isOvernight ? nextDate(value) : value);
  const quickDays = [{ label: "Hôm nay", value: today() }, { label: "Ngày mai", value: nextDate(today()) }];
  const pickDay = (value) => {
    onUserChange?.();
    form.setFieldValue("date", value);
    syncEndDate(value, form.getFieldValue("overnight"));
  };

  return (
    <>
      <Form.Item label="Ngày làm việc" htmlFor="work-editor-date" required className="work-date-field">
        <div className="work-date-row">
          <Form.Item name="date" noStyle rules={required} {...dateProps}>
            <DatePicker
              id="work-editor-date"
              className="work-date-picker"
              format={WORK_DATE_FORMAT}
              allowClear={false}
              inputReadOnly={small}
              placement="bottomLeft"
              onChange={(value) => value && syncEndDate(value.format(ISO_DATE), form.getFieldValue("overnight"))}
            />
          </Form.Item>
          <Radio.Group className="work-date-chips" aria-label="Chọn nhanh ngày" optionType="button" buttonStyle="solid"
            value={date} options={quickDays} onChange={event => pickDay(event.target.value)} />
        </div>
      </Form.Item>
      <Form.Item name="period" label="Thời gian" rules={required}>
        <Radio.Group
          className="work-period-options"
          optionType="button"
          buttonStyle="solid"
          options={PERIOD_OPTIONS}
          onChange={(event) => {
            const chosen = WORK_PERIODS.find((option) => option.value === event.target.value);
            if (chosen?.start) {
              form.setFieldsValue({ startTime: chosen.start, endTime: chosen.end, overnight: false, endDate: form.getFieldValue("date") });
            }
          }}
        />
      </Form.Item>
      {period !== "custom" ? (
        <Typography.Paragraph type="secondary">
          {preset?.label}: {preset?.start}–{preset?.end} · Giờ Việt Nam{period === "day" ? " (giữ lịch cả khoảng 08:00–17:00)" : ""}
        </Typography.Paragraph>
      ) : (
        <>
          <div className={`work-form-grid${overnight ? " work-form-grid-3" : ""}`}>
            <Form.Item name="startTime" label="Giờ bắt đầu" rules={required} {...timeProps}>
              <TimeInput inputReadOnly={small} />
            </Form.Item>
            <Form.Item
              name="endTime"
              label="Giờ kết thúc"
              dependencies={["date", "endDate", "startTime", "period", "overnight"]}
              {...timeProps}
              rules={[...required, ({ getFieldsValue }) => ({
                validator: async () => {
                  const values = getFieldsValue();
                  if (values.date && values.endDate && values.startTime && values.endTime) {
                    const times = workFormTimes(values);
                    if (times.startsAt >= times.endsAt) {
                      throw new Error(values.overnight
                        ? "Thời gian kết thúc phải sau thời gian bắt đầu"
                        : "Thời gian kết thúc phải sau thời gian bắt đầu — chọn \"Qua ngày hôm sau\" nếu làm qua đêm");
                    }
                  }
                },
              })]}
            >
              <TimeInput inputReadOnly={small} />
            </Form.Item>
            {overnight ? (
              <Form.Item name="endDate" label="Ngày kết thúc" rules={required} {...dateProps}>
                <DatePicker
                  className="full-width"
                  format={WORK_DATE_FORMAT}
                  allowClear={false}
                  inputReadOnly={small}
                  placement="bottomLeft"
                  disabledDate={(current) => current.isBefore(dayjs(form.getFieldValue("date")), "day")}
                />
              </Form.Item>
            ) : (
              <Form.Item name="endDate" hidden><input /></Form.Item>
            )}
          </div>
          <Form.Item name="overnight" valuePropName="checked" className="work-overnight">
            <Checkbox onChange={(event) => syncEndDate(form.getFieldValue("date"), event.target.checked)}>
              Qua ngày hôm sau
            </Checkbox>
          </Form.Item>
        </>
      )}
    </>
  );
};
