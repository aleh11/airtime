import React, { useState } from 'react';
import { Card } from './Card';
import { CronJob, CronJobInput, ServiceType, RadioConfig, SystemStatus } from '../types';
import { api } from '../services/api';
import { Trash2, Plus, Clock, RefreshCw, X, Edit2, Zap, Globe } from 'lucide-react';
import { ConfirmModal, ModalType } from './ConfirmModal';

// Duration options for dropdowns (Removed 6 hr)
const DURATION_OPTIONS = [
    { label: '10 min', value: 10 },
    { label: '20 min', value: 20 },
    { label: '30 min', value: 30 },
    { label: '1 hr', value: 60 },
    { label: '2 hr', value: 120 },
    { label: '4 hr', value: 240 },
    { label: '6 hr', value: 360 },
];

interface ScheduleWidgetProps {
    jobs: CronJob[];
    onUpdate: () => void;
    radioConfig: RadioConfig | null;
    status: SystemStatus | null;
}

export const ScheduleWidget: React.FC<ScheduleWidgetProps> = ({ jobs, onUpdate, radioConfig, status }) => {
    const [isAdding, setIsAdding] = useState(false);
    const [isEditing, setIsEditing] = useState(false);
    const [editingJobId, setEditingJobId] = useState<string | null>(null);
    const [newJob, setNewJob] = useState<Partial<CronJobInput>>({
        frequency: 'daily',
        time: '12:00',
        enabled: true
    });
    const [selectedService, setSelectedService] = useState('DCF77');
    const [duration, setDuration] = useState(10);

    // Sort State
    const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');
    const [sortColumn, setSortColumn] = useState<string>('time');

    // Sort Logic
    const sortedJobs = [...jobs].sort((a, b) => {
        let valA: any = '';
        let valB: any = '';

        switch (sortColumn) {
            case 'time':
                valA = a.friendly_time;
                valB = b.friendly_time;
                break;
            case 'freq':
                valA = a.friendly_freq;
                valB = b.friendly_freq;
                break;
            case 'service':
                valA = a.radio_details.service;
                valB = b.radio_details.service;
                break;
            case 'duration':
                valA = parseInt(a.radio_details.duration);
                valB = parseInt(b.radio_details.duration);
                break;
            default:
                valA = a.friendly_time;
                valB = b.friendly_time;
        }

        if (valA === valB) return 0;

        if (sortDirection === 'asc') {
            return valA > valB ? 1 : -1;
        } else {
            return valA < valB ? 1 : -1;
        }
    });

    const toggleSort = (column: string) => {
        if (sortColumn === column) {
            setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
        } else {
            setSortColumn(column);
            setSortDirection('asc');
        }
    };

    const SortIcon = ({ column }: { column: string }) => {
        if (sortColumn !== column) return <div className="ml-1 w-2" />; // Spacer
        return (
            <div className="flex flex-col text-[8px] leading-[8px] ml-1">
                <span className={sortDirection === 'asc' ? 'text-cyan-400' : 'text-slate-600'}>▲</span>
                <span className={sortDirection === 'desc' ? 'text-cyan-400' : 'text-slate-600'}>▼</span>
            </div>
        );
    };

    // Modal State
    const [modalConfig, setModalConfig] = useState<{
        isOpen: boolean;
        title: string;
        message: string;
        type: ModalType;
        onConfirm?: () => void;
        confirmText?: string;
    }>({ isOpen: false, title: '', message: '', type: 'info' });

    const closeModal = () => setModalConfig(prev => ({ ...prev, isOpen: false }));

    const handleDelete = (id: string) => {
        setModalConfig({
            isOpen: true,
            title: 'Delete Schedule',
            message: 'Are you sure you want to delete this scheduled broadcast? This action cannot be undone.',
            type: 'danger',
            confirmText: 'Delete',
            onConfirm: async () => {
                try {
                    await api.deleteCron(id);
                    onUpdate();
                } catch (e) {
                    console.error(e);
                    // Optionally show error alert here if needed
                }
            }
        });
    };

    const handleToggle = async (job: CronJob) => {
        try {
            // Invert enabled state but preserve everything else
            const updatedJob: CronJobInput = {
                id: job.id,
                time: job.friendly_time,
                frequency: job.friendly_freq,
                command: job.command,
                enabled: !job.enabled
            };
            await api.addOrUpdateCron(updatedJob);
            onUpdate();
        } catch (e) {
            console.error("Failed to toggle job", e);
        }
    };

    const handleEdit = (job: CronJob) => {
        // Parse existing job data
        setSelectedService(job.radio_details.service);
        setDuration(parseInt(job.radio_details.duration));

        setNewJob({
            time: job.friendly_time,
            frequency: job.friendly_freq,
            enabled: job.enabled
        });

        // Enter edit mode
        setEditingJobId(job.id);
        setIsEditing(true);
        setIsAdding(false);
    };

    const handleSave = async (id?: string) => {
        const jobData = id ? newJob : newJob;

        if (!jobData.time || !jobData.frequency) return;

        // Construct command string 
        // Apply Global Offset Logic:
        // Read global offset from radioConfig (minutes)
        const globalOffset = radioConfig?.default_offset || 0;

        let command = `/usr/bin/txtempus -s ${selectedService} -r ${duration}`;
        if (globalOffset !== 0) {
            command += ` -z ${globalOffset}`;
        }

        const jobInput: CronJobInput = {
            id: id || `job-${Date.now()}`,
            time: jobData.time || "12:00",
            frequency: jobData.frequency || "daily",
            command: command,
            enabled: true
        };

        try {
            await api.addOrUpdateCron(jobInput);

            // Reset state
            setIsAdding(false);
            setEditingJobId(null);
            setIsEditing(false);

            // Reset form defaults for "Add New"
            if (!id) {
                setNewJob({
                    frequency: 'daily',
                    time: '12:00',
                    enabled: true
                });
                setSelectedService('DCF77');
                setDuration(10);
            }

            onUpdate();
        } catch (e) {
            console.error(e);
            setModalConfig({
                isOpen: true,
                title: 'Error',
                message: 'Failed to save schedule. Please check the logs.',
                type: 'warning'
            });
        }
    };

    // Helper to check if a job is currently active
    const isJobActive = (job: CronJob): boolean => {
        if (!status?.services.txtempus_running) return false;

        // 1. Check Duration Match
        const currentDuration = status.services.txtempus_duration;
        const jobDuration = parseInt(job.radio_details.duration);
        if (currentDuration !== jobDuration) return false;

        // 2. Check Service Match (Optional but good)
        // If the user wants to strictly match service too:
        if (status.services.txtempus_service && job.radio_details.service !== status.services.txtempus_service) {
            return false;
        }

        // 3. Time Match (Start time within 1 min of job time)
        // txtempus_started_at is usually ISO string or similar.
        // We will construct date objects to compare HH:MM
        if (!status.services.txtempus_started_at) return false;

        try {
            const startDate = new Date(status.services.txtempus_started_at);
            const startHours = startDate.getHours();
            const startMinutes = startDate.getMinutes();

            const [jobHours, jobMinutes] = job.friendly_time.split(':').map(Number);

            // Calculate total minutes from start of day to handle wrap-around simplisticly or direct compare
            const startTotal = startHours * 60 + startMinutes;
            const jobTotal = jobHours * 60 + jobMinutes;

            const diff = Math.abs(startTotal - jobTotal);
            // Allow 1 minute variance
            return diff <= 1;
        } catch (e) {
            return false;
        }
    };

    return (
        <>
            <Card
                title="Broadcast Schedule"
                className="h-full"
                action={
                    <button
                        onClick={() => {
                            if (isAdding) {
                                setIsAdding(false);
                            } else {
                                // Reset form for adding
                                setNewJob({
                                    frequency: 'daily',
                                    time: '12:00',
                                    enabled: true
                                });
                                setSelectedService('DCF77');
                                setDuration(10);
                                setEditingJobId(null); // Cancel any inline edits
                                setIsAdding(true);
                            }
                        }}
                        className="p-2 bg-slate-700 hover:bg-slate-600 rounded-full text-slate-200 transition-colors"
                    >
                        {isAdding ? <X size={16} /> : <Plus size={16} />}
                    </button>
                }
            >
                <div className="overflow-x-auto">
                    {/* Desktop Table View */}
                    <table className="hidden md:table w-full text-left border-collapse">
                        <thead>
                            <tr className="text-xs font-bold text-slate-500 uppercase border-b border-slate-700">
                                <th
                                    className="pb-3 pl-4 cursor-pointer hover:text-cyan-400 transition-colors select-none group"
                                    onClick={() => toggleSort('time')}
                                >
                                    <div className="flex items-center gap-1">
                                        Time
                                        <SortIcon column="time" />
                                    </div>
                                </th>
                                <th
                                    className="pb-3 cursor-pointer hover:text-cyan-400 transition-colors select-none group"
                                    onClick={() => toggleSort('freq')}
                                >
                                    <div className="flex items-center gap-1">
                                        Frequency
                                        <SortIcon column="freq" />
                                    </div>
                                </th>
                                <th
                                    className="pb-3 cursor-pointer hover:text-cyan-400 transition-colors select-none group"
                                    onClick={() => toggleSort('service')}
                                >
                                    <div className="flex items-center gap-1">
                                        Service
                                        <SortIcon column="service" />
                                    </div>
                                </th>
                                <th
                                    className="pb-3 cursor-pointer hover:text-cyan-400 transition-colors select-none group"
                                    onClick={() => toggleSort('duration')}
                                >
                                    <div className="flex items-center gap-1">
                                        Duration
                                        <SortIcon column="duration" />
                                    </div>
                                </th>
                                <th className="pb-3 text-center">Active</th>
                                <th className="pb-3 text-right pr-4">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="text-sm">
                            {jobs.length === 0 && !isAdding && (
                                <tr>
                                    <td colSpan={6} className="py-8 text-center text-slate-500 italic">
                                        No scheduled broadcasts active.
                                    </td>
                                </tr>
                            )}

                            {/* New Job Form Row (Desktop) */}
                            {isAdding && (
                                <tr className="border-b border-slate-600 bg-cyan-900/20">
                                    <td className="py-3 pl-4">
                                        <input
                                            type="time"
                                            value={newJob.time}
                                            onChange={e => setNewJob({ ...newJob, time: e.target.value })}
                                            className="bg-slate-900 border border-slate-600 rounded px-2 py-1 text-xs w-24 text-slate-200"
                                        />
                                    </td>
                                    <td className="py-3">
                                        <select
                                            value={newJob.frequency}
                                            onChange={e => setNewJob({ ...newJob, frequency: e.target.value })}
                                            className="bg-slate-900 border border-slate-600 rounded px-2 py-1 text-xs text-slate-200"
                                        >
                                            <option value="daily">Daily</option>
                                            <option value="weekly">Weekly</option>
                                        </select>
                                    </td>
                                    <td className="py-3">
                                        <select
                                            value={selectedService}
                                            onChange={e => setSelectedService(e.target.value)}
                                            className="bg-slate-900 border border-slate-600 rounded px-2 py-1 text-xs w-20 text-slate-200"
                                        >
                                            {Object.values(ServiceType).map(s => <option key={s} value={s}>{s}</option>)}
                                        </select>
                                    </td>
                                    <td className="py-3">
                                        <select
                                            value={duration}
                                            onChange={e => setDuration(parseInt(e.target.value))}
                                            className="bg-slate-900 border border-slate-600 rounded px-2 py-1 text-xs w-20 text-slate-200"
                                        >
                                            {DURATION_OPTIONS.map(opt => (
                                                <option key={opt.value} value={opt.value}>{opt.label}</option>
                                            ))}
                                        </select>
                                    </td>
                                    <td className="py-3 text-center">
                                    </td>
                                    <td className="py-3 text-right pr-4">
                                        <button onClick={() => handleSave()} className="text-emerald-400 hover:text-emerald-300 text-xs font-bold bg-emerald-500/10 px-2 py-1 rounded border border-emerald-500/30">
                                            SAVE
                                        </button>
                                    </td>
                                </tr>
                            )}

                            {sortedJobs.map((job) => {
                                const isEditingThis = editingJobId === job.id;
                                const isActive = isJobActive(job);

                                // Display Logic
                                const durationValue = parseInt(job.radio_details.duration);
                                const durationLabel = DURATION_OPTIONS.find(opt => opt.value === durationValue)?.label || `${durationValue}m`;

                                if (isEditingThis) {
                                    return (
                                        <tr key={job.id} className="border-b border-slate-600 bg-slate-700/50">
                                            {/* Edit Mode Rows */}
                                            <td className="py-3 pl-4">
                                                <input
                                                    type="time"
                                                    value={newJob.time}
                                                    onChange={e => setNewJob({ ...newJob, time: e.target.value })}
                                                    className="bg-slate-900 border border-slate-600 rounded px-2 py-1 text-xs w-24 text-slate-200"
                                                />
                                            </td>
                                            <td className="py-3">
                                                <select
                                                    value={newJob.frequency}
                                                    onChange={e => setNewJob({ ...newJob, frequency: e.target.value })}
                                                    className="bg-slate-900 border border-slate-600 rounded px-2 py-1 text-xs text-slate-200"
                                                >
                                                    <option value="daily">Daily</option>
                                                    <option value="weekly">Weekly</option>
                                                </select>
                                            </td>
                                            <td className="py-3">
                                                <select
                                                    value={selectedService}
                                                    onChange={e => setSelectedService(e.target.value)}
                                                    className="bg-slate-900 border border-slate-600 rounded px-2 py-1 text-xs w-20 text-slate-200"
                                                >
                                                    {Object.values(ServiceType).map(s => <option key={s} value={s}>{s}</option>)}
                                                </select>
                                            </td>
                                            <td className="py-3">
                                                <select
                                                    value={duration}
                                                    onChange={e => setDuration(parseInt(e.target.value))}
                                                    className="bg-slate-900 border border-slate-600 rounded px-2 py-1 text-xs w-20 text-slate-200"
                                                >
                                                    {DURATION_OPTIONS.map(opt => (
                                                        <option key={opt.value} value={opt.value}>{opt.label}</option>
                                                    ))}
                                                </select>
                                            </td>
                                            <td className="py-3 text-center">
                                            </td>
                                            <td className="py-3 text-right pr-4">
                                                <div className="flex items-center justify-end gap-2">
                                                    <button onClick={() => setEditingJobId(null)} className="text-slate-400 hover:text-slate-200 text-xs font-medium px-2 py-1">
                                                        CANCEL
                                                    </button>
                                                    <button onClick={() => handleSave(job.id)} className="text-cyan-400 hover:text-cyan-300 text-xs font-bold bg-cyan-500/10 px-2 py-1 rounded border border-cyan-500/30">
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
                                        className={`
                                        border-b border-slate-800 hover:bg-slate-700/20 transition-all duration-300 group
                                        ${!job.enabled ? 'opacity-50' : ''}
                                        ${isActive ? 'bg-emerald-500/10' : ''}
                                    `}
                                    >
                                        <td className={`py-4 pl-4 font-mono font-bold text-slate-200 ${isActive ? 'border-l-2 border-emerald-500' : 'border-l-2 border-transparent'}`}>
                                            <div className="flex items-center gap-2">
                                                <Clock size={14} className={isActive ? "text-emerald-400 animate-pulse" : "text-slate-500"} />
                                                <span className={isActive ? "text-emerald-300 drop-shadow-sm" : ""}>{job.friendly_time}</span>
                                            </div>
                                        </td>
                                        <td className="py-4 text-slate-400">
                                            <div className="flex items-center gap-2">
                                                <RefreshCw size={14} className="text-slate-600" />
                                                <span className="capitalize">{job.friendly_freq}</span>
                                            </div>
                                        </td>
                                        <td className="py-4">
                                            <div className="flex items-center gap-2">
                                                <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium border ${isActive ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/50' : 'bg-cyan-900/30 text-cyan-400 border-cyan-800'}`}>
                                                    {job.radio_details.service}
                                                </span>
                                            </div>
                                        </td>
                                        <td className="py-4 text-slate-400 font-mono text-xs">
                                            {durationLabel}
                                        </td>
                                        <td className="py-4 text-center">
                                            <button
                                                onClick={() => handleToggle(job)}
                                                className={`w-8 h-4 rounded-full p-0.5 transition-colors duration-200 ease-in-out relative inline-flex items-center ${job.enabled ? 'bg-emerald-500/80' : 'bg-slate-600'}`}
                                            >
                                                <div className={`bg-white w-3 h-3 rounded-full shadow transform transition-transform duration-200 ${job.enabled ? 'translate-x-4' : 'translate-x-0'}`} />
                                            </button>
                                        </td>
                                        <td className="py-4 text-right pr-4">
                                            {isActive ? (
                                                <div className="flex items-center justify-end gap-2 text-emerald-400 text-xs font-bold">
                                                    LIVE <Zap size={12} fill="currentColor" />
                                                </div>
                                            ) : (
                                                <div className="flex items-center justify-end gap-2">
                                                    <button
                                                        onClick={() => handleEdit(job)}
                                                        className="p-1.5 rounded hover:bg-cyan-500/20 text-slate-600 hover:text-cyan-400 transition-colors opacity-0 group-hover:opacity-100"
                                                    >
                                                        <Edit2 size={14} />
                                                    </button>
                                                    <button
                                                        onClick={() => handleDelete(job.id)}
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

                    {/* Mobile List View (Cards) */}
                    <div className="md:hidden space-y-3">
                        {isAdding && (
                            <div className="bg-slate-800/50 border border-cyan-500/30 rounded-lg p-4 animate-fade-in">
                                <h4 className="text-xs font-bold text-cyan-400 mb-3 uppercase tracking-wider">New Schedule</h4>
                                <div className="space-y-3">
                                    <div className="grid grid-cols-2 gap-3">
                                        <div>
                                            <label className="text-[10px] text-slate-500 font-bold uppercase mb-1 block">Time</label>
                                            <input
                                                type="time"
                                                value={newJob.time}
                                                onChange={e => setNewJob({ ...newJob, time: e.target.value })}
                                                className="w-32 bg-slate-900 border border-slate-600 rounded px-2 h-9 text-sm text-slate-200 py-0 leading-none"
                                            />
                                        </div>
                                        <div>
                                            <label className="text-[10px] text-slate-500 font-bold uppercase mb-1 block">Frequency</label>
                                            <select
                                                value={newJob.frequency}
                                                onChange={e => setNewJob({ ...newJob, frequency: e.target.value })}
                                                className="w-full bg-slate-900 border border-slate-600 rounded px-2 h-9 text-sm text-slate-200 py-0 leading-none"
                                            >
                                                <option value="daily">Daily</option>
                                                <option value="weekly">Weekly</option>
                                            </select>
                                        </div>
                                    </div>
                                    <div className="grid grid-cols-2 gap-3">
                                        <div>
                                            <label className="text-[10px] text-slate-500 font-bold uppercase mb-1 block">Service</label>
                                            <select
                                                value={selectedService}
                                                onChange={e => setSelectedService(e.target.value)}
                                                className="w-full bg-slate-900 border border-slate-600 rounded px-2 h-9 text-sm text-slate-200 py-0 leading-none"
                                            >
                                                {Object.values(ServiceType).map(s => <option key={s} value={s}>{s}</option>)}
                                            </select>
                                        </div>
                                        <div>
                                            <label className="text-[10px] text-slate-500 font-bold uppercase mb-1 block">Duration</label>
                                            <select
                                                value={duration}
                                                onChange={e => setDuration(parseInt(e.target.value))}
                                                className="w-full bg-slate-900 border border-slate-600 rounded px-2 h-9 text-sm text-slate-200 py-0 leading-none"
                                            >
                                                {DURATION_OPTIONS.map(opt => (
                                                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                                                ))}
                                            </select>
                                        </div>
                                    </div>
                                    <button onClick={() => handleSave()} className="w-full mt-2 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded text-sm transition-colors">
                                        SAVE SCHEDULE
                                    </button>
                                </div>
                            </div>
                        )}

                        {jobs.length === 0 && !isAdding && (
                            <div className="text-center py-8 text-slate-500 italic text-sm">
                                No scheduled broadcasts.
                            </div>
                        )}

                        {sortedJobs.map((job) => {
                            const isEditingThis = editingJobId === job.id;
                            const isActive = isJobActive(job);
                            const durationValue = parseInt(job.radio_details.duration);
                            const durationLabel = DURATION_OPTIONS.find(opt => opt.value === durationValue)?.label || `${durationValue}m`;

                            if (isEditingThis) {
                                // Mobile Edit Mode Card
                                return (
                                    <div key={job.id} className="bg-slate-800 border border-cyan-500/30 rounded-lg p-4 animate-fade-in">
                                        <div className="space-y-3">
                                            <div className="flex justify-between items-center mb-2">
                                                <span className="text-xs font-bold text-cyan-400 uppercase">Editing Job</span>
                                            </div>
                                            <div className="grid grid-cols-2 gap-3">
                                                <div>
                                                    <label className="text-[10px] text-slate-500 font-bold uppercase mb-1 block">Time</label>
                                                    <input
                                                        type="time"
                                                        value={newJob.time}
                                                        onChange={e => setNewJob({ ...newJob, time: e.target.value })}
                                                        className="w-32 bg-slate-900 border border-slate-600 rounded px-2 h-9 text-sm text-slate-200 py-0 leading-none"
                                                    />
                                                </div>
                                                <div>
                                                    <label className="text-[10px] text-slate-500 font-bold uppercase mb-1 block">Frequency</label>
                                                    <select
                                                        value={newJob.frequency}
                                                        onChange={e => setNewJob({ ...newJob, frequency: e.target.value })}
                                                        className="w-full bg-slate-900 border border-slate-600 rounded px-2 h-9 text-sm text-slate-200 py-0 leading-none"
                                                    >
                                                        <option value="daily">Daily</option>
                                                        <option value="weekly">Weekly</option>
                                                    </select>
                                                </div>
                                            </div>
                                            <div className="grid grid-cols-2 gap-3">
                                                <div>
                                                    <label className="text-[10px] text-slate-500 font-bold uppercase mb-1 block">Service</label>
                                                    <select
                                                        value={selectedService}
                                                        onChange={e => setSelectedService(e.target.value)}
                                                        className="w-full bg-slate-900 border border-slate-600 rounded px-2 h-9 text-sm text-slate-200 py-0 leading-none"
                                                    >
                                                        {Object.values(ServiceType).map(s => <option key={s} value={s}>{s}</option>)}
                                                    </select>
                                                </div>
                                                <div>
                                                    <label className="text-[10px] text-slate-500 font-bold uppercase mb-1 block">Duration</label>
                                                    <select
                                                        value={duration}
                                                        onChange={e => setDuration(parseInt(e.target.value))}
                                                        className="w-full bg-slate-900 border border-slate-600 rounded px-2 h-9 text-sm text-slate-200 py-0 leading-none"
                                                    >
                                                        {DURATION_OPTIONS.map(opt => (
                                                            <option key={opt.value} value={opt.value}>{opt.label}</option>
                                                        ))}
                                                    </select>
                                                </div>
                                            </div>
                                            <div className="flex gap-2 mt-2">
                                                <button onClick={() => setEditingJobId(null)} className="flex-1 py-2 bg-slate-700 hover:bg-slate-600 text-slate-200 font-bold rounded text-sm transition-colors">
                                                    CANCEL
                                                </button>
                                                <button onClick={() => handleSave(job.id)} className="flex-1 py-2 bg-cyan-600 hover:bg-cyan-500 text-white font-bold rounded text-sm transition-colors">
                                                    UPDATE
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                );
                            }

                            return (
                                <div key={job.id} className={`p-4 rounded-lg border ${isActive ? 'bg-emerald-900/10 border-emerald-500/50' : 'bg-slate-800/50 border-slate-700'} ${!job.enabled ? 'opacity-60' : ''}`}>
                                    <div className="flex justify-between items-start mb-3">
                                        <div className="flex items-center gap-2">
                                            <Clock size={16} className={isActive ? "text-emerald-400" : "text-slate-500"} />
                                            <span className={`text-xl font-mono font-bold ${isActive ? 'text-emerald-300' : 'text-white'}`}>
                                                {job.friendly_time}
                                            </span>
                                        </div>
                                        <button
                                            onClick={() => handleToggle(job)}
                                            className={`w-10 h-5 rounded-full p-0.5 transition-colors duration-200 ease-in-out relative inline-flex items-center ${job.enabled ? 'bg-emerald-500' : 'bg-slate-600'}`}
                                        >
                                            <div className={`bg-white w-4 h-4 rounded-full shadow transform transition-transform duration-200 ${job.enabled ? 'translate-x-5' : 'translate-x-0'}`} />
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
                                            <div className="text-slate-300 font-mono">{durationLabel}</div>
                                        </div>
                                    </div>

                                    <div className="flex justify-end gap-2 border-t border-slate-700/50 pt-3">
                                        {isActive ? (
                                            <div className="w-full flex items-center justify-center gap-2 text-emerald-400 font-bold text-sm bg-emerald-500/10 py-1.5 rounded">
                                                <Zap size={14} fill="currentColor" /> LIVE BROADCAST
                                            </div>
                                        ) : (
                                            <>
                                                <button
                                                    onClick={() => handleEdit(job)}
                                                    className="flex-1 py-1.5 bg-slate-700 hover:bg-slate-600 text-slate-300 text-xs font-bold rounded flex items-center justify-center gap-2 transition-colors"
                                                >
                                                    <Edit2 size={12} /> EDIT
                                                </button>
                                                <button
                                                    onClick={() => handleDelete(job.id)}
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
                </div>
            </Card>

            <ConfirmModal
                isOpen={modalConfig.isOpen}
                onClose={closeModal}
                onConfirm={modalConfig.onConfirm}
                title={modalConfig.title}
                message={modalConfig.message}
                type={modalConfig.type}
                confirmText={modalConfig.confirmText}
            />
        </>
    );
};
