import { useEffect, useRef, useState } from "react";

interface useWebSocketProps {
  durableObjectId: string;
  onMessage?: (message: string) => void;
}
export function useWebSocket({
  durableObjectId,
  onMessage,
}: useWebSocketProps) {
  const wsRef = useRef<WebSocket | null>(null);
  const [connectionStatus, setConnectionStatus] = useState<
    "connecting" | "connected" | "disconnected"
  >("disconnected");

  const connect = () => {
    // Determine the WebSocket URL based on the current protocol
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const wsUrl = `${protocol}//${window.location.host}/websocket?durableObjectId=${durableObjectId}`;

    setConnectionStatus("connecting");
    const ws = new WebSocket(wsUrl);

    ws.onopen = () => {
      setConnectionStatus("connected");
    };

    ws.onmessage = (event) => {
      onMessage?.(event.data);
    };

    ws.onerror = (error) => {
      console.error("WebSocket error:", error);
      setConnectionStatus("disconnected");
    };

    ws.onclose = () => {
      console.log("WebSocket closed");
      setConnectionStatus("disconnected");
      wsRef.current = null;
    };

    wsRef.current = ws;
  };

  const sendMessage = (message: string) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(message);
    } else {
      console.error("WebSocket is not connected");
    }
  };

  // Clean up WebSocket connection when component unmounts
  useEffect(() => {
    return () => {
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, []);

  return {
    connect,
    sendMessage,
    connectionStatus,
  };
}
