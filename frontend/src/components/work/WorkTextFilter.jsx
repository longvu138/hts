import { useEffect, useRef, useState } from "react";
import { Input } from "antd";

// Text filter whose value lives in the URL. Binding the input straight to the URL drops keystrokes
// and breaks Vietnamese IME/Telex composition ("kiểm" became "kim"), so the input keeps its own state,
// commits outside composition, and takes the URL value only while not being edited
// (e.g. after "Xóa bộ lọc"), because URL echoes of earlier keystrokes may arrive late.
export const WorkTextFilter = ({ value = "", onCommit, ...props }) => {
  const [text, setText] = useState(value);
  const editing = useRef(false);
  const composing = useRef(false);

  useEffect(() => {
    if (!editing.current) setText(value);
  }, [value]);

  return (
    <Input
      {...props}
      value={text}
      onFocus={() => { editing.current = true; }}
      onBlur={() => { editing.current = false; }}
      onChange={(event) => {
        const next = event.target.value;
        setText(next);
        if (!composing.current) onCommit?.(next);
      }}
      onCompositionStart={() => { composing.current = true; }}
      onCompositionEnd={(event) => {
        composing.current = false;
        onCommit?.(event.currentTarget.value);
      }}
    />
  );
};
