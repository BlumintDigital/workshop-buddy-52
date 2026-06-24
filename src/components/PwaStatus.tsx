import { useEffect, useRef, useState } from "react";
import { WifiOff } from "lucide-react";
import { toast } from "sonner";
import { useRegisterSW } from "virtual:pwa-register/react";

export function PwaStatus() {
  const [online, setOnline] = useState(() => navigator.onLine);
  const updateToastShown = useRef(false);

  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisterError(error) {
      console.error("Service worker registration failed", error);
    },
  });

  useEffect(() => {
    const handleOnline = () => {
      setOnline(true);
      toast.success("Connection restored");
    };
    const handleOffline = () => setOnline(false);

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  useEffect(() => {
    if (!needRefresh || updateToastShown.current) return;

    updateToastShown.current = true;
    toast("A new version is available", {
      description: "Refresh to use the latest Workshop Manager.",
      duration: Infinity,
      action: {
        label: "Refresh",
        onClick: () => updateServiceWorker(true),
      },
      cancel: {
        label: "Later",
        onClick: () => {
          setNeedRefresh(false);
          updateToastShown.current = false;
        },
      },
    });
  }, [needRefresh, setNeedRefresh, updateServiceWorker]);

  if (online) return null;

  return (
    <div
      role="status"
      className="fixed bottom-4 left-1/2 z-[100] flex -translate-x-1/2 items-center gap-2 rounded-full bg-slate-900 px-4 py-2 text-sm font-medium text-white shadow-lg dark:bg-slate-100 dark:text-slate-900"
    >
      <WifiOff className="h-4 w-4" />
      Offline — workshop data is unavailable
    </div>
  );
}
