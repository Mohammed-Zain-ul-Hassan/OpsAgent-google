import { useState, useEffect } from "react";
import { Save, Plus, Trash2, Bell } from "lucide-react";
import { useToast } from "@/components/Toast";

interface SettingsProps {
    authFetch: (url: string, options?: RequestInit) => Promise<Response>;
}

export default function Settings({ authFetch }: SettingsProps) {
    const [config, setConfig] = useState<{ monitors: { name: string; command: string }[]; discord_webhooks: string[] }>({ monitors: [], discord_webhooks: [] });
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const { showToast } = useToast();

    useEffect(() => {
        authFetch("/config")
            .then((res) => {
                if (res.ok) return res.json();
                throw new Error("Failed to load config");
            })
            .then((data) => {
                setConfig(data);
                setLoading(false);
            })
            .catch((err) => console.error("Failed to load config", err));
    }, [authFetch]);

    const handleSave = async () => {
        setSaving(true);
        try {
            const res = await authFetch("/config", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(config),
            });
            if (!res.ok) throw new Error("Failed to save");
            showToast("Configuration saved!", "success");
        } catch (err) {
            console.error("Failed to save config", err);
            showToast("Failed to save configuration.", "error");
        } finally {
            setSaving(false);
        }
    };

    const addMonitor = () => {
        setConfig({
            ...config,
            monitors: [...config.monitors, { name: "New Monitor", command: "echo 'ok'" }],
        });
    };

    const removeMonitor = (index: number) => {
        const newMonitors = [...config.monitors];
        newMonitors.splice(index, 1);
        setConfig({ ...config, monitors: newMonitors });
    };

    const updateMonitor = (index: number, field: string, value: string) => {
        const newMonitors = [...config.monitors];
        newMonitors[index] = { ...newMonitors[index], [field]: value };
        setConfig({ ...config, monitors: newMonitors });
    };

    if (loading) return <div className="text-green-500 p-4">Loading configuration...</div>;

    return (
        <div className="p-6 text-green-500 font-mono h-full overflow-y-auto custom-scrollbar">
            <h2 className="text-2xl font-bold mb-6 border-b border-green-900 pb-2 flex items-center gap-2">
                <Bell size={24} /> Configuration
            </h2>

            {/* Discord Webhooks */}
            <div className="mb-8 bg-green-900/10 p-4 rounded border border-green-900/30">
                <div className="flex justify-between items-center mb-2">
                    <label className="block text-sm font-bold">Discord Webhooks</label>
                    <button
                        onClick={() => setConfig({ ...config, discord_webhooks: [...(config.discord_webhooks || []), ""] })}
                        className="text-xs flex items-center gap-1 bg-green-900/30 hover:bg-green-900/50 px-2 py-1 rounded text-green-400 transition-colors"
                    >
                        <Plus size={12} /> Add Webhook
                    </button>
                </div>

                <div className="space-y-2">
                    {(!config.discord_webhooks || config.discord_webhooks.length === 0) && (
                        <div className="text-xs text-green-800 italic">No webhooks configured.</div>
                    )}
                    {config.discord_webhooks?.map((url: string, index: number) => (
                        <div key={index} className="flex gap-2 items-center">
                            <input
                                type="text"
                                value={url}
                                onChange={(e) => {
                                    const newWebhooks = [...config.discord_webhooks];
                                    newWebhooks[index] = e.target.value;
                                    setConfig({ ...config, discord_webhooks: newWebhooks });
                                }}
                                className="flex-1 bg-black border border-green-800 rounded p-2 text-green-400 focus:outline-none focus:border-green-500 text-sm"
                                placeholder="https://discord.com/api/webhooks/..."
                            />
                            <button
                                onClick={() => {
                                    const newWebhooks = [...config.discord_webhooks];
                                    newWebhooks.splice(index, 1);
                                    setConfig({ ...config, discord_webhooks: newWebhooks });
                                }}
                                className="text-red-500 hover:text-red-400 p-1"
                                title="Remove Webhook"
                            >
                                <Trash2 size={16} />
                            </button>
                        </div>
                    ))}
                </div>
            </div>

            {/* Monitors */}
            <div className="mb-8">
                <div className="flex justify-between items-center mb-4">
                    <h3 className="text-xl font-bold">Monitors</h3>
                    <button
                        onClick={addMonitor}
                        className="flex items-center gap-1 bg-green-900/30 hover:bg-green-900/50 px-3 py-1 rounded text-sm transition-colors"
                    >
                        <Plus size={16} /> Add Monitor
                    </button>
                </div>

                <div className="space-y-4">
                    {config.monitors.map((monitor: { name: string; command: string }, index: number) => (
                        <div key={index} className="flex gap-4 items-start bg-black/40 p-3 rounded border border-green-900/30">
                            <div className="flex-1">
                                <label className="block text-xs text-green-700 mb-1">Name</label>
                                <input
                                    type="text"
                                    value={monitor.name}
                                    onChange={(e) => updateMonitor(index, "name", e.target.value)}
                                    className="w-full bg-black border border-green-900 rounded p-1 text-sm text-green-400"
                                />
                            </div>
                            <div className="flex-[2]">
                                <label className="block text-xs text-green-700 mb-1">Command</label>
                                <input
                                    type="text"
                                    value={monitor.command}
                                    onChange={(e) => updateMonitor(index, "command", e.target.value)}
                                    className="w-full bg-black border border-green-900 rounded p-1 text-sm text-green-400 font-mono"
                                />
                            </div>
                            <button
                                onClick={() => removeMonitor(index)}
                                className="mt-6 text-red-500 hover:text-red-400 p-1"
                                title="Remove Monitor"
                            >
                                <Trash2 size={18} />
                            </button>
                        </div>
                    ))}
                </div>
            </div>

            <button
                onClick={handleSave}
                disabled={saving}
                className="flex items-center gap-2 bg-green-700 hover:bg-green-600 text-black font-bold px-6 py-2 rounded transition-all disabled:opacity-50"
            >
                <Save size={18} /> {saving ? "Saving..." : "Save Configuration"}
            </button>
        </div>
    );
}
