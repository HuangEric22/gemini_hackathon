'use client'

import { useState } from 'react';
import { Trash2, Loader2 } from 'lucide-react';
import { deleteTripAction } from '@/app/actions/crud-trip';
import { useRouter } from 'next/navigation';

export function DeleteTripButton({ tripId }: { tripId: number }) {
    const [confirming, setConfirming] = useState(false);
    const [deleting, setDeleting] = useState(false);
    const router = useRouter();

    const handleDelete = async (e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();

        if (!confirming) {
            setConfirming(true);
            return;
        }

        setDeleting(true);
        const result = await deleteTripAction(tripId);
        if (result.success) {
            router.refresh();
        } else {
            alert(result.error);
            setDeleting(false);
            setConfirming(false);
        }
    };

    const handleCancel = (e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setConfirming(false);
    };

    if (confirming) {
        return (
            <div className="flex gap-1.5">
                <button
                    onClick={handleDelete}
                    disabled={deleting}
                    className="px-3 py-1.5 bg-red-500 text-white text-[10px] font-bold uppercase tracking-wider rounded-full hover:bg-red-600 transition-colors disabled:opacity-50 flex items-center gap-1"
                >
                    {deleting ? <Loader2 className="w-3 h-3 animate-spin" /> : <Trash2 className="w-3 h-3" />}
                    Delete
                </button>
                <button
                    onClick={handleCancel}
                    className="px-3 py-1.5 bg-white/90 backdrop-blur-md text-slate-600 text-[10px] font-bold uppercase tracking-wider rounded-full hover:bg-white transition-colors"
                >
                    Cancel
                </button>
            </div>
        );
    }

    return (
        <button
            onClick={handleDelete}
            className="p-2 bg-white/90 backdrop-blur-md rounded-full text-slate-400 hover:text-red-500 hover:bg-white transition-all shadow-sm opacity-0 group-hover:opacity-100"
        >
            <Trash2 className="w-4 h-4" />
        </button>
    );
}
