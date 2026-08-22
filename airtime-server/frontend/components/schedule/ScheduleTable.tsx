import type { RefObject } from 'react';
import { Clock, Edit2, RefreshCw, Trash2, Zap } from 'lucide-react';
import { CronJob, ServiceType, SystemStatus } from '../../types';
import { DURATION_OPTIONS, durationLabel, isScheduleLive } from './scheduleFormat';
import { ScheduleDraft } from '../../hooks/useScheduleEditor';
import { SortColumn, SortDirection } from '../../hooks/useScheduleSorting';

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

const inputClass = 'bg-slate-900 border border-slate-600 rounded px-2 py-1 text-xs text-slate-200';

export function ScheduleTable({
    jobs, status, locked, draft, adding, editingId, rowRef,
    sortColumn, sortDirection, onSort, onDraftChange, onSave, onCancel, onEdit, onDelete, onToggle,
}: ScheduleTableProps) {
    const SortIcon = ({ column }: { column: SortColumn }) => {
        if (sortColumn !== column) return <div className="ml-1 w-2" />;
        return (
            <div className="flex flex-col text-[8px] leading-[8px] ml-1">
                <span className={sortDirection === 'asc' ? 'text-cyan-400' : 'text-slate-600'}>▲</span>
                <span className={sortDirection === 'desc' ? 'text-cyan-400' : 'text-slate-600'}>▼</span>
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
            <td className="py-3 pl-4">
                <input
                    type="time"
                    value={draft.time}
                    onChange={(e) => onDraftChange({ ...draft, time: e.target.value })}
                    className={`${inputClass} w-24`}
                />
            </td>
            <td className="py-3">
                <select
                    value={draft.frequency}
                    onChange={(e) => onDraftChange({ ...draft, frequency: e.target.value })}
                    className={inputClass}
                >
                    <option value="daily">Daily</option>
                    <option value="weekly">Weekly</option>
                </select>
            </td>
            <td className="py-3">
                <select
                    value={draft.standard}
                    onChange={(e) => onDraftChange({ ...draft, standard: e.target.value })}
                    className={`${inputClass} w-20`}
                >
                    {Object.values(ServiceType).map((standard) => <option key={standard} value={standard}>{standard}</option>)}
                </select>
            </td>
            <td className="py-3">
                <select
                    value={draft.duration}
                    onChange={(e) => onDraftChange({ ...draft, duration: parseInt(e.target.value) })}
                    className={`${inputClass} w-20`}
                >
                    {DURATION_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                </select>
            </td>
            <td className="py-3 text-center" />
        </>
    );

    return (
        <table className="hidden md:table w-full text-left border-collapse">
            <thead>
                <tr className="text-xs font-bold text-slate-500 uppercase border-b border-slate-700">
                    {columns.map((column, index) => (
                        <th
                            key={column.key}
                            className={`pb-3 ${index === 0 ? 'pl-4' : ''} cursor-pointer hover:text-cyan-400 transition-colors select-none group`}
                            onClick={() => onSort(column.key)}
                        >
                            <div className="flex items-center gap-1">
                                {column.label}
                                <SortIcon column={column.key} />
                            </div>
                        </th>
                    ))}
                    <th className="pb-3 text-center">Active</th>
                    <th className="pb-3 text-right pr-4">Actions</th>
                </tr>
            </thead>
            <tbody className="text-sm">
                {jobs.length === 0 && !adding && (
                    <tr>
                        <td colSpan={6} className="py-8 text-center text-slate-500 italic">
                            No scheduled broadcasts active.
                        </td>
                    </tr>
                )}

                {adding && (
                    <tr className="border-b border-slate-600 bg-cyan-900/20">
                        {formFields}
                        <td className="py-3 text-right pr-4">
                            <button onClick={() => onSave()} className="text-emerald-400 hover:text-emerald-300 text-xs font-bold bg-emerald-500/10 px-2 py-1 rounded border border-emerald-500/30">
                                SAVE
                            </button>
                        </td>
                    </tr>
                )}

                {jobs.map((job) => {
                    const live = isScheduleLive(job, status);

                    if (editingId === job.id) {
                        return (
                            <tr key={job.id} ref={rowRef} className="border-b border-slate-600 bg-slate-700/50">
                                {formFields}
                                <td className="py-3 text-right pr-4">
                                    <div className="flex items-center justify-end gap-2">
                                        <button onClick={onCancel} className="text-slate-400 hover:text-slate-200 text-xs font-medium px-2 py-1">
                                            CANCEL
                                        </button>
                                        <button onClick={() => onSave(job.id)} className="text-cyan-400 hover:text-cyan-300 text-xs font-bold bg-cyan-500/10 px-2 py-1 rounded border border-cyan-500/30">
                                            UPDATE
                                        </button>
                                    </div>
                                </td>
                            </tr>
                        );
                    }

                    return (
                        <tr
                            key={job.id}
                            onClick={() => !live && !locked && onEdit(job)}
                            className={`border-b border-slate-800 transition-all duration-300 group
                                ${(!job.enabled || locked) ? 'opacity-50' : ''}
                                ${live ? 'bg-emerald-500/10' : (locked ? 'cursor-not-allowed bg-slate-800/20' : 'cursor-pointer hover:bg-slate-700/20')}`}
                        >
                            <td className={`py-4 pl-4 font-mono font-bold text-slate-200 border-l-2 ${live ? 'border-emerald-500' : 'border-transparent'}`}>
                                <div className="flex items-center gap-2">
                                    <Clock size={14} className={live ? 'text-emerald-400 animate-pulse' : 'text-slate-500'} />
                                    <span className={live ? 'text-emerald-300 drop-shadow-sm' : ''}>{job.friendly_time}</span>
                                </div>
                            </td>
                            <td className="py-4 text-slate-400">
                                <div className="flex items-center gap-2">
                                    <RefreshCw size={14} className="text-slate-600" />
                                    <span className="capitalize">{job.friendly_freq}</span>
                                </div>
                            </td>
                            <td className="py-4">
                                <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium border ${live ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/50' : 'bg-cyan-900/30 text-cyan-400 border-cyan-800'}`}>
                                    {job.radio_details.service}
                                </span>
                            </td>
                            <td className="py-4 text-slate-400 font-mono text-xs">
                                {durationLabel(parseInt(job.radio_details.duration))}
                            </td>
                            <td className="py-4 text-center" onClick={(e) => e.stopPropagation()}>
                                <button
                                    onClick={() => !locked && onToggle(job, !job.enabled)}
                                    className={`w-8 h-4 rounded-full p-0.5 transition-colors duration-200 ease-in-out relative inline-flex items-center ${(job.enabled && !locked) ? 'bg-emerald-500/80' : 'bg-slate-600'} ${locked ? 'cursor-not-allowed' : ''}`}
                                    aria-label="Toggle schedule"
                                >
                                    <div className={`bg-white w-3 h-3 rounded-full shadow transform transition-transform duration-200 ${(job.enabled && !locked) ? 'translate-x-4' : 'translate-x-0'}`} />
                                </button>
                            </td>
                            <td className="py-4 text-right pr-4" onClick={(e) => e.stopPropagation()}>
                                {live ? (
                                    <div className="flex items-center justify-end gap-2 text-emerald-400 text-xs font-bold">
                                        LIVE <Zap size={12} fill="currentColor" />
                                    </div>
                                ) : (
                                    <div className="flex items-center justify-end gap-2">
                                        <button
                                            onClick={() => onEdit(job)}
                                            className="p-1.5 rounded hover:bg-cyan-500/20 text-slate-600 hover:text-cyan-400 transition-colors opacity-0 group-hover:opacity-100"
                                        >
                                            <Edit2 size={14} />
                                        </button>
                                        <button
                                            onClick={() => onDelete(job.id)}
                                            className="p-1.5 rounded hover:bg-red-500/20 text-slate-600 hover:text-red-400 transition-colors opacity-0 group-hover:opacity-100"
                                        >
                                            <Trash2 size={14} />
                                        </button>
                                    </div>
                                )}
                            </td>
                        </tr>
                    );
                })}
            </tbody>
        </table>
    );
}
