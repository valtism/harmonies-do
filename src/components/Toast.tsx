import clsx from "clsx";
import {
  Button,
  type QueuedToast,
  Text,
  UNSTABLE_Toast as Toast,
  UNSTABLE_ToastContent as ToastContent,
  UNSTABLE_ToastRegion as ToastRegion,
} from "react-aria-components";
import { toastQueue } from "../components/toastQueue";

// Define the type for your toast content.
export interface ToastType {
  type: "error";
  message: string;
}

export function Toasts() {
  return (
    <ToastRegion
      queue={toastQueue}
      className="fixed right-4 bottom-4 flex flex-col-reverse gap-2"
    >
      {({ toast }) => <ToastItem toast={toast} />}
    </ToastRegion>
  );
}

function ToastItem({ toast }: { toast: QueuedToast<ToastType> }) {
  return (
    <Toast
      toast={toast}
      style={{ viewTransitionName: toast.key }}
      className={({ defaultClassName }) =>
        clsx(
          defaultClassName,
          "flex items-center gap-2 rounded bg-red-500 px-4 py-2",
        )
      }
    >
      <Button
        slot="close"
        className="flex size-6 items-center justify-center rounded-lg hover:bg-white/20"
      >
        <svg
          width="16"
          height="16"
          viewBox="0 0 16 16"
          fill="white"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path
            fillRule="evenodd"
            clipRule="evenodd"
            d="M3.00012 2.2929L3.35368 2.64645L8.00006 7.29288L12.6466 2.64645L13.0001 2.2929L13.7072 3.00001L13.3537 3.35356L8.70717 7.99999L13.3537 12.6464L13.7072 13L13.0001 13.7071L12.6466 13.3536L8.00006 8.7071L3.35367 13.3535L3.00012 13.7071L2.29301 13L2.64656 12.6464L7.29296 7.99999L2.64657 3.35356L2.29301 3L3.00012 2.2929Z"
          />
        </svg>
      </Button>
      <ToastContent>
        {/* <Text slot="title">{toast.content.title}</Text> */}
        <Text slot="description">{toast.content.message}</Text>
      </ToastContent>
    </Toast>
  );
}
