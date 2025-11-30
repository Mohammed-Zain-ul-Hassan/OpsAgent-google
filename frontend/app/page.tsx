"use client";
import { useState, useEffect, useRef } from "react";
import { useSearchParams } from "next/navigation";
import { useVoice } from "../hooks/useVoice";
import { Terminal, FileCode, ShieldAlert, Cpu, Play, Mic, MicOff } from "lucide-react";
import RunbookUpload from "@/components/RunbookUpload";

export default function Dashboard() {
  const [prompt, setPrompt] = useState("");
  const [logs, setLogs] = useState<string[]>([]);
  const [files, setFiles] = useState<string[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [showApproval, setShowApproval] = useState(false); // <--- NEW STATE
  const logsEndRef = useRef<HTMLDivElement>(null);
  const responseBuffer = useRef("");
  const [metrics, setMetrics] = useState<any>(null);
  const [pendingRequests, setPendingRequests] = useState<any[]>([]);
  const { isListening, transcript, startListening, stopListening, speak, setTranscript } = useVoice();
  // PREVIOUS STATE TRACKING to prevent looping speech
  const prevPendingRef = useRef(0);
  // Ref to track the last spoken log index
  const lastSpokenIndex = useRef(0);

  useEffect(() => {
    fetchFiles();
    fetchMetrics(); // <--- Initial Call
    fetchApprovals();

    const interval = setInterval(() => {
      fetchFiles();
      fetchMetrics(); // <--- Poll every 2 seconds
      fetchApprovals();
    }, 2000);

    return () => clearInterval(interval);
  }, []);

  const fetchMetrics = async () => {
    try {
      const res = await fetch("http://localhost:8000/system-status");
      const data = await res.json();
      setMetrics(data);
    } catch (e) {
      // silent fail
    }
  };

  const fetchApprovals = async () => {
    try {
      const res = await fetch("http://localhost:8000/approvals");
      const data = await res.json();
      // Filter only PENDING ones
      const pending = data.requests.filter((r: any) => r.status === "PENDING");
      setPendingRequests(pending);
    } catch (e) {
      // silent fail
    }
  };

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);

    if (params.get("action") === "review_incident") {
      setLogs((prev) => [...prev, "> SYSTEM: Analyzing Deep Link request..."]);

      // VERIFY: Don't just show the modal. Check the actual server status.
      fetch("http://localhost:8000/system-status")
        .then((res) => res.json())
        .then((data) => {
          // Check if it is ACTUALLY critical
          if (data.active_connections > 1000) {
            setShowApproval(true);
            setLogs((prev) => [...prev, "> ALERT: Critical State Confirmed. Authorization Required."]);
          } else {
            // It's already fixed!
            setLogs((prev) => [...prev, "> SYSTEM: Incident appears resolved. No action needed."]);
          }
        })
        .catch(() => {
          setLogs((prev) => [...prev, "> ERROR: Could not verify system status."]);
        });
    }
  }, []);

  // EFFECT: When voice transcript arrives, auto-send it
  useEffect(() => {
    if (transcript) {
      sendCommand(transcript); // Send to backend
      setTranscript("");     // Reset
    }
  }, [transcript]);

  // Add this effect to Dashboard
  useEffect(() => {
    const currentCount = pendingRequests.length;
    const prevCount = prevPendingRef.current;

    // Only speak if the number of requests INCREASED
    if (currentCount > prevCount) {
      console.log("🔔 Triggering Voice Alert...");
      speak("Attention commander. A critical action requires your approval.");
    }

    prevPendingRef.current = currentCount;
  }, [pendingRequests, speak]);

  // Ref to track the current speaking state
  const isSpeakingRef = useRef(false);

  // RE-WRITE OF THE LOGIC TO FIX CUT-OFF
  useEffect(() => {
    const lastLog = logs[logs.length - 1];
    if (!lastLog) return;

    if (lastLog.startsWith("> AGENT:") && !lastLog.includes("[AWAITING_APPROVAL]")) {
      // DEBOUNCE: Wait 1 second after the last update to speak.
      // This ensures we speak the "mostly complete" sentence.
      const timeoutId = setTimeout(() => {
        const text = lastLog.replace("> AGENT:", "").trim();
        speak(text);
      }, 1000);

      return () => clearTimeout(timeoutId);
    }
  }, [logs, speak]);

  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [logs]);

  const fetchFiles = async () => {
    try {
      const res = await fetch("http://localhost:8000/files");
      const data = await res.json();
      setFiles(data.files || []);
    } catch (e) {
      console.error("Agent offline", e);
    }
  };

  // REFACTORED: Now accepts an optional argument
  const sendCommand = (manualCommand?: string) => {
    const commandToSend = manualCommand || prompt;
    if (!commandToSend) return;

    setIsProcessing(true);
    setLogs((prev) => [...prev, `> USER: ${commandToSend}`]);

    // RESET THE BUFFER FOR NEW COMMAND
    responseBuffer.current = "";

    const eventSource = new EventSource(
      `http://localhost:8000/stream-test?prompt=${encodeURIComponent(commandToSend)}`
    );

    eventSource.onmessage = (event) => {
      let cleanData = event.data.replace(/<br\/>/g, "\n");

      // 1. ACCUMULATE THE DATA
      responseBuffer.current += cleanData;

      // 2. CHECK THE ACCUMULATED BUFFER (The Fix)
      if (responseBuffer.current.includes("[AWAITING_APPROVAL]")) {
        setShowApproval(true);
      }

      setLogs((prev) => {
        const lastLog = prev[prev.length - 1];
        if (lastLog && lastLog.startsWith("> AGENT:")) {
          const newLogs = [...prev];
          newLogs[newLogs.length - 1] = lastLog + cleanData;
          return newLogs;
        } else {
          return [...prev, `> AGENT: ${cleanData}`];
        }
      });
    };

    eventSource.onerror = () => {
      eventSource.close();
      setIsProcessing(false);
      fetchFiles();
    };

    setPrompt("");
  };
  return (
    <div className="min-h-screen bg-neutral-950 text-green-500 font-mono p-4 flex gap-4 overflow-hidden h-screen relative">

      {/* LEFT PANEL */}
      <div className="w-1/4 border border-green-900 bg-black/50 p-4 rounded-lg flex flex-col">
        <div className="flex items-center gap-2 mb-4 border-b border-green-900 pb-2">
          <FileCode size={20} />
          <h2 className="font-bold tracking-widest">WORKSPACE</h2>
        </div>
        <div className="flex-1 overflow-y-auto space-y-2 pr-2 custom-scrollbar">
          {files.map((file, i) => (
            <div key={i} className="flex items-center gap-2 p-2 bg-green-900/10 rounded">
              <span className="text-xs">📄</span>
              <span className="text-sm truncate">{file}</span>
            </div>
          ))}
        </div>
        <RunbookUpload />
      </div>

      {/* CENTER PANEL */}
      <div className="flex-1 border border-green-900 bg-black rounded-lg flex flex-col relative">
        <div className="absolute top-0 left-0 w-full bg-green-900/20 p-2 flex justify-between items-center border-b border-green-900 backdrop-blur-sm z-10">
          <div className="flex gap-2 items-center">
            <Terminal size={18} />
            <span className="text-sm font-bold tracking-widest">OPS-GUARDIAN v3.0</span>
          </div>
          {isProcessing && <span className="animate-pulse text-xs bg-green-500 text-black px-2 py-0.5 rounded font-bold">PROCESSING</span>}
        </div>

        <div className="flex-1 p-4 pt-12 overflow-y-auto space-y-2 text-sm font-mono custom-scrollbar">
          {logs.map((log, i) => (
            <div key={i} className={`break-words ${log.startsWith("> USER") ? "text-white/70" : "text-green-400"}`}>
              {log}
            </div>
          ))}
          <div ref={logsEndRef} />
        </div>

        <div className="p-4 border-t border-green-900 flex gap-2 bg-black/80">
          <span className="text-green-500 animate-pulse">{'>'}</span>
          <input
            type="text"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && sendCommand()}
            className="flex-1 bg-transparent border-none outline-none text-green-400 placeholder-green-800 font-bold"
            placeholder="Enter command..."
            autoFocus
          />

          {/* NEW MIC BUTTON */}
          <button
            onMouseDown={() => {
              window.speechSynthesis.cancel(); // <--- Stop speaking immediately
              startListening();
            }}
            onMouseUp={stopListening}
            onMouseLeave={stopListening}
            className={`p-2 rounded-full transition-all ${isListening ? "bg-red-600 animate-pulse text-white" : "text-green-500 hover:text-white"}`}
            title="Hold to Speak"
          >
            {isListening ? <MicOff size={20} /> : <Mic size={20} />}
          </button>

          <button onClick={() => sendCommand()} disabled={isProcessing} className="text-green-500 hover:text-white disabled:opacity-50">
            <Play size={20} />
          </button>
        </div>
      </div>

      {/* RIGHT PANEL */}
      <div className="w-64 flex flex-col gap-4">
        <div className="border border-green-900 bg-black/50 p-4 rounded-lg">
          <div className="flex items-center gap-2 mb-2 text-red-400 border-b border-red-900/30 pb-2">
            <ShieldAlert size={20} />
            <h2 className="font-bold tracking-widest">ALERTS</h2>
          </div>

          {/* DYNAMIC ALERT LOGIC */}
          {metrics && metrics.active_connections > 1000 ? (
            <div className="p-3 bg-red-950/30 border border-red-900/50 rounded text-xs text-red-300 animate-pulse">
              [CRITICAL]<br />Payment Gateway<br />Conn: {metrics.active_connections} (HIGH)
            </div>
          ) : (
            <div className="p-3 bg-green-950/30 border border-green-900/50 rounded text-xs text-green-300 opacity-50">
              [NOMINAL]<br />All Systems Operational<br />Conn: {metrics ? metrics.active_connections : "--"}
            </div>
          )}
        </div>

        {/* APPROVALS PANEL (Dynamic) */}
        <div className="border border-green-900 bg-black/50 p-4 rounded-lg flex-1 overflow-y-auto">
          <div className="flex items-center gap-2 mb-4 border-b border-green-900 pb-2">
            <ShieldAlert size={20} className={pendingRequests.length > 0 ? "text-yellow-500 animate-pulse" : "text-gray-500"} />
            <h2 className="font-bold tracking-widest">APPROVALS ({pendingRequests.length})</h2>
          </div>

          {pendingRequests.length === 0 ? (
            <div className="text-gray-600 text-xs italic text-center mt-4">No pending actions.</div>
          ) : (
            <div className="space-y-3">
              {pendingRequests.map((req) => (
                <div key={req.id} className="bg-yellow-900/10 border border-yellow-700/50 p-3 rounded">
                  <div className="text-xs text-yellow-500 font-bold mb-1">{req.tool.toUpperCase()}</div>
                  <div className="text-xs text-gray-300 mb-2">{req.description}</div>
                  <div className="flex gap-2">
                    <button
                      onClick={async () => {
                        await fetch(`http://localhost:8000/approvals/${req.id}/approve`, { method: "POST" });
                        fetchApprovals(); // Refresh list
                      }}
                      className="flex-1 bg-green-700 hover:bg-green-600 text-white text-xs py-1 rounded font-bold"
                    >
                      APPROVE
                    </button>
                    <button className="flex-1 border border-red-900 text-red-500 hover:bg-red-900/20 text-xs py-1 rounded">
                      DENY
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* THE APPROVAL MODAL (This is the new part) */}
      {showApproval && (
        <div className="absolute inset-0 bg-black/90 flex items-center justify-center z-50 backdrop-blur-sm">
          <div className="bg-red-950 border-2 border-red-600 p-8 rounded-lg shadow-[0_0_100px_rgba(220,38,38,0.5)] max-w-lg text-center animate-in fade-in zoom-in duration-300">
            <ShieldAlert size={64} className="mx-auto text-red-500 mb-6 animate-pulse" />
            <h2 className="text-3xl font-bold text-white mb-2 tracking-tighter">HIGH RISK ACTION</h2>
            <div className="h-px w-full bg-red-800 my-4"></div>
            <p className="text-red-200 mb-8 text-lg">
              The Agent requests permission to <strong className="text-white bg-red-600 px-1">RESTART</strong> the Payment Gateway.
              <br /><br />
              <span className="text-sm opacity-75">Impact: Temporary downtime (~500ms). Connection pool will be flushed.</span>
            </p>
            <div className="flex gap-4 justify-center">
              <button
                onClick={() => setShowApproval(false)}
                className="px-8 py-3 border border-red-800 text-red-400 hover:bg-red-900/50 rounded transition-colors"
              >
                ABORT
              </button>
              <button
                onClick={() => {
                  setShowApproval(false);
                  sendCommand("APPROVE"); // <--- The Magic Trigger
                }}
                className="px-8 py-3 bg-red-600 hover:bg-red-500 text-white font-bold rounded shadow-lg transition-all transform hover:scale-105 border border-red-400"
              >
                AUTHORIZE RESTART
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}