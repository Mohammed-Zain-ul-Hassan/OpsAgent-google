import { useState, useRef } from 'react';

export function useAgentStream() {
  const [logs, setLogs] = useState<string>("");
  const [isStreaming, setIsStreaming] = useState(false);
  const eventSourceRef = useRef<EventSource | null>(null);

  const startStream = (prompt: string) => {
    setLogs("");
    setIsStreaming(true);

    // Connect to backend
    const url = `http://localhost:8000/stream-test?prompt=${encodeURIComponent(prompt)}`;
    const eventSource = new EventSource(url);
    eventSourceRef.current = eventSource;

    eventSource.onmessage = (event) => {
      // SSE sends "data: <content>", we just append it
      setLogs((prev) => prev + event.data);
    };

    eventSource.onerror = (err) => {
      console.error("Stream error:", err);
      eventSource.close();
      setIsStreaming(false);
    };

    // Optional: If the backend sends a specific "end" signal, you can close here too
  };

  const stopStream = () => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      setIsStreaming(false);
    }
  };

  return { logs, startStream, stopStream, isStreaming };
}