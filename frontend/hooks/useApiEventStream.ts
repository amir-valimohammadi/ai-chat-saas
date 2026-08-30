"use client";

import { useEffect, useRef } from "react";
import { apiEventStream, type ApiEventStreamMessage } from "@/lib/api";

type UseApiEventStreamOptions = {
  path: string | null;
  enabled?: boolean;
  auth?: boolean;
  fallbackIntervalMs?: number;
  onEvent: (message: ApiEventStreamMessage) => void;
  onFallbackTick?: () => void;
};

export function useApiEventStream({
  path,
  enabled = true,
  auth = true,
  fallbackIntervalMs = 5000,
  onEvent,
  onFallbackTick,
}: UseApiEventStreamOptions) {
  const onEventRef = useRef(onEvent);
  const onFallbackTickRef = useRef(onFallbackTick);

  useEffect(() => {
    onEventRef.current = onEvent;
    onFallbackTickRef.current = onFallbackTick;
  });

  useEffect(() => {
    if (!enabled || !path) return;

    let stopped = false;
    let controller: AbortController | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let fallbackTimer: ReturnType<typeof setInterval> | null = null;
    let failureCount = 0;
    let requestedReconnectDelay: number | null = null;
    let lastDeliveredEventKey = "";
    let lastEventId: string | null = null;

    const stopFallback = () => {
      if (fallbackTimer) {
        clearInterval(fallbackTimer);
        fallbackTimer = null;
      }
    };

    const startFallback = () => {
      if (fallbackTimer || !onFallbackTickRef.current) return;
      onFallbackTickRef.current();
      fallbackTimer = setInterval(() => {
        onFallbackTickRef.current?.();
      }, Math.max(2000, fallbackIntervalMs));
    };

    const scheduleReconnect = (delayMs: number) => {
      if (stopped) return;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      reconnectTimer = setTimeout(connect, Math.max(100, delayMs));
    };

    const connect = async () => {
      if (stopped) return;
      controller = new AbortController();
      requestedReconnectDelay = null;

      try {
        await apiEventStream(path, {
          signal: controller.signal,
          auth,
          lastEventId,
          onOpen: () => {
            failureCount = 0;
            stopFallback();
          },
          onEvent: (message) => {
            if (message.event === "reconnect") {
              const data = message.data as { retry_after_ms?: unknown } | null;
              const retryAfter = Number(data?.retry_after_ms);
              requestedReconnectDelay = Number.isFinite(retryAfter) ? retryAfter : 250;
              controller?.abort();
              return;
            }

            if (message.event === "stream.error") {
              requestedReconnectDelay = 1000;
              startFallback();
              controller?.abort();
              return;
            }

            const eventKey = message.id ? `${message.event}:${message.id}` : "";
            if (eventKey && eventKey === lastDeliveredEventKey) return;
            if (eventKey) lastDeliveredEventKey = eventKey;
            if (message.id && /^[a-f0-9]{64}$/i.test(message.id)) {
              lastEventId = message.id;
            }
            onEventRef.current(message);
          },
        });

        scheduleReconnect(requestedReconnectDelay ?? 250);
      } catch (error) {
        if (stopped) return;
        if (controller.signal.aborted && requestedReconnectDelay !== null) {
          scheduleReconnect(requestedReconnectDelay);
          return;
        }
        if (error instanceof DOMException && error.name === "AbortError") return;

        failureCount += 1;
        startFallback();
        scheduleReconnect(Math.min(15000, 1000 * 2 ** Math.min(failureCount - 1, 4)));
      }
    };

    void connect();

    return () => {
      stopped = true;
      controller?.abort();
      if (reconnectTimer) clearTimeout(reconnectTimer);
      stopFallback();
    };
  }, [auth, enabled, fallbackIntervalMs, path]);
}
