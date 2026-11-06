// Keeps a panel mounted through its exit animation. `open` drives both the
// mount and the entered style, so plain CSS transitions can run in either
// direction without a second state machine at every call site.

import { useEffect, useState } from "@deskulpt-test/react";

export function usePresence(open, exitMs) {
  const [mounted, setMounted] = useState(false);
  const [shown, setShown] = useState(false);

  useEffect(() => {
    if (!open) {
      setShown(false);
      const timer = setTimeout(() => setMounted(false), exitMs);
      return () => clearTimeout(timer);
    }
    setMounted(true);
    // Two frames so the hidden style is painted before the entered one;
    // a single frame can land in the same paint and skip the transition.
    let inner = 0;
    const outer = requestAnimationFrame(() => {
      inner = requestAnimationFrame(() => setShown(true));
    });
    return () => {
      cancelAnimationFrame(outer);
      cancelAnimationFrame(inner);
    };
  }, [open, exitMs]);

  return { mounted, shown };
}
