import { FlaskConical, Loader2 } from 'lucide-react';
import { Button } from '../ui/button';
import { Label } from '../ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../ui/dialog';

interface TimeTesterModalProps {
    standards: string[];
    standard: string;
    durationHours: 12 | 24;
    busy: boolean;
    onStandardChange: (standard: string) => void;
    onDurationChange: (hours: 12 | 24) => void;
    onStart: () => void;
    onClose: () => void;
}

export function TimeTesterModal({
    standards,
    standard,
    durationHours,
    busy,
    onStandardChange,
    onDurationChange,
    onStart,
    onClose,
}: TimeTesterModalProps) {
    return (
        <Dialog open onOpenChange={(open) => !open && onClose()}>
            <DialogContent className="max-w-xs gap-0 p-0">
                <DialogHeader className="flex-row items-center gap-2 space-y-0 border-b border-border p-4">
                    <div className="rounded-full bg-testing/20 p-1.5 text-testing-bright">
                        <FlaskConical size={16} />
                    </div>
                    <DialogTitle className="text-base font-bold text-heading">Time Tester</DialogTitle>
                </DialogHeader>

                <div className="border-b border-testing/20 bg-testing/10 px-5 py-3">
                    <p className="text-[11px] leading-relaxed text-testing-bright/80">
                        Broadcasts a <strong className="text-testing-bright">fixed 12:00 time signal</strong> for testing clocks and devices.
                        Scheduled broadcasts are paused for the duration and restored automatically when stopped.
                    </p>
                </div>

                <div className="space-y-4 p-5">
                    <div>
                        <Label className="mb-1.5 block text-[10px] font-bold tracking-wider text-muted-foreground uppercase">Service</Label>
                        <Select value={standard} onValueChange={onStandardChange}>
                            <SelectTrigger className="h-10 w-full bg-surface-sunken text-sm font-medium">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                {standards.map((option) => (
                                    <SelectItem key={option} value={option}>{option}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>

                    <div>
                        <Label className="mb-1.5 block text-[10px] font-bold tracking-wider text-muted-foreground uppercase">Duration</Label>
                        <div className="grid grid-cols-2 gap-2">
                            {([12, 24] as const).map((hours) => (
                                <Button
                                    key={hours}
                                    variant="outline"
                                    onClick={() => onDurationChange(hours)}
                                    className={`border-2 font-bold ${durationHours === hours
                                        ? 'border-testing bg-testing/20 text-testing-bright'
                                        : 'bg-surface-sunken text-muted-foreground hover:border-testing/50'}`}
                                >
                                    {hours} hours
                                </Button>
                            ))}
                        </div>
                    </div>
                </div>

                <div className="flex gap-3 border-t border-border p-4">
                    <Button variant="secondary" onClick={onClose} className="flex-1 font-bold">
                        Cancel
                    </Button>
                    <Button variant="testing" disabled={busy} onClick={onStart} className="flex-1 font-bold shadow-lg">
                        {busy ? <Loader2 className="animate-spin" size={16} /> : <FlaskConical size={16} />}
                        Start
                    </Button>
                </div>
            </DialogContent>
        </Dialog>
    );
}
