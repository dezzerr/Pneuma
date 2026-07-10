import { useEffect, useRef } from "react";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";

export function useTauriEvent<T>(eventName: string, handler: (payload: T) => void) {
  const handlerRef = useRef(handler);
  handlerRef.current = handler;

  useEffect(() => {
    let unlisten: UnlistenFn | undefined;
    let mounted = true;

    listen<T>(eventName, (event) => {
      if (mounted) {
        handlerRef.current(event.payload);
      }
    })
      .then((fn) => {
        if (mounted) {
          unlisten = fn;
        } else {
          fn();
        }
      })
      .catch((err) => {
        console.warn(`[useTauriEvent] Failed to listen for "${eventName}":`, err);
      });

    return () => {
      mounted = false;
      unlisten?.();
    };
  }, [eventName]);
}
