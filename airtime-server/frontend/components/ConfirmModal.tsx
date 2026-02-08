import React from 'react';
import { X, AlertTriangle, Info, CheckCircle } from 'lucide-react';

export type ModalType = 'danger' | 'warning' | 'info' | 'success';

interface ConfirmModalProps {
    isOpen: boolean;
    onClose: () => void;
    onConfirm?: () => void;
    title: string;
    message: string;
    confirmText?: string;
    cancelText?: string;
    type?: ModalType;
}

export const ConfirmModal: React.FC<ConfirmModalProps> = ({
    isOpen,
    onClose,
    onConfirm,
    title,
    message,
    confirmText = "Confirm",
    cancelText = "Cancel",
    type = 'info'
}) => {
    if (!isOpen) return null;

    const getIcon = () => {
        switch (type) {
            case 'danger': return <AlertTriangle className="text-red-400" size={24} />;
            case 'warning': return <AlertTriangle className="text-yellow-400" size={24} />;
            case 'success': return <CheckCircle className="text-emerald-400" size={24} />;
            default: return <Info className="text-cyan-400" size={24} />;
        }
    };

    const getConfirmBtnClasses = () => {
        switch (type) {
            case 'danger': return "bg-red-600 hover:bg-red-500 text-white shadow-lg shadow-red-900/20";
            case 'warning': return "bg-yellow-600 hover:bg-yellow-500 text-white shadow-lg shadow-yellow-900/20";
            case 'success': return "bg-emerald-600 hover:bg-emerald-500 text-white shadow-lg shadow-emerald-900/20";
            default: return "bg-cyan-600 hover:bg-cyan-500 text-white shadow-lg shadow-cyan-900/20";
        }
    };

    return (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-[60] backdrop-blur-sm p-4 animate-fade-in" onClick={onClose}>
            <div
                className="bg-slate-800 rounded-2xl max-w-sm w-full border border-slate-700 shadow-2xl overflow-hidden scale-100 animate-scale-up"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="flex items-center justify-between p-4 border-b border-slate-700 bg-slate-800/50">
                    <div className="flex items-center gap-3">
                        <div className="p-2 rounded-full bg-slate-700/50">
                            {getIcon()}
                        </div>
                        <h3 className="text-lg font-bold text-slate-100">{title}</h3>
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-slate-700 rounded-full text-slate-400 transition-colors">
                        <X size={18} />
                    </button>
                </div>

                <div className="p-6">
                    <p className="text-slate-300 text-sm leading-relaxed">
                        {message}
                    </p>
                </div>

                <div className="p-4 border-t border-slate-700 flex gap-3 bg-slate-900/30">
                    {onConfirm ? (
                        <>
                            <button
                                onClick={onClose}
                                className="flex-1 py-2.5 rounded-lg font-bold text-sm bg-slate-700 hover:bg-slate-600 text-slate-300 transition-colors"
                            >
                                {cancelText}
                            </button>
                            <button
                                onClick={() => {
                                    onConfirm();
                                    onClose();
                                }}
                                className={`flex-1 py-2.5 rounded-lg font-bold text-sm transition-all ${getConfirmBtnClasses()}`}
                            >
                                {confirmText}
                            </button>
                        </>
                    ) : (
                        <button
                            onClick={onClose}
                            className="w-full py-2.5 rounded-lg font-bold text-sm bg-slate-700 hover:bg-slate-600 text-slate-300 transition-colors"
                        >
                            Close
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
};
