import { UNSTABLE_ToastQueue as ToastQueue } from "react-aria-components";
import { flushSync } from "react-dom";
import type { ToastType } from "../components/Toast";

// Create a global ToastQueue.
export const toastQueue = new ToastQueue<ToastType>({
  // Wrap state updates in a CSS view transition.
  wrapUpdate(fn: () => void) {
    if ("startViewTransition" in document) {
      document.startViewTransition(() => {
        flushSync(fn);
      });
    } else {
      fn();
    }
  },
});
