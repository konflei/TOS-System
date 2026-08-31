import { Loader2 } from 'lucide-react';

export function LoadingSpinner({ label = 'Loading…' }: { label?: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-slate-500">
      <Loader2 className="animate-spin mb-3" size={28} />
      <p className="text-sm">{label}</p>
    </div>
  );
}

export function ErrorState({ message }: { message: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-red-400">
      <p className="text-sm">{message}</p>
    </div>
  );
}

export function EmptyState({ message, icon: Icon }: { message: string; icon?: React.ComponentType<{ size?: number; className?: string }> }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-slate-600">
      {Icon && <Icon size={32} className="mb-3" />}
      <p className="text-sm">{message}</p>
    </div>
  );
}
