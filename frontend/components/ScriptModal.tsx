import { useState, useEffect } from "react";
import { X, Play, AlertTriangle, Check, Loader2 } from "lucide-react";

interface ScriptModalProps {
    filename: string;
    initialContent: string;
    onClose: () => void;
    onExecute: (filename: string, content: string) => Promise<void>;
}

export default function ScriptModal({ filename, initialContent, onClose, onExecute }: ScriptModalProps) {
    const [content, setContent] = useState(initialContent);
    const [isExecuting, setIsExecuting] = useState(false);
    const [error, setError] = useState("");

    // Auto-focus the textarea
    useEffect(() => {
        const textarea = document.getElementById("script-editor");
        if (textarea) textarea.focus();
    }, []);

    const handleRun = async () => {
        setIsExecuting(true);
        setError("");
        try {
            await onExecute(filename, content);
            onClose();
        } catch (e) {
            setError("Execution failed. See console/logs.");
            setIsExecuting(false);
        }
    };

    return (
        <div className="fixed inset-0 bg-black/90 z-50 flex items-center justify-center backdrop-blur-sm p-4">
            <div className="bg-neutral-900 border border-green-900 rounded-lg shadow-2xl w-full max-w-4xl flex flex-col max-h-[90vh]">

                {/* HEADER */}
                <div className="flex justify-between items-center p-4 border-b border-green-900 bg-black/50 rounded-t-lg">
                    <div className="flex items-center gap-3">
                        <div className="bg-yellow-500/10 p-2 rounded text-yellow-500">
                            <AlertTriangle size={20} />
                        </div>
                        <div>
                            <h2 className="text-lg font-bold text-green-500 tracking-widest">PROPOSED FIX</h2>
                            <p className="text-xs text-gray-400 font-mono">{filename}</p>
                        </div>
                    </div>
                    <button onClick={onClose} className="text-gray-500 hover:text-white transition-colors">
                        <X size={24} />
                    </button>
                </div>

                {/* EDITOR AREA */}
                <div className="flex-1 p-0 overflow-hidden relative group">
                    <textarea
                        id="script-editor"
                        value={content}
                        onChange={(e) => setContent(e.target.value)}
                        className="w-full h-[60vh] bg-[#0d1117] text-gray-300 font-mono text-sm p-4 outline-none resize-none focus:bg-[#0d1117]"
                        spellCheck={false}
                    />
                    <div className="absolute top-2 right-4 text-xs text-gray-600 pointer-events-none group-hover:opacity-100 opacity-50 transition-opacity">
                        PYTHON EDITOR
                    </div>
                </div>

                {/* FOOTER ACTIONS */}
                <div className="p-4 border-t border-green-900 bg-black/50 rounded-b-lg flex justify-between items-center">
                    <div className="text-xs text-gray-500">
                        {error && <span className="text-red-500 font-bold mr-2">ERROR: {error}</span>}
                        Review code carefully before executing.
                    </div>
                    <div className="flex gap-3">
                        <button
                            onClick={onClose}
                            className="px-4 py-2 border border-green-900 text-gray-400 hover:text-white hover:bg-green-900/20 rounded transition-colors text-sm font-bold"
                        >
                            DISCARD
                        </button>
                        <button
                            onClick={handleRun}
                            disabled={isExecuting}
                            className="px-6 py-2 bg-green-700 hover:bg-green-600 text-white rounded font-bold flex items-center gap-2 shadow-lg shadow-green-900/20 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                        >
                            {isExecuting ? (
                                <>
                                    <Loader2 size={16} className="animate-spin" /> EXECUTING...
                                </>
                            ) : (
                                <>
                                    <Play size={16} /> APPROVE & RUN
                                </>
                            )}
                        </button>
                    </div>
                </div>

            </div>
        </div>
    );
}
