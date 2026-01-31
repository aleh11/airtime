import { X, Download, CheckCircle2 } from 'lucide-react';

interface UpdateBannerProps {
    type: 'available' | 'up-to-date';
    localCommit: string;
    remoteCommit: string;
    onDismiss: () => void;
    onUpdate: () => void;
}

export default function UpdateBanner({ type, localCommit, remoteCommit, onDismiss, onUpdate }: UpdateBannerProps) {
    if (type === 'up-to-date') {
        return (
            <div className="fixed top-4 right-4 z-50 bg-gradient-to-r from-emerald-600 to-teal-600 text-white rounded-lg shadow-2xl border border-emerald-400/30 animate-slide-in-right">
                <div className="flex items-center gap-3 px-4 py-3">
                    <CheckCircle2 className="w-5 h-5" />
                    <div className="flex flex-col">
                        <span className="font-semibold text-sm">System Up to Date</span>
                        <span className="text-xs text-emerald-100 opacity-80 font-mono">
                            Commit: {localCommit}
                        </span>
                    </div>
                    <button
                        onClick={onDismiss}
                        className="ml-4 p-1 hover:bg-white/20 rounded transition-colors"
                        aria-label="Dismiss"
                    >
                        <X className="w-4 h-4" />
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className="fixed top-4 right-4 z-50 bg-gradient-to-r from-cyan-600 to-blue-600 text-white rounded-lg shadow-2xl border border-cyan-400/30 animate-slide-in-right">
            <div className="flex items-center gap-3 px-4 py-3">
                <Download className="w-5 h-5 animate-bounce" />
                <div className="flex flex-col">
                    <span className="font-semibold text-sm">Update Available</span>
                    <span className="text-xs text-cyan-100">
                        {localCommit} → {remoteCommit}
                    </span>
                </div>
                <div className="flex items-center gap-2 ml-4">
                    <button
                        onClick={onUpdate}
                        className="px-3 py-1.5 bg-white text-cyan-600 rounded-md text-sm font-semibold hover:bg-cyan-50 transition-colors shadow-md"
                    >
                        Update Now
                    </button>
                    <button
                        onClick={onDismiss}
                        className="p-1 hover:bg-white/20 rounded transition-colors"
                        aria-label="Dismiss"
                    >
                        <X className="w-4 h-4" />
                    </button>
                </div>
            </div>
        </div>
    );
}
