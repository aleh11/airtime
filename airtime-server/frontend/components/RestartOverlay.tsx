import { RotateCw } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from './ui/dialog';

interface RestartOverlayProps {
    title: string;
    message: string;
    hint: string;
}

export function RestartOverlay({ title, message, hint }: RestartOverlayProps) {
    return (
        <Dialog open>
            <DialogContent
                showCloseButton={false}
                className="max-w-sm text-center"
                onEscapeKeyDown={(event) => event.preventDefault()}
                onInteractOutside={(event) => event.preventDefault()}
            >
                <div className="mb-2">
                    <RotateCw size={48} className="mx-auto animate-spin text-warning" />
                </div>
                <DialogTitle className="text-xl font-bold text-heading">{title}</DialogTitle>
                <DialogDescription className="text-sm text-muted-foreground">{message}</DialogDescription>
                <div className="flex items-center justify-center gap-2 text-xs text-subtle-foreground">
                    <div className="animate-pulse">{hint}</div>
                    <div className="flex gap-1">
                        {[0, 150, 300].map((delay) => (
                            <div
                                key={delay}
                                className="h-1.5 w-1.5 animate-bounce rounded-full bg-warning"
                                style={{ animationDelay: `${delay}ms` }}
                            />
                        ))}
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
}
