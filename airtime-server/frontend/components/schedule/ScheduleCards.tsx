import type { RefObject } from 'react';
import { Clock, Edit2, Trash2, Zap } from 'lucide-react';
import { CronJob, ServiceType, SystemStatus } from '../../types';
import { DURATION_OPTIONS, durationLabel, isScheduleLive } from './scheduleFormat';
import { ScheduleDraft } from '../../hooks/useScheduleEditor';

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

const fieldClass = 'w-full bg-slate-900 border border-slate-600 rounded px-2 h-9 text-sm text-slate-200 py-0 leading-none';
const labelClass = 'text-[10px] text-slate-500 font-bold uppercase mb-1 block';

export function ScheduleCards({
    jobs, status, locked, draft, adding, editingId, cardRef,
    onDraftChange, onSave, onCancel, onEdit, onDelete, onToggle,
}: ScheduleCardsProps) {
    const form = (
        <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
                <div>
                    <label className={labelClass}>Time</label>
                    <input
                        type="time"
                        value={draft.time}
                        onChange={(e) => onDraftChange({ ...draft, time: e.target.value })}
                        className={`${fieldClass} w-32`}
                    />
                </div>
                <div>
                    <label className={labelClass}>Frequency</label>
                    <select
                        value={draft.frequency}
                        onChange={(e) => onDraftChange({ ...draft, frequency: e.target.value })}
                        className={fieldClass}
                    >
                        <option value="daily">Daily</option>
                        <option value="weekly">Weekly</option>
                    </select>
                </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
                <div>
                    <label className={labelClass}>Service</label>
                    <select
                        value={draft.standard}
                        onChange={(e) => onDraftChange({ ...draft, standard: e.target.value })}
                        className={fieldClass}
                    >
                        {Object.values(ServiceType).map((standard) => <option key={standard} value={standard}>{standard}</option>)}
                    </select>
                </div>
                <div>
                    <label className={labelClass}>Duration</label>
                    <select
                        value={draft.duration}
                        onChange={(e) => onDraftChange({ ...draft, duration: parseInt(e.target.value) })}
                        className={fieldClass}
                    >
                        {DURATION_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                    </select>
                </div>
            </div>
        </div>
    );

    return (
        <div className="md:hidden space-y-3">
            {adding && (
                <div className="bg-slate-800/50 border border-cyan-500/30 rounded-lg p-4 animate-fade-in">
                    <h4 className="text-xs font-bold text-cyan-400 mb-3 uppercase tracking-wider">New Schedule</h4>
                    {form}
                    <button onClick={() => onSave()} className="w-full mt-3 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded text-sm transition-colors">
                        SAVE SCHEDULE
                    </button>
                </div>
            )}

            {jobs.length === 0 && !adding && (
                <div className="text-center py-8 text-slate-500 italic text-sm">
                    No scheduled broadcasts.
                </div>
            )}

            {jobs.map((job) => {
                const live = isScheduleLive(job, status);

                if (editingId === job.id) {
                    return (
                        <div key={job.id} ref={cardRef} className="bg-slate-800 border border-cyan-500/30 rounded-lg p-4 animate-fade-in">
                            <div className="flex justify-between items-center mb-2">
                                <span className="text-xs font-bold text-cyan-400 uppercase">Editing Schedule</span>
                            </div>
                            {form}
                            <div className="flex gap-2 mt-3">
                                <button onClick={onCancel} className="flex-1 py-2 bg-slate-700 hover:bg-slate-600 text-slate-200 font-bold rounded text-sm transition-colors">
                                    CANCEL
                                </button>
                                <button onClick={() => onSave(job.id)} className="flex-1 py-2 bg-cyan-600 hover:bg-cyan-500 text-white font-bold rounded text-sm transition-colors">
                                    UPDATE
                                </button>
                            </div>
                        </div>
                    );
                }

                return (
                    <div
                        key={job.id}
                        onClick={() => !live && !locked && onEdit(job)}
                        className={`p-4 rounded-lg border ${live ? 'bg-emerald-900/10 border-emerald-500/50' : 'bg-slate-800/50 border-slate-700'} ${(!job.enabled || locked) ? 'opacity-60' : ''} ${(!live && !locked) ? 'cursor-pointer' : ''}`}
                    >
                        <div className="flex justify-between items-start mb-3">
                            <div className="flex items-center gap-2">
                                <Clock size={16} className={live ? 'text-emerald-400' : 'text-slate-500'} />
                                <span className={`text-xl font-mono font-bold ${live ? 'text-emerald-300' : 'text-white'}`}>
                                    {job.friendly_time}
                                </span>
                            </div>
                            <button
                                onClick={(e) => { e.stopPropagation(); if (!locked) onToggle(job, !job.enabled); }}
                                className={`w-10 h-5 rounded-full p-0.5 transition-colors duration-200 ease-in-out relative inline-flex items-center ${(job.enabled && !locked) ? 'bg-emerald-500' : 'bg-slate-600'} ${locked ? 'cursor-not-allowed' : ''}`}
                                aria-label="Toggle schedule"
                            >
                                <div className={`bg-white w-4 h-4 rounded-full shadow transform transition-transform duration-200 ${(job.enabled && !locked) ? 'translate-x-5' : 'translate-x-0'}`} />
                            </button>
                        </div>

                        <div className="grid grid-cols-3 gap-2 text-xs mb-4">
                            <div className="bg-slate-900/50 p-2 rounded border border-slate-700/50">
                                <div className="text-slate-500 uppercase text-[10px] font-bold mb-0.5">FREQ</div>
                                <div className="text-slate-300 capitalize">{job.friendly_freq}</div>
                            </div>
                            <div className="bg-slate-900/50 p-2 rounded border border-slate-700/50">
                                <div className="text-slate-500 uppercase text-[10px] font-bold mb-0.5">SERVICE</div>
                                <div className="text-cyan-300 font-bold">{job.radio_details.service}</div>
                            </div>
                            <div className="bg-slate-900/50 p-2 rounded border border-slate-700/50">
                                <div className="text-slate-500 uppercase text-[10px] font-bold mb-0.5">DUR</div>
                                <div className="text-slate-300 font-mono">{durationLabel(parseInt(job.radio_details.duration))}</div>
                            </div>
                        </div>

                        <div className="flex justify-end gap-2 border-t border-slate-700/50 pt-3" onClick={(e) => e.stopPropagation()}>
                            {live ? (
                                <div className="w-full flex items-center justify-center gap-2 text-emerald-400 font-bold text-sm bg-emerald-500/10 py-1.5 rounded">
                                    <Zap size={14} fill="currentColor" /> LIVE BROADCAST
                                </div>
                            ) : (
                                <>
                                    <button
                                        onClick={() => onEdit(job)}
                                        className="flex-1 py-1.5 bg-slate-700 hover:bg-slate-600 text-slate-300 text-xs font-bold rounded flex items-center justify-center gap-2 transition-colors"
                                    >
                                        <Edit2 size={12} /> EDIT
                                    </button>
                                    <button
                                        onClick={() => onDelete(job.id)}
                                        className="flex-1 py-1.5 bg-red-900/20 hover:bg-red-900/40 text-red-400 text-xs font-bold rounded flex items-center justify-center gap-2 transition-colors border border-red-900/30"
                                    >
                                        <Trash2 size={12} /> DELETE
                                    </button>
                                </>
                            )}
                        </div>
                    </div>
                );
            })}
        </div>
    );
}
