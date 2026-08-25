import type { RefObject } from 'react';
import { Clock, Edit2, Trash2, Zap } from 'lucide-react';
import { CronJob, ServiceType, SystemStatus } from '../../types';
import { DURATION_OPTIONS, durationLabel, isScheduleLive } from './scheduleFormat';
import { ScheduleDraft } from '../../hooks/useScheduleEditor';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Switch } from '../ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';

interface ScheduleCardsProps {
    jobs: CronJob[];
    status: SystemStatus | null;
    locked: boolean;
    draft: ScheduleDraft;
    adding: boolean;
    editingId: string | null;
    cardRef: RefObject<HTMLDivElement | null>;
    onDraftChange: (draft: ScheduleDraft) => void;
    onSave: (id?: string) => void;
    onCancel: () => void;
    onEdit: (job: CronJob) => void;
    onDelete: (id: string) => void;
    onToggle: (job: CronJob, enabled: boolean) => void;
}

const FIELD_CLASS = 'h-9 w-full bg-surface-sunken text-sm';
const LABEL_CLASS = 'mb-1 block text-[10px] font-bold text-subtle-foreground uppercase';

export function ScheduleCards({
    jobs, status, locked, draft, adding, editingId, cardRef,
    onDraftChange, onSave, onCancel, onEdit, onDelete, onToggle,
}: ScheduleCardsProps) {
    const form = (
        <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
                <div>
                    <Label className={LABEL_CLASS}>Time</Label>
                    <Input
                        type="time"
                        value={draft.time}
                        onChange={(e) => onDraftChange({ ...draft, time: e.target.value })}
                        className={FIELD_CLASS}
                    />
                </div>
                <div>
                    <Label className={LABEL_CLASS}>Frequency</Label>
                    <Select value={draft.frequency} onValueChange={(value) => onDraftChange({ ...draft, frequency: value })}>
                        <SelectTrigger className={FIELD_CLASS}>
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="daily">Daily</SelectItem>
                            <SelectItem value="weekly">Weekly</SelectItem>
                        </SelectContent>
                    </Select>
                </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
                <div>
                    <Label className={LABEL_CLASS}>Service</Label>
                    <Select value={draft.standard} onValueChange={(value) => onDraftChange({ ...draft, standard: value })}>
                        <SelectTrigger className={FIELD_CLASS}>
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            {Object.values(ServiceType).map((standard) => (
                                <SelectItem key={standard} value={standard}>{standard}</SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>
                <div>
                    <Label className={LABEL_CLASS}>Duration</Label>
                    <Select
                        value={String(draft.duration)}
                        onValueChange={(value) => onDraftChange({ ...draft, duration: parseInt(value) })}
                    >
                        <SelectTrigger className={FIELD_CLASS}>
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            {DURATION_OPTIONS.map((option) => (
                                <SelectItem key={option.value} value={String(option.value)}>{option.label}</SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>
            </div>
        </div>
    );

    return (
        <div className="space-y-3 md:hidden">
            {adding && (
                <div className="animate-fade-in rounded-lg border border-on-air/30 bg-muted/50 p-4">
                    <h4 className="mb-3 text-xs font-bold tracking-wider text-on-air-bright uppercase">New Schedule</h4>
                    {form}
                    <Button variant="success" onClick={() => onSave()} className="mt-3 w-full font-bold">
                        SAVE SCHEDULE
                    </Button>
                </div>
            )}

            {jobs.length === 0 && !adding && (
                <div className="py-8 text-center text-sm text-subtle-foreground italic">
                    No scheduled broadcasts.
                </div>
            )}

            {jobs.map((job) => {
                const live = isScheduleLive(job, status);

                if (editingId === job.id) {
                    return (
                        <div key={job.id} ref={cardRef} className="animate-fade-in rounded-lg border border-on-air/30 bg-card p-4">
                            <div className="mb-2 flex items-center justify-between">
                                <span className="text-xs font-bold text-on-air-bright uppercase">Editing Schedule</span>
                            </div>
                            {form}
                            <div className="mt-3 flex gap-2">
                                <Button variant="secondary" onClick={onCancel} className="flex-1 font-bold">
                                    CANCEL
                                </Button>
                                <Button onClick={() => onSave(job.id)} className="flex-1 font-bold">
                                    UPDATE
                                </Button>
                            </div>
                        </div>
                    );
                }

                return (
                    <div
                        key={job.id}
                        onClick={() => !live && !locked && onEdit(job)}
                        className={`rounded-lg border p-4 ${live ? 'border-success/50 bg-success/10' : 'border-border bg-muted/50'} ${(!job.enabled || locked) ? 'opacity-60' : ''} ${(!live && !locked) ? 'cursor-pointer' : ''}`}
                    >
                        <div className="mb-3 flex items-start justify-between">
                            <div className="flex items-center gap-2">
                                <Clock size={16} className={live ? 'text-success' : 'text-subtle-foreground'} />
                                <span className={`font-mono text-xl font-bold ${live ? 'text-success' : 'text-heading'}`}>
                                    {job.friendly_time}
                                </span>
                            </div>
                            <div onClick={(e) => e.stopPropagation()}>
                                <Switch
                                    checked={job.enabled && !locked}
                                    disabled={locked}
                                    onCheckedChange={(checked) => !locked && onToggle(job, checked)}
                                    aria-label="Toggle schedule"
                                    className="data-[state=checked]:bg-success-strong"
                                />
                            </div>
                        </div>

                        <div className="mb-4 grid grid-cols-3 gap-2 text-xs">
                            <div className="rounded border border-border/50 bg-surface-sunken/50 p-2">
                                <div className="mb-0.5 text-[10px] font-bold text-subtle-foreground uppercase">FREQ</div>
                                <div className="capitalize text-foreground">{job.friendly_freq}</div>
                            </div>
                            <div className="rounded border border-border/50 bg-surface-sunken/50 p-2">
                                <div className="mb-0.5 text-[10px] font-bold text-subtle-foreground uppercase">SERVICE</div>
                                <div className="font-bold text-on-air-bright">{job.radio_details.service}</div>
                            </div>
                            <div className="rounded border border-border/50 bg-surface-sunken/50 p-2">
                                <div className="mb-0.5 text-[10px] font-bold text-subtle-foreground uppercase">DUR</div>
                                <div className="font-mono text-foreground">{durationLabel(parseInt(job.radio_details.duration))}</div>
                            </div>
                        </div>

                        <div className="flex justify-end gap-2 border-t border-border/50 pt-3" onClick={(e) => e.stopPropagation()}>
                            {live ? (
                                <div className="flex w-full items-center justify-center gap-2 rounded bg-success/10 py-1.5 text-sm font-bold text-success">
                                    <Zap size={14} fill="currentColor" /> LIVE BROADCAST
                                </div>
                            ) : (
                                <>
                                    <Button variant="secondary" size="sm" onClick={() => onEdit(job)} className="flex-1 text-xs font-bold">
                                        <Edit2 size={12} /> EDIT
                                    </Button>
                                    <Button variant="softDanger" size="sm" onClick={() => onDelete(job.id)} className="flex-1 text-xs font-bold">
                                        <Trash2 size={12} /> DELETE
                                    </Button>
                                </>
                            )}
                        </div>
                    </div>
                );
            })}
        </div>
    );
}
