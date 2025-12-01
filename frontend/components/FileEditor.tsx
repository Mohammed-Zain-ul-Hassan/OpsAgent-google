import { useState, useEffect } from "react";
import { Save, FileText, Trash2, AlertTriangle } from "lucide-react";
import { useToast } from "@/components/Toast";

interface FileEditorProps {
    filename: string;
    isProtected: boolean;
    onClose: () => void;
    onDelete: () => void;
    authFetch: (url: string, options?: RequestInit) => Promise<Response>;
}

export default function FileEditor({ filename, isProtected, onClose, onDelete, authFetch }: FileEditorProps) {
    const [content, setContent] = useState("");
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [deleting, setDeleting] = useState(false);
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
    const [deleteConfirmationText, setDeleteConfirmationText] = useState("");
    const { showToast } = useToast();

    useEffect(() => {
        authFetch(`/files/${filename}`)
            .then((res) => {
                if (res.ok) return res.text();
                throw new Error("Failed to load file");
            })
            .then((data) => {
                setContent(data);
                setLoading(false);
            })
            .catch((err) => console.error("Failed to load file", err));
    }, [filename]);

    const handleSave = async () => {
        setSaving(true);
        try {
            const res = await authFetch(`/files/${filename}`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ content }),
            });
            if (!res.ok) throw new Error("Failed to save");
            showToast("File saved!", "success");
        } catch (err) {
            console.error("Failed to save file", err);
            showToast("Failed to save file.", "error");
        } finally {
            setSaving(false);
        }
    };

    const handleDelete = async () => {
        if (isProtected && deleteConfirmationText !== "Delete") {
            showToast("Please type 'Delete' to confirm.", "warning");
            return;
        }

        setDeleting(true);
        try {
            await onDelete();
            onClose();
        } catch (err) {
            console.error("Failed to delete file", err);
            showToast("Failed to delete file.", "error");
        } finally {
            setDeleting(false);
            setShowDeleteConfirm(false);
        }
    };

    if (loading) return <div className="text-green-500 p-4">Loading file...</div>;

    return (
        <div className="p-4 text-green-500 font-mono h-full flex flex-col relative">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-4 border-b border-green-900 pb-2 gap-4 md:gap-0">
                <div className="flex items-center gap-2 w-full md:w-auto overflow-hidden">
                    <FileText size={20} className="shrink-0" />
                    <h2 className="text-xl font-bold truncate">{filename}</h2>
                    {isProtected && <span className="text-xs bg-yellow-900/50 text-yellow-500 px-2 py-0.5 rounded border border-yellow-700 shrink-0">PROTECTED</span>}
                </div>
                <div className="flex gap-2 w-full md:w-auto justify-end flex-wrap">
                    <button
                        onClick={() => setShowDeleteConfirm(true)}
                        className="flex items-center gap-2 bg-red-900/20 hover:bg-red-900/40 text-red-500 border border-red-900/50 font-bold px-4 py-1 rounded transition-all text-sm"
                    >
                        <Trash2 size={16} /> Delete
                    </button>
                    <button
                        onClick={handleSave}
                        disabled={saving}
                        className="flex items-center gap-2 bg-green-700 hover:bg-green-600 text-black font-bold px-4 py-1 rounded transition-all disabled:opacity-50 text-sm"
                    >
                        <Save size={16} /> {saving ? "Saving..." : "Save"}
                    </button>
                    <button
                        onClick={onClose}
                        className="text-green-600 hover:text-green-400 text-sm underline"
                    >
                        Close
                    </button>
                </div>
            </div>

            <textarea
                value={content}
                onChange={(e) => setContent(e.target.value)}
                className="flex-1 w-full bg-black/50 border border-green-900 rounded p-4 text-sm font-mono text-green-300 focus:outline-none focus:border-green-500 resize-none custom-scrollbar"
                spellCheck={false}
            />

            {showDeleteConfirm && (
                <div className="absolute inset-0 bg-black/80 flex items-center justify-center z-10 backdrop-blur-sm">
                    <div className="bg-neutral-900 border border-red-900 p-6 rounded-lg shadow-xl max-w-md w-full">
                        <div className="flex items-center gap-2 text-red-500 mb-4">
                            <AlertTriangle size={24} />
                            <h3 className="text-lg font-bold">Delete File?</h3>
                        </div>
                        <p className="text-gray-300 mb-4">
                            Are you sure you want to delete <span className="font-bold text-white">{filename}</span>?
                            {isProtected && <span className="block mt-2 text-yellow-500 text-sm">This is a protected file. You must type &quot;Delete&quot; to confirm.</span>}
                        </p>

                        {isProtected && (
                            <input
                                type="text"
                                value={deleteConfirmationText}
                                onChange={(e) => setDeleteConfirmationText(e.target.value)}
                                placeholder="Type 'Delete'"
                                className="w-full bg-black border border-gray-700 rounded p-2 text-white mb-4 outline-none focus:border-red-500"
                            />
                        )}

                        <div className="flex justify-end gap-2">
                            <button
                                onClick={() => setShowDeleteConfirm(false)}
                                className="px-4 py-2 text-gray-400 hover:text-white"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleDelete}
                                disabled={isProtected && deleteConfirmationText !== "Delete" || deleting}
                                className="px-4 py-2 bg-red-600 hover:bg-red-500 text-white rounded font-bold disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                {deleting ? "Deleting..." : "Confirm Delete"}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
