import { useEffect, useState } from "react";
import { useUiStore } from "@/state/ui";

export function Toast() {
  const toast = useUiStore((s) => s.toast);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    if (!toast) return;
    setVisible(true);
    const timer = setTimeout(() => setVisible(false), 3200);
    return () => clearTimeout(timer);
  }, [toast]);
  return <div className={`toast${visible ? " is-visible" : ""}`} role="status" aria-live="polite">{toast?.text}</div>;
}
