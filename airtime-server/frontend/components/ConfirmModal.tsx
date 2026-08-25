import React from 'react';
import { AlertTriangle, Info, CheckCircle } from 'lucide-react';
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from './ui/alert-dialog';
import { buttonVariants } from './ui/button';
import { cn } from '@/lib/utils';

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

const ICONS: Record<ModalType, { icon: typeof Info; className: string }> = {
    danger: { icon: AlertTriangle, className: 'text-danger' },
    warning: { icon: AlertTriangle, className: 'text-warning' },
    success: { icon: CheckCircle, className: 'text-success' },
    info: { icon: Info, className: 'text-primary' },
};

const CONFIRM_VARIANT: Record<ModalType, 'destructive' | 'default' | 'success'> = {
    danger: 'destructive',
    warning: 'default',
    success: 'success',
    info: 'default',
};

export const ConfirmModal: React.FC<ConfirmModalProps> = ({
    isOpen,
    onClose,
    onConfirm,
    title,
    message,
    confirmText = 'Confirm',
    cancelText = 'Cancel',
    type = 'info',
}) => {
    const { icon: Icon, className: iconClass } = ICONS[type];

    return (
        <AlertDialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
            <AlertDialogContent className="max-w-sm">
                <AlertDialogHeader>
                    <div className="flex items-center gap-3">
                        <div className="rounded-full bg-secondary/50 p-2">
                            <Icon size={24} className={iconClass} />
                        </div>
                        <AlertDialogTitle className="text-lg font-bold">{title}</AlertDialogTitle>
                    </div>
                    <AlertDialogDescription className="whitespace-pre-line pt-2 text-sm leading-relaxed">
                        {message}
                    </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                    {onConfirm ? (
                        <>
                            <AlertDialogCancel className="flex-1 font-bold">{cancelText}</AlertDialogCancel>
                            <AlertDialogAction
                                onClick={onConfirm}
                                className={cn(buttonVariants({ variant: CONFIRM_VARIANT[type] }), 'flex-1 font-bold')}
                            >
                                {confirmText}
                            </AlertDialogAction>
                        </>
                    ) : (
                        <AlertDialogCancel className="w-full font-bold">Close</AlertDialogCancel>
                    )}
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
    );
};
