import { RotateCw } from 'lucide-react';

interface RestartOverlayProps {
    title: string;
    message: string;
    hint: string;
}

export function RestartOverlay({ title, message, hint }: RestartOverlayProps) {
    return (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-[70] backdrop-blur-sm">
            <div className="bg-slate-800 rounded-2xl p-8 max-w-sm w-full border border-slate-700 shadow-2xl text-center">
                <div className="mb-6">
                    <RotateCw size={48} className="mx-auto animate-spin text-amber-400" />
                </div>
                <h3 className="text-xl font-bold text-white mb-3">{title}</h3>
                <p className="text-sm text-slate-400 mb-6">{message}</p>
                <div className="flex items-center justify-center gap-2 text-xs text-slate-500">
                    <div className="animate-pulse">{hint}</div>
                    <div className="flex gap-1">
                        {[0, 150, 300].map((delay) => (
                            <div
                                key={delay}
                                className="w-1.5 h-1.5 bg-amber-400 rounded-full animate-bounce"
                                style={{ animationDelay: `${delay}ms` }}
                            />
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
}
