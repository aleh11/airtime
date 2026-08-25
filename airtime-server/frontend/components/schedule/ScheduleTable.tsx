import type { RefObject } from 'react';
import { Clock, Edit2, RefreshCw, Trash2, Zap } from 'lucide-react';
import { CronJob, ServiceType, SystemStatus } from '../../types';
import { DURATION_OPTIONS, durationLabel, isScheduleLive } from './scheduleFormat';
import { ScheduleDraft } from '../../hooks/useScheduleEditor';
import { SortColumn, SortDirection } from '../../hooks/useScheduleSorting';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Switch } from '../ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../ui/table';

interface ScheduleTableProps {
    jobs: CronJob[];
    status: SystemStatus | null;
    locked: boolean;
    draft: ScheduleDraft;
    adding: boolean;
    editingId: string | null;
    rowRef: RefObject<HTMLTableRowElement | null>;
    sortColumn: SortColumn;
    sortDirection: SortDirection;
    onSort: (column: SortColumn) => void;
    onDraftChange: (draft: ScheduleDraft) => void;
    onSave: (id?: string) => void;
    onCancel: () => void;
    onEdit: (job: CronJob) => void;
    onDelete: (id: string) => void;
    onToggle: (job: CronJob, enabled: boolean) => void;
}

const FIELD_CLASS = 'h-8 bg-surface-sunken text-xs';

export function ScheduleTable({
    jobs, status, locked, draft, adding, editingId, rowRef,
    sortColumn, sortDirection, onSort, onDraftChange, onSave, onCancel, onEdit, onDelete, onToggle,
}: ScheduleTableProps) {
    const SortIcon = ({ column }: { column: SortColumn }) => {
        if (sortColumn !== column) return <div className="ml-1 w-2" />;
        return (
            <div className="ml-1 flex flex-col text-[8px] leading-[8px]">
                <span className={sortDirection === 'asc' ? 'text-on-air-bright' : 'text-faint-foreground'}>▲</span>
                <span className={sortDirection === 'desc' ? 'text-on-air-bright' : 'text-faint-foreground'}>▼</span>
            </div>
        );
    };

    const columns: { key: SortColumn; label: string }[] = [
        { key: 'time', label: 'Time' },
        { key: 'freq', label: 'Frequency' },
        { key: 'service', label: 'Service' },
        { key: 'duration', label: 'Duration' },
    ];

    const formFields = (
        <>
            <TableCell className="py-3 pl-4">
                <Input
                    type="time"
                    value={draft.time}
                    onChange={(e) => onDraftChange({ ...draft, time: e.target.value })}
                    className={`${FIELD_CLASS} w-28`}
                />
            </TableCell>
            <TableCell className="py-3">
                <Select value={draft.frequency} onValueChange={(value) => onDraftChange({ ...draft, frequency: value })}>
                    <SelectTrigger size="sm" className={`${FIELD_CLASS} w-28`}>
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="daily">Daily</SelectItem>
                        <SelectItem value="weekly">Weekly</SelectItem>
                    </SelectContent>
                </Select>
            </TableCell>
            <TableCell className="py-3">
                <Select value={draft.standard} onValueChange={(value) => onDraftChange({ ...draft, standard: value })}>
                    <SelectTrigger size="sm" className={`${FIELD_CLASS} w-24`}>
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        {Object.values(ServiceType).map((standard) => (
                            <SelectItem key={standard} value={standard}>{standard}</SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            </TableCell>
            <TableCell className="py-3">
                <Select
                    value={String(draft.duration)}
                    onValueChange={(value) => onDraftChange({ ...draft, duration: parseInt(value) })}
                >
                    <SelectTrigger size="sm" className={`${FIELD_CLASS} w-24`}>
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        {DURATION_OPTIONS.map((option) => (
                            <SelectItem key={option.value} value={String(option.value)}>{option.label}</SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            </TableCell>
            <TableCell className="py-3 text-center" />
        </>
    );

    return (
        <div className="hidden md:block">
            <Table className="text-left">
                <TableHeader>
                    <TableRow className="border-b border-border hover:bg-transparent">
                        {columns.map((column, index) => (
                            <TableHead
                                key={column.key}
                                className={`h-auto pb-3 text-xs font-bold text-subtle-foreground uppercase ${index === 0 ? 'pl-4' : ''} group cursor-pointer transition-colors select-none hover:text-on-air-bright`}
                                onClick={() => onSort(column.key)}
                            >
                                <div className="flex items-center gap-1">
                                    {column.label}
                                    <SortIcon column={column.key} />
                                </div>
                            </TableHead>
                        ))}
                        <TableHead className="h-auto pb-3 text-center text-xs font-bold text-subtle-foreground uppercase">Active</TableHead>
                        <TableHead className="h-auto pr-4 pb-3 text-right text-xs font-bold text-subtle-foreground uppercase">Actions</TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody className="text-sm">
                    {jobs.length === 0 && !adding && (
                        <TableRow className="hover:bg-transparent">
                            <TableCell colSpan={6} className="py-8 text-center text-subtle-foreground italic">
                                No scheduled broadcasts active.
                            </TableCell>
                        </TableRow>
                    )}

                    {adding && (
                        <TableRow className="border-b border-secondary bg-on-air/10 hover:bg-on-air/10">
                            {formFields}
                            <TableCell className="py-3 pr-4 text-right">
                                <Button variant="softSuccess" size="xs" onClick={() => onSave()} className="font-bold">
                                    SAVE
                                </Button>
                            </TableCell>
                        </TableRow>
                    )}

                    {jobs.map((job) => {
                        const live = isScheduleLive(job, status);

                        if (editingId === job.id) {
                            return (
                                <TableRow key={job.id} ref={rowRef} className="border-b border-secondary bg-secondary/50 hover:bg-secondary/50">
                                    {formFields}
                                    <TableCell className="py-3 pr-4 text-right">
                                        <div className="flex items-center justify-end gap-2">
                                            <Button variant="ghost" size="xs" onClick={onCancel} className="font-medium text-muted-foreground">
                                                CANCEL
                                            </Button>
                                            <Button variant="softPrimary" size="xs" onClick={() => onSave(job.id)} className="font-bold">
                                                UPDATE
                                            </Button>
                                        </div>
                                    </TableCell>
                                </TableRow>
                            );
                        }

                        return (
                            <TableRow
                                key={job.id}
                                onClick={() => !live && !locked && onEdit(job)}
                                className={`group border-b border-muted transition-all duration-300
                                    ${(!job.enabled || locked) ? 'opacity-50' : ''}
                                    ${live ? 'bg-success/10 hover:bg-success/10' : (locked ? 'cursor-not-allowed bg-muted/20 hover:bg-muted/20' : 'cursor-pointer hover:bg-secondary/20')}`}
                            >
                                <TableCell className={`border-l-2 py-4 pl-4 font-mono font-bold text-foreground ${live ? 'border-success-strong' : 'border-transparent'}`}>
                                    <div className="flex items-center gap-2">
                                        <Clock size={14} className={live ? 'animate-pulse text-success' : 'text-subtle-foreground'} />
                                        <span className={live ? 'text-success drop-shadow-sm' : ''}>{job.friendly_time}</span>
                                    </div>
                                </TableCell>
                                <TableCell className="py-4 text-muted-foreground">
                                    <div className="flex items-center gap-2">
                                        <RefreshCw size={14} className="text-faint-foreground" />
                                        <span className="capitalize">{job.friendly_freq}</span>
                                    </div>
                                </TableCell>
                                <TableCell className="py-4">
                                    <Badge variant={live ? 'success' : 'onAir'} className="rounded border px-2 py-0.5 text-xs font-medium">
                                        {job.radio_details.service}
                                    </Badge>
                                </TableCell>
                                <TableCell className="py-4 font-mono text-xs text-muted-foreground">
                                    {durationLabel(parseInt(job.radio_details.duration))}
                                </TableCell>
                                <TableCell className="py-4 text-center" onClick={(e) => e.stopPropagation()}>
                                    <Switch
                                        checked={job.enabled && !locked}
                                        disabled={locked}
                                        onCheckedChange={(checked) => !locked && onToggle(job, checked)}
                                        aria-label="Toggle schedule"
                                        className="data-[state=checked]:bg-success-strong"
                                    />
                                </TableCell>
                                <TableCell className="py-4 pr-4 text-right" onClick={(e) => e.stopPropagation()}>
                                    {live ? (
                                        <div className="flex items-center justify-end gap-2 text-xs font-bold text-success">
                                            LIVE <Zap size={12} fill="currentColor" />
                                        </div>
                                    ) : (
                                        <div className="flex items-center justify-end gap-2">
                                            <Button
                                                variant="ghost"
                                                size="icon-xs"
                                                onClick={() => onEdit(job)}
                                                aria-label="Edit schedule"
                                                className="text-faint-foreground opacity-0 group-hover:opacity-100 hover:bg-on-air/20 hover:text-on-air-bright"
                                            >
                                                <Edit2 size={14} />
                                            </Button>
                                            <Button
                                                variant="ghost"
                                                size="icon-xs"
                                                onClick={() => onDelete(job.id)}
                                                aria-label="Delete schedule"
                                                className="text-faint-foreground opacity-0 group-hover:opacity-100 hover:bg-danger/20 hover:text-danger"
                                            >
                                                <Trash2 size={14} />
                                            </Button>
                                        </div>
                                    )}
                                </TableCell>
                            </TableRow>
                        );
                    })}
                </TableBody>
            </Table>
        </div>
    );
}
