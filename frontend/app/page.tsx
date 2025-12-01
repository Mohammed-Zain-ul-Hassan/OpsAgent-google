"use client";
import { useState, useEffect, useRef, useCallback } from "react";

import { useVoice } from "../hooks/useVoice";
import { Terminal, FileCode, ShieldAlert, Cpu, Play, Mic, MicOff, Settings as SettingsIcon, Activity, Edit, Lock, Plus, X, Menu, Bell, Volume2, VolumeX } from "lucide-react";
import RunbookUpload from "@/components/RunbookUpload";
import Settings from "@/components/Settings";
import FileEditor from "@/components/FileEditor";
import { useToast } from "@/components/Toast";
import ScriptModal from "@/components/ScriptModal";

export default function Dashboard() {
  const [prompt, setPrompt] = useState("");
  const [logs, setLogs] = useState<string[]>([]);
  const [files, setFiles] = useState<string[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [showApproval, setShowApproval] = useState(false); // <--- NEW STATE
  const [isMuted, setIsMuted] = useState(false); // <--- MUTE STATE
  const [activeTab, setActiveTab] = useState<"dashboard" | "settings" | "editor">("dashboard");
  const [activeFile, setActiveFile] = useState<string | null>(null);
  const logsEndRef = useRef<HTMLDivElement>(null);
  const responseBuffer = useRef("");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [metrics, setMetrics] = useState<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [pendingRequests, setPendingRequests] = useState<any[]>([]);
  const { isListening, transcript, startListening, stopListening, speak, setTranscript } = useVoice();
  // PREVIOUS STATE TRACKING to prevent looping speech
  const prevPendingRef = useRef(0);
  // Ref to track the last spoken log index
  const lastSpokenIndex = useRef(0);

  const [token, setToken] = useState<string | null>(null);
  const [password, setPassword] = useState("");
  const [loginError, setLoginError] = useState("");
  const [showAddFileModal, setShowAddFileModal] = useState(false);
  const [newFilename, setNewFilename] = useState("");
  const [newFileCategory, setNewFileCategory] = useState<"context" | "extra">("context");

  const [mounted, setMounted] = useState(false);
  const [showMobileWorkspace, setShowMobileWorkspace] = useState(false);

  const [showMobileAlerts, setShowMobileAlerts] = useState(false);
  const { showToast } = useToast();

  // SCRIPT MODAL STATE
  const [scriptModalOpen, setScriptModalOpen] = useState(false);
  const [scriptRequestId, setScriptRequestId] = useState(""); // Track Request ID
  const [scriptContent, setScriptContent] = useState("");

  useEffect(() => {
    setMounted(true);
    const storedToken = localStorage.getItem("token");
    if (storedToken) setToken(storedToken);
  }, []);



  const API_URL = process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:8000";

  const authFetch = useCallback(async (url: string, options: RequestInit = {}) => {
    // If url starts with /, prepend API_URL
    const fullUrl = url.startsWith("http") ? url : `${API_URL}${url}`;

    const headers = {
      ...options.headers,
      "X-Auth-Token": token || "",
    };
    const res = await fetch(fullUrl, { ...options, headers });
    if (res.status === 401) {
      setToken(null);
      localStorage.removeItem("token");
    }
    return res;
  }, [API_URL, token]);

  const handleLogin = async () => {
    try {
      const res = await fetch(`${API_URL}/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password })
      });
      if (res.ok) {
        const data = await res.json();
        setToken(data.token);
        localStorage.setItem("token", data.token);
        setLoginError("");
      } else {
        setLoginError("Invalid password");
      }
    } catch (e) {
      setLoginError("Login failed");
    }
  };

  const handleAddFile = async () => {
    if (!newFilename) return;
    let filename = newFilename;
    if (newFileCategory === "context" && !filename.endsWith(".md") && !filename.endsWith(".txt")) {
      filename += ".txt";
    }

    try {
      const res = await authFetch(`/files/${filename}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: "" })
      });

      if (res.ok) {
        setShowAddFileModal(false);
        setNewFilename("");
        fetchFiles();
      } else {
        const data = await res.json();
        showToast(data.error || "Failed to create file", "error");
      }
    } catch (e) {
      showToast("Failed to create file", "error");
    }
  };



  const fetchFiles = useCallback(async () => {
    if (!token) return;
    try {
      const res = await authFetch("/files");
      if (res.ok) {
        const data = await res.json();
        setFiles(data.files || []);
      }
    } catch (e) { console.error(e); }
  }, [authFetch, token]);

  const fetchMetrics = useCallback(async () => {
    if (!token) return;
    try {
      const res = await authFetch("/system-status");
      if (res.ok) {
        const data = await res.json();
        setMetrics(data);
      }
    } catch (e) { }
  }, [authFetch, token]);

  const fetchApprovals = useCallback(async () => {
    if (!token) return;
    try {
      const res = await authFetch("/approvals");
      if (res.ok) {
        const data = await res.json();
        const pending = data.requests.filter((r: { status: string }) => r.status === "PENDING");
        setPendingRequests(pending);
      }
    } catch (e) { }
  }, [authFetch, token]);

  useEffect(() => {
    if (!token) return;

    fetchFiles();
    fetchMetrics();
    fetchApprovals();

    const interval = setInterval(() => {
      fetchFiles();
      fetchMetrics();
      fetchApprovals();
    }, 2000);

    return () => clearInterval(interval);
  }, [token, fetchFiles, fetchMetrics, fetchApprovals]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);

    if (params.get("action") === "review_incident") {
      setLogs((prev) => [...prev, "> SYSTEM: Analyzing Deep Link request..."]);

      // VERIFY: Don't just show the modal. Check the actual server status.
      fetch(`${API_URL}/system-status`)
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
      if (!isMuted) {
        speak("Attention commander. A critical action requires your approval.");
      }
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
        if (!isMuted) {
          speak(text);
        }
      }, 1000);

      return () => clearTimeout(timeoutId);
    }
  }, [logs, speak]);

  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [logs]);



  // REFACTORED: Now accepts an optional argument
  const sendCommand = (manualCommand?: string) => {
    const commandToSend = manualCommand || prompt;
    if (!commandToSend) return;

    setIsProcessing(true);
    setLogs((prev) => [...prev, `> USER: ${commandToSend}`]);

    // RESET THE BUFFER FOR NEW COMMAND
    responseBuffer.current = "";

    const eventSource = new EventSource(
      `${API_URL}/stream-test?prompt=${encodeURIComponent(commandToSend)}`
    );

    eventSource.onmessage = (event) => {
      const cleanData = event.data;

      // 1. ACCUMULATE THE DATA
      responseBuffer.current += cleanData;

      // 2. CHECK THE ACCUMULATED BUFFER (The Fix)
      if (responseBuffer.current.includes("[AWAITING_APPROVAL]")) {
        setShowApproval(true);
      }

      // 3. CHECK FOR PROPOSAL (LEGACY - REMOVED)
      // The backend now creates an Approval Request directly.
      // We just need to listen for the [AWAITING_APPROVAL] signal which is already handled above.

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
  if (!mounted) return <div className="min-h-screen bg-black text-green-500 flex items-center justify-center">INITIALIZING SYSTEM...</div>;

  return (
    <div className="min-h-screen bg-neutral-950 text-green-500 font-mono p-2 md:p-4 flex flex-col md:flex-row gap-4 overflow-hidden h-screen relative">

      {/* MOBILE HEADER */}
      <div className="md:hidden flex justify-between items-center bg-green-900/20 p-3 rounded-lg border border-green-900 mb-2 shrink-0">
        <button onClick={() => setShowMobileWorkspace(true)} className="text-green-500">
          <Menu size={24} />
        </button>
        <span className="font-bold tracking-widest text-sm">OPS-GUARDIAN</span>
        <button onClick={() => setShowMobileAlerts(true)} className="text-green-500 relative">
          <ShieldAlert size={24} className={pendingRequests.length > 0 || (metrics && metrics.active_connections > 1000) ? "animate-pulse text-red-500" : ""} />
          {pendingRequests.length > 0 && (
            <span className="absolute -top-1 -right-1 bg-red-500 text-black text-[10px] font-bold w-4 h-4 rounded-full flex items-center justify-center">
              {pendingRequests.length}
            </span>
          )}
        </button>
      </div>

      {/* MOBILE OVERLAY */}
      {(showMobileWorkspace || showMobileAlerts) && (
        <div
          className="fixed inset-0 bg-black/80 z-40 lg:hidden backdrop-blur-sm"
          onClick={() => {
            setShowMobileWorkspace(false);
            setShowMobileAlerts(false);
          }}
        />
      )}

      {/* LEFT PANEL (WORKSPACE) */}
      <div className={`
        fixed inset-y-0 left-0 z-50 w-3/4 max-w-xs bg-black border-r border-green-900 p-4 transition-transform duration-300 ease-in-out
        md:relative md:translate-x-0 md:w-64 md:bg-black/50 md:border md:rounded-lg md:z-0 md:flex md:flex-col
        ${showMobileWorkspace ? "translate-x-0" : "-translate-x-full"}
      `}>
        <div className="flex items-center justify-between mb-4 border-b border-green-900 pb-2">
          <div className="flex items-center gap-2">
            <FileCode size={20} />
            <h2 className="font-bold tracking-widest">WORKSPACE</h2>
          </div>
          <button onClick={() => setShowMobileWorkspace(false)} className="md:hidden text-green-500">
            <X size={20} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto space-y-4 pr-2 custom-scrollbar">

          {/* SYSTEM PROTOCOL */}
          <div>
            <h3 className="text-xs font-bold text-green-700 mb-1 uppercase tracking-wider">System Protocol</h3>
            {files.filter(f => f === "system_instruction.txt").map((file, i) => (
              <div
                key={file}
                className={`flex items-center gap-2 p-2 rounded cursor-pointer transition-colors ${activeFile === file ? "bg-green-900/50 border border-green-500" : "bg-green-900/10 hover:bg-green-900/30"}`}
                onClick={() => {
                  setActiveFile(file);
                  setActiveTab("editor");
                  setShowMobileWorkspace(false);
                }}
              >
                <span className="text-xs">🔒</span>
                <span className="text-sm truncate flex-1">{file}</span>
                <Edit size={12} className="opacity-50" />
              </div>
            ))}
          </div>

          {/* MORE INFORMATION */}
          <div>
            <div className="flex justify-between items-center mb-1 pr-2">
              <h3 className="text-xs font-bold text-green-700 uppercase tracking-wider">Context & Info ({files.filter(f => (f.endsWith(".md") || f.endsWith(".txt")) && f !== "system_instruction.txt").length}/5)</h3>
              <button
                onClick={() => {
                  setNewFileCategory("context");
                  setShowAddFileModal(true);
                  setShowMobileWorkspace(false);
                }}
                disabled={files.filter(f => (f.endsWith(".md") || f.endsWith(".txt")) && f !== "system_instruction.txt").length >= 5}
                className="text-green-500 hover:text-green-300 disabled:opacity-30 disabled:cursor-not-allowed"
              >
                <Plus size={14} />
              </button>
            </div>
            {files.filter(f => (f.endsWith(".md") || f.endsWith(".txt")) && f !== "system_instruction.txt").map((file, i) => (
              <div
                key={file}
                className={`flex items-center gap-2 p-2 rounded cursor-pointer transition-colors ${activeFile === file ? "bg-green-900/50 border border-green-500" : "bg-green-900/10 hover:bg-green-900/30"}`}
                onClick={() => {
                  setActiveFile(file);
                  setActiveTab("editor");
                  setShowMobileWorkspace(false);
                }}
              >
                <span className="text-xs">ℹ️</span>
                <span className="text-sm truncate flex-1">{file}</span>
                <Edit size={12} className="opacity-50" />
              </div>
            ))}
          </div>

          {/* EXTRA FILES */}
          <div>
            <div className="flex justify-between items-center mb-1 pr-2">
              <h3 className="text-xs font-bold text-green-700 uppercase tracking-wider">Extra Files ({files.filter(f => !f.endsWith(".md") && !f.endsWith(".txt") && f !== "system_instruction.txt").length}/5)</h3>
              <button
                onClick={() => {
                  setNewFileCategory("extra");
                  setShowAddFileModal(true);
                  setShowMobileWorkspace(false);
                }}
                disabled={files.filter(f => !f.endsWith(".md") && !f.endsWith(".txt") && f !== "system_instruction.txt").length >= 5}
                className="text-green-500 hover:text-green-300 disabled:opacity-30 disabled:cursor-not-allowed"
              >
                <Plus size={14} />
              </button>
            </div>
            {files.filter(f => !f.endsWith(".md") && !f.endsWith(".txt") && f !== "system_instruction.txt").map((file, i) => (
              <div
                key={file}
                className={`flex items-center gap-2 p-2 rounded cursor-pointer transition-colors ${activeFile === file ? "bg-green-900/50 border border-green-500" : "bg-green-900/10 hover:bg-green-900/30"}`}
                onClick={() => {
                  setActiveFile(file);
                  setActiveTab("editor");
                  setShowMobileWorkspace(false);
                }}
              >
                <span className="text-xs">📄</span>
                <span className="text-sm truncate flex-1">{file}</span>
                <Edit size={12} className="opacity-50" />
              </div>
            ))}
          </div>

        </div>
        <RunbookUpload />
      </div>

      {/* CENTER PANEL */}
      <div className="flex-1 border border-green-900 bg-black rounded-lg flex flex-col relative">
        <div className="absolute top-0 left-0 w-full bg-green-900/20 p-2 flex justify-between items-center border-b border-green-900 backdrop-blur-sm z-10 min-h-[3rem]">
          <div className="flex gap-4 items-center flex-wrap">
            <div className="hidden md:flex gap-2 items-center mr-4">
              <Terminal size={18} />
              <span className="text-sm font-bold tracking-widest">OPS-GUARDIAN v3.0</span>
            </div>

            <button
              onClick={() => setActiveTab("dashboard")}
              className={`flex items-center gap-1 text-xs font-bold px-3 py-1 rounded transition-colors ${activeTab === "dashboard" ? "bg-green-900/50 text-white" : "text-green-600 hover:text-green-400"}`}
            >
              <Activity size={14} /> DASHBOARD
            </button>
            <button
              onClick={() => setActiveTab("settings")}
              className={`flex items-center gap-1 text-xs font-bold px-3 py-1 rounded transition-colors ${activeTab === "settings" ? "bg-green-900/50 text-white" : "text-green-600 hover:text-green-400"}`}
            >
              <SettingsIcon size={14} /> SETTINGS
            </button>
            {activeFile && (
              <button
                onClick={() => setActiveTab("editor")}
                className={`flex items-center gap-1 text-xs font-bold px-3 py-1 rounded transition-colors ${activeTab === "editor" ? "bg-green-900/50 text-white" : "text-green-600 hover:text-green-400"}`}
              >
                <Edit size={14} /> EDITOR
              </button>
            )}
          </div>
          <div className="flex items-center gap-2">
            {isProcessing && <span className="animate-pulse text-xs bg-green-500 text-black px-2 py-0.5 rounded font-bold">PROCESSING</span>}
            {/* TABLET ALERTS TOGGLE */}
            <button
              onClick={() => setShowMobileAlerts(true)}
              className="hidden md:flex lg:hidden text-green-500 relative"
            >
              <ShieldAlert size={20} className={pendingRequests.length > 0 || (metrics && metrics.active_connections > 1000) ? "animate-pulse text-red-500" : ""} />
              {pendingRequests.length > 0 && (
                <span className="absolute -top-1 -right-1 bg-red-500 text-black text-[10px] font-bold w-3 h-3 rounded-full flex items-center justify-center">
                  {pendingRequests.length}
                </span>
              )}
            </button>
          </div>
        </div>

        {activeTab === "dashboard" ? (
          <>
            <div className="flex-1 p-4 pt-20 overflow-y-auto space-y-2 text-sm font-mono custom-scrollbar">
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

              {/* MUTE BUTTON */}
              <button
                onClick={() => {
                  setIsMuted(!isMuted);
                  if (!isMuted) window.speechSynthesis.cancel();
                }}
                className={`p-2 rounded-full transition-all ${isMuted ? "text-red-500 hover:text-red-400" : "text-green-500 hover:text-white"}`}
                title={isMuted ? "Unmute Agent" : "Mute Agent"}
              >
                {isMuted ? <VolumeX size={20} /> : <Volume2 size={20} />}
              </button>

              {/* NEW MIC BUTTON */}
              <button
                onClick={() => {
                  if (isListening) {
                    stopListening();
                  } else {
                    window.speechSynthesis.cancel();
                    startListening();
                  }
                }}
                className={`p-2 rounded-full transition-all ${isListening ? "bg-red-600 animate-pulse text-white" : "text-green-500 hover:text-white"}`}
                title={isListening ? "Stop Recording" : "Start Recording"}
              >
                {isListening ? <MicOff size={20} /> : <Mic size={20} />}
              </button>

              <button onClick={() => sendCommand()} disabled={isProcessing} className="text-green-500 hover:text-white disabled:opacity-50">
                <Play size={20} />
              </button>
            </div>
          </>
        ) : activeTab === "settings" ? (
          <div className="flex-1 pt-20 overflow-hidden">
            <Settings authFetch={authFetch} />
          </div>
        ) : (
          <div className="flex-1 pt-20 overflow-hidden">
            {activeFile ? (
              <FileEditor
                filename={activeFile}
                isProtected={activeFile === "system_instruction.txt" || activeFile.endsWith(".md") || activeFile.endsWith(".txt")}
                onClose={() => setActiveTab("dashboard")}
                authFetch={authFetch}
                onDelete={async () => {
                  await authFetch(`/files/${activeFile}`, { method: "DELETE" });
                  setActiveFile(null);
                  setActiveTab("dashboard");
                  fetchFiles();
                }}
              />
            ) : (
              <div className="flex items-center justify-center h-full text-green-700">No file selected</div>
            )}
          </div>
        )}
      </div>

      {/* RIGHT PANEL (ALERTS & APPROVALS) */}
      <div className={`
        fixed inset-y-0 right-0 z-50 w-3/4 max-w-xs bg-black border-l border-green-900 p-4 transition-transform duration-300 ease-in-out
        lg:relative lg:translate-x-0 lg:w-64 lg:bg-transparent lg:border-none lg:p-0 lg:flex lg:flex-col lg:gap-4 lg:z-0
        ${showMobileAlerts ? "translate-x-0" : "translate-x-full"}
      `}>
        <div className="flex items-center justify-between mb-4 lg:hidden border-b border-green-900 pb-2">
          <div className="flex items-center gap-2 text-red-400">
            <ShieldAlert size={20} />
            <h2 className="font-bold tracking-widest">ALERTS</h2>
          </div>
          <button onClick={() => setShowMobileAlerts(false)} className="text-green-500">
            <X size={20} />
          </button>
        </div>

        <div className="border border-green-900 bg-black/50 p-4 rounded-lg">
          <div className="hidden lg:flex items-center gap-2 mb-2 text-red-400 border-b border-red-900/30 pb-2">
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
        <div className="border border-green-900 bg-black/50 p-4 rounded-lg flex-1 overflow-y-auto mt-4 md:mt-0">
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

                  {/* SPECIAL HANDLING FOR SCRIPTS */}
                  {req.tool === "execute_script" ? (
                    <div className="flex gap-2">
                      <button
                        onClick={() => {
                          setScriptRequestId(req.id);
                          setScriptContent(req.content || "# No content found");
                          setScriptModalOpen(true);
                        }}
                        className="flex-1 bg-blue-700 hover:bg-blue-600 text-white text-xs py-1 rounded font-bold"
                      >
                        VIEW DETAILS
                      </button>
                      <button
                        onClick={async () => {
                          await authFetch(`/approvals/${req.id}/deny`, { method: "POST" });
                          fetchApprovals();
                        }}
                        className="flex-1 border border-red-900 text-red-500 hover:bg-red-900/20 text-xs py-1 rounded"
                      >
                        DENY
                      </button>
                    </div>
                  ) : (
                    <div className="flex gap-2">
                      <button
                        onClick={async () => {
                          await authFetch(`/approvals/${req.id}/approve`, { method: "POST" });
                          fetchApprovals(); // Refresh list
                        }}
                        className="flex-1 bg-green-700 hover:bg-green-600 text-white text-xs py-1 rounded font-bold"
                      >
                        APPROVE
                      </button>
                      <button
                        onClick={async () => {
                          await authFetch(`/approvals/${req.id}/deny`, { method: "POST" });
                          fetchApprovals(); // Refresh list
                        }}
                        className="flex-1 border border-red-900 text-red-500 hover:bg-red-900/20 text-xs py-1 rounded"
                      >
                        DENY
                      </button>
                    </div>
                  )}
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

      {/* LOGIN MODAL */}
      {!token && (
        <div className="fixed inset-0 bg-black/90 z-50 flex items-center justify-center backdrop-blur-sm">
          <div className="bg-neutral-900 border border-green-900 p-8 rounded-lg shadow-2xl max-w-md w-full text-center">
            <div className="flex justify-center mb-4 text-green-500">
              <Lock size={48} />
            </div>
            <h2 className="text-2xl font-bold text-green-500 mb-2 tracking-widest">ACCESS RESTRICTED</h2>
            <p className="text-gray-400 mb-6">Please enter authorization code to proceed.</p>

            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleLogin()}
              className="w-full bg-black border border-green-900 rounded p-3 text-green-500 text-center text-lg mb-4 focus:border-green-500 outline-none tracking-widest"
              placeholder="••••••••"
              autoFocus
            />

            {loginError && <p className="text-red-500 mb-4">{loginError}</p>}

            <button
              onClick={handleLogin}
              className="w-full bg-green-900/30 hover:bg-green-900/50 text-green-500 border border-green-900 font-bold py-3 rounded transition-all tracking-widest uppercase"
            >
              Authenticate
            </button>
          </div>
        </div>
      )}

      {/* ADD FILE MODAL */}
      {showAddFileModal && (
        <div className="fixed inset-0 bg-black/80 z-40 flex items-center justify-center backdrop-blur-sm">
          <div className="bg-neutral-900 border border-green-900 p-6 rounded-lg shadow-xl max-w-sm w-full">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-bold text-green-500">Add New File</h3>
              <button onClick={() => setShowAddFileModal(false)} className="text-gray-500 hover:text-white">
                <X size={20} />
              </button>
            </div>

            <div className="mb-4">
              <label className="block text-xs text-gray-400 mb-1">Filename</label>
              <input
                type="text"
                value={newFilename}
                onChange={(e) => setNewFilename(e.target.value)}
                className="w-full bg-black border border-green-900 rounded p-2 text-green-300 focus:border-green-500 outline-none"
                placeholder={newFileCategory === "context" ? "example.txt" : "script.py"}
                autoFocus
              />
              {newFileCategory === "context" && <p className="text-xs text-gray-500 mt-1">.txt or .md extension recommended</p>}
            </div>

            <button
              onClick={handleAddFile}
              className="w-full bg-green-700 hover:bg-green-600 text-black font-bold py-2 rounded"
            >
              Create File
            </button>
          </div>
        </div>
      )}
      {/* SCRIPT MODAL */}
      {scriptModalOpen && (
        <ScriptModal
          filename={`Request #${scriptRequestId}`}
          initialContent={scriptContent}
          onClose={() => {
            setScriptModalOpen(false);
            setScriptRequestId("");
          }}
          onExecute={async (filename, content) => {
            // HERE WE CALL THE APPROVAL ENDPOINT WITH CONTENT
            const res = await authFetch(`/approvals/${scriptRequestId}/approve`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ content }) // Send edited content
            });

            if (res.ok) {
              const data = await res.json();
              setLogs(prev => [...prev, `> SYSTEM: Script executed. Output:\n${data.result}`]);
              fetchApprovals(); // Clear the request from list
            } else {
              const data = await res.json();
              throw new Error(data.error || "Execution failed");
            }
          }}
        />
      )}
    </div>
  );
}