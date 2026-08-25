import { X, Download, CheckCircle2 } from 'lucide-react';
import { Button } from './ui/button';

interface UpdateBannerProps {
    type: 'available' | 'up-to-date';
    currentVersion: string;
    latestVersion: string;
    onDismiss: () => void;
    onUpdate: () => void;
}

export default function UpdateBanner({ type, currentVersion, latestVersion, onDismiss, onUpdate }: UpdateBannerProps) {
    if (type === 'up-to-date') {
        return (
            <div className="animate-slide-in-right fixed top-4 right-4 z-50 rounded-lg border border-success/30 bg-success-strong text-white shadow-2xl">
                <div className="flex items-center gap-3 px-4 py-3">
                    <CheckCircle2 className="h-5 w-5" />
                    <div className="flex flex-col">
                        <span className="text-sm font-semibold">System Up to Date</span>
                        <span className="font-mono text-xs opacity-80">{currentVersion}</span>
                    </div>
                    <Button
                        variant="ghost"
                        size="icon-sm"
                        onClick={onDismiss}
                        aria-label="Dismiss"
                        className="ml-4 text-white hover:bg-white/20 hover:text-white"
                    >
                        <X className="h-4 w-4" />
                    </Button>
                </div>
            </div>
        );
    }

    return (
        <div className="animate-slide-in-right fixed top-4 right-4 z-50 rounded-lg border border-primary/30 bg-primary text-primary-foreground shadow-2xl">
            <div className="flex items-center gap-3 px-4 py-3">
                <Download className="h-5 w-5 animate-bounce" />
                <div className="flex flex-col">
                    <span className="text-sm font-semibold">Update Available</span>
                    <span className="font-mono text-xs opacity-80">
                        {currentVersion} → {latestVersion}
                    </span>
                </div>
                <div className="ml-4 flex items-center gap-2">
                    <Button
                        size="sm"
                        onClick={onUpdate}
                        className="bg-background font-semibold text-primary shadow-md hover:bg-background/90"
                    >
                        Update Now
                    </Button>
                    <Button
                        variant="ghost"
                        size="icon-sm"
                        onClick={onDismiss}
                        aria-label="Dismiss"
                        className="text-primary-foreground hover:bg-white/20 hover:text-primary-foreground"
                    >
                        <X className="h-4 w-4" />
                    </Button>
                </div>
            </div>
        </div>
    );
}
