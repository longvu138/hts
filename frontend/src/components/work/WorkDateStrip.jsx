import { useState } from "react";
import { Button, Checkbox, DatePicker, Drawer, Segmented, Space, Tooltip, Typography } from "antd";
import { CalendarOutlined, LeftOutlined, RightOutlined, DownOutlined } from "@ant-design/icons";
import dayjs from "dayjs";
import { WORK_DATE_FORMAT, WORK_MINUTE_STEP } from "../../constants/workOptions";
import { daysBetween, nextDate, nowInput, rangeTooLong, today, workDatePresets } from "../../utils/workTime";
import { isWeekend, scheduleDays } from "../../utils/workCalendar";
import { useIsMobile } from "../../hooks/useMediaQuery";

const ISO_DATE = "YYYY-MM-DD";
const toIso = (value) => value.format(ISO_DATE);
const tooLong = (current, from) => Boolean(current && from && rangeTooLong(toIso(from), toIso(current)));
const QUICK_RANGES = ["Ngày mai", "Tuần này", "Tuần sau"];

// Compact date navigation: ‹ day › + Hôm nay. Single day by default; a range is an explicit choice.
export const WorkDateStrip = ({ mode, from, to, at, onChange, calendarDays = [], showWeekend, onWeekendChange }) => {
  const small = useIsMobile();
  const [rangeChosen, setRangeChosen] = useState(false);
  const [open, setOpen] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [customRange, setCustomRange] = useState(false);
  // A range choice belongs to the view it was made in; switching view starts on a single day again.
  const [shownMode, setShownMode] = useState(mode);
  if (shownMode !== mode) {
    setShownMode(mode);
    setCustomRange(false);
    setSheetOpen(false);
    setRangeChosen(false);
  }
  const situation = mode === "situation";
  const rangeMode = !situation && (rangeChosen || from !== to);
  const span = situation ? (small ? 1 : 7) : daysBetween(from, to) + 1;
  const presets = workDatePresets();

  const setRange = (start, end) => onChange({ from: start, to: end });
  const shift = (direction) => {
    if (situation) return onChange({ at: `${nextDate(at.slice(0, 10), direction * span)}${at.slice(10)}` });
    return setRange(nextDate(from, direction * span), nextDate(to, direction * span));
  };
  const goToday = () => {
    setCustomRange(false);
    setRangeChosen(false);
    onChange(situation ? { at: nowInput(WORK_MINUTE_STEP) } : { from: today(), to: today() });
  };
  const applyPreset = (label) => {
    const preset = presets.find((item) => item.label === label);
    if (!preset) return;
    const [start, end] = preset.value();
    setOpen(false);
    if (toIso(start) !== toIso(end)) setRangeChosen(true);
    setRange(toIso(start), toIso(end));
  };
  const singleDay = () => {
    setRangeChosen(false);
    setRange(from, from);
  };
  // Monday–Sunday of the shown day; ‹ › then move by a whole week because the span is 7.
  const week = situation ? [] : scheduleDays(from, false);
  const isWeek = !situation && from === week[0] && to === week[6];
  const setSpan = (value) => {
    if (value === "week") {
      setRangeChosen(true);
      return setRange(week[0], week[6]);
    }
    const day = today() >= from && today() <= to ? today() : from;
    setRangeChosen(false);
    return setRange(day, day);
  };
  const isToday = situation ? at.slice(0, 10) === today() : from === today() && to === today();
  const pickerProps = { allowClear: false, placeholder: "Chọn ngày", format: WORK_DATE_FORMAT, inputReadOnly: small, placement: "bottomLeft", classNames: { popup: { root: "work-date-popup" } } };

  const dayFooter = () => (
    <Space wrap size={[4, 4]} className="work-date-footer">
      {QUICK_RANGES.map((label) => (
        <Button key={label} size="small" type="text" onClick={() => applyPreset(label)}>{label}</Button>
      ))}
      <Button size="small" type="link" onClick={() => { setOpen(false); setRangeChosen(true); }}>Chọn khoảng ngày…</Button>
    </Space>
  );

  let picker;
  if (situation) {
    picker = <DatePicker {...pickerProps} id="work-date" aria-label="Ngày xem lịch" className="work-date-input"
      value={dayjs(at.slice(0, 10))} onChange={value => value && onChange({ at: `${toIso(value)}${at.slice(10)}` })} />;
  } else if (!rangeMode) {
    picker = (
      <DatePicker
        {...pickerProps}
        id="work-date-from"
        aria-label="Ngày làm việc"
        className="work-date-input"
        open={open}
        onOpenChange={setOpen}
        value={dayjs(from)}
        renderExtraFooter={dayFooter}
        onChange={(value) => value && setRange(toIso(value), toIso(value))}
      />
    );
  } else {
    picker = (
      <DatePicker.RangePicker
        {...pickerProps}
        id={{ start: "work-date-from", end: "work-date-to" }}
        placeholder={["Từ ngày", "Đến ngày"]}
        className="work-range-input"
        value={[dayjs(from), dayjs(to)]}
        presets={presets}
        onChange={(values) => {
          if (values?.[0] && values?.[1]) setRange(toIso(values[0]), toIso(values[1]));
        }}
        disabledDate={(current, info) => tooLong(current, info.from)}
        classNames={{ popup: { root: "work-date-popup" } }}
      />
    );
  }

  const back = span === 1 ? "Ngày trước" : (isWeek || situation) ? "Tuần trước" : `Lùi ${span} ngày`;
  const forward = span === 1 ? "Ngày sau" : (isWeek || situation) ? "Tuần sau" : `Tới ${span} ngày`;
  if (small) {
    const selectedDay = situation ? at.slice(0, 10) : from;
    const dateLabel = rangeMode ? `${dayjs(from).format("DD/MM")} – ${dayjs(to).format("DD/MM")}` : dayjs(selectedDay).format(WORK_DATE_FORMAT);
    const selection = customRange ? "range" : rangeMode ? (isWeek ? "week" : "range") : "day";
    const mobilePickerProps = { ...pickerProps, className: "work-sheet-date-input" };
    return <>
      <div className={`work-date-strip work-date-strip-mobile work-date-strip-${situation ? "calendar" : rangeMode ? "range" : "day"}`} role="group" aria-label="Điều hướng ngày">
        <Button className="work-date-prev" icon={<LeftOutlined aria-hidden />} aria-label={back} onClick={() => shift(-1)} />
        <Button className="work-date-summary" aria-label={`Chọn thời gian: ${dateLabel}`} aria-haspopup="dialog" aria-expanded={sheetOpen} onClick={() => setSheetOpen(true)}>
          <span>{dateLabel}</span><DownOutlined aria-hidden />
        </Button>
        <Button className="work-date-next" icon={<RightOutlined aria-hidden />} aria-label={forward} onClick={() => shift(1)} />
        <Button className="work-date-today" type={isToday ? "default" : "primary"} ghost={!isToday} onClick={goToday}>Hôm nay</Button>
      </div>
      <Drawer title="Thời gian" placement="bottom" size="auto" rootClassName="work-filter-drawer work-date-drawer" className="mobile-profile-sheet-drawer"
        open={sheetOpen} onClose={() => setSheetOpen(false)}
        styles={{ body: { padding: 16 }, footer: { padding: "12px 16px max(12px, env(safe-area-inset-bottom))" } }}
        footer={<Button block type="primary" onClick={() => setSheetOpen(false)}>Xong</Button>}>
        <div className="work-filter-sheet-fields">
          {!situation && <Segmented block aria-label="Xem theo" value={selection} options={[{ value: "day", label: "Ngày" }, { value: "week", label: "Tuần" }, { value: "range", label: "Khoảng ngày" }]}
            onChange={value => { setCustomRange(value === "range"); if (value === "range") setRangeChosen(true); else setSpan(value); }} />}
          {selection === "range" && !situation ? <>
            <label className="work-filter-field">Từ ngày<DatePicker {...mobilePickerProps} placeholder="Từ ngày" aria-label="Từ ngày" value={dayjs(from)}
              onChange={value => value && setRange(toIso(value), value.isAfter(dayjs(to)) || tooLong(dayjs(to), value) ? toIso(value) : to)} /></label>
            <label className="work-filter-field">Đến ngày<DatePicker {...mobilePickerProps} placeholder="Đến ngày" aria-label="Đến ngày" value={dayjs(to)}
              disabledDate={current => current.isBefore(dayjs(from), "day") || tooLong(current, dayjs(from))}
              onChange={value => value && setRange(from, toIso(value))} /></label>
          </> : <label className="work-filter-field">{selection === "week" && !situation ? "Chọn ngày trong tuần" : "Chọn ngày"}
            <DatePicker {...mobilePickerProps} suffixIcon={<CalendarOutlined />} aria-label={situation ? "Ngày xem lịch" : "Ngày làm việc"} value={dayjs(selectedDay)}
              onChange={value => {
                if (!value) return;
                if (situation) return onChange({ at: `${toIso(value)}${at.slice(10)}` });
                if (selection === "week") { const days = scheduleDays(toIso(value), false); return setRange(days[0], days[6]); }
                setRange(toIso(value), toIso(value));
              }} />
          </label>}
        </div>
      </Drawer>
    </>;
  }
  return (
    <div className={`work-date-strip${situation ? " work-calendar-toolbar" : ""} work-date-strip-${situation ? "calendar" : rangeMode ? "range" : "day"}`} role="group" aria-label="Điều hướng ngày">
      <Button className="work-date-prev" icon={<LeftOutlined aria-hidden />} aria-label={back} onClick={() => shift(-1)} />
      {picker}
      <Button className="work-date-next" icon={<RightOutlined aria-hidden />} aria-label={forward} onClick={() => shift(1)} />
      <Button className="work-date-today" type={isToday ? "default" : "primary"} ghost={!isToday} onClick={goToday}>
        Hôm nay
      </Button>
      {situation && !small && calendarDays.length ? <Space wrap size={8} className="work-calendar-week-options">
        <Typography.Text type="secondary">{dayjs(calendarDays[0]).format('DD/MM')} – {dayjs(calendarDays[showWeekend || isWeekend(at) ? calendarDays.length - 1 : 4]).format('DD/MM/YYYY')}</Typography.Text>
        <Tooltip title={isWeekend(at) ? "Ngày đang chọn là cuối tuần nên luôn hiển thị" : undefined}><span><Checkbox checked={showWeekend || isWeekend(at)} disabled={isWeekend(at)} onChange={event => onWeekendChange?.(event.target.checked)}>Thứ Bảy, Chủ nhật</Checkbox></span></Tooltip>
      </Space> : null}
      {!situation && (!rangeMode || isWeek) ? (
        <Segmented className="work-date-span" aria-label="Xem theo" value={isWeek ? "week" : "day"} onChange={setSpan}
          options={[{ value: "day", label: "Ngày" }, { value: "week", label: "Tuần" }]} />
      ) : rangeMode ? <Button className="work-date-single" type="link" onClick={singleDay}>Một ngày</Button> : null}
    </div>
  );
};
