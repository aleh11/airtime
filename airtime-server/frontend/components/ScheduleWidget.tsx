import { useState } from 'react';
import { Plus, X } from 'lucide-react';
import { Card } from './Card';
import { CronJob, RadioConfig, SystemStatus } from '../types';
import { api } from '../services/api';
import { ConfirmModal, ModalType } from './ConfirmModal';
import { ScheduleTable } from './schedule/ScheduleTable';
import { ScheduleCards } from './schedule/ScheduleCards';
import { useScheduleSorting } from '../hooks/useScheduleSorting';
import { useScheduleEditor } from '../hooks/useScheduleEditor';

interface ScheduleWidgetProps {
    jobs: CronJob[];
    onUpdate: () => void;
    radioConfig: RadioConfig | null;
    status: SystemStatus | null;
    timeTesterEnabled?: boolean;
}

interface Prompt {
    title: string;
    message: string;
    type: ModalType;
    confirmText?: string;
    onConfirm?: () => void;
}

export function ScheduleWidget({ jobs, onUpdate, status, timeTesterEnabled = false }: ScheduleWidgetProps) {
    const [prompt, setPrompt] = useState<Prompt | null>(null);
    const sorting = useScheduleSorting(jobs);
    const editor = useScheduleEditor(onUpdate, (message) =>
        setPrompt({ title: 'Error', message, type: 'warning' }));

    const confirmDelete = (id: string) => {
        setPrompt({
            title: 'Delete Schedule',
            message: 'Delete this scheduled broadcast? This cannot be undone.',
            type: 'danger',
            confirmText: 'Delete',
            onConfirm: async () => {
                try {
                    await api.deleteCron(id);
                    onUpdate();
                } catch (e) {
                    console.error('Failed to delete the schedule', e);
                }
            },
        });
    };

    const shared = {
        jobs: sorting.sorted,
        status,
        locked: timeTesterEnabled,
        draft: editor.draft,
        adding: editor.adding,
        editingId: editor.editingId,
        onDraftChange: editor.setDraft,
        onSave: editor.save,
        onCancel: editor.cancel,
        onEdit: editor.startEditing,
        onDelete: confirmDelete,
        onToggle: editor.setEnabled,
    };

    return (
        <>
            <Card
                title="Broadcast Schedule"
                className="h-full"
                action={
                    <button
                        onClick={() => (editor.adding ? editor.stopAdding() : editor.startAdding())}
                        className={`p-2 rounded-full transition-colors ${timeTesterEnabled ? 'bg-slate-800 text-slate-600 cursor-not-allowed' : 'bg-slate-700 hover:bg-slate-600 text-slate-200'}`}
                        disabled={timeTesterEnabled}
                        aria-label={editor.adding ? 'Cancel new schedule' : 'Add schedule'}
                    >
                        {editor.adding ? <X size={16} /> : <Plus size={16} />}
                    </button>
                }
            >
                <div className="overflow-x-auto">
                    <ScheduleTable
                        {...shared}
                        rowRef={editor.rowRef}
                        sortColumn={sorting.column}
                        sortDirection={sorting.direction}
                        onSort={sorting.toggle}
                    />
                    <ScheduleCards {...shared} cardRef={editor.cardRef} />
                </div>
            </Card>

            <ConfirmModal
                isOpen={prompt !== null}
                onClose={() => setPrompt(null)}
                onConfirm={prompt?.onConfirm}
                title={prompt?.title ?? ''}
                message={prompt?.message ?? ''}
                type={prompt?.type ?? 'info'}
                confirmText={prompt?.confirmText}
            />
        </>
    );
}
