import { useEffect } from 'react';
import { X } from 'lucide-react';

export function Modal({
  open, onClose, title, children, footer, wide,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  wide?: boolean;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center p-4 pt-[10vh]">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className={`relative card w-full ${wide ? 'max-w-3xl' : 'max-w-lg'} animate-fade-in max-h-[80vh] flex flex-col`}>
        <div className="flex items-center justify-between border-b border-slate-800 px-5 py-3">
          <h3 className="text-sm font-semibold text-slate-200">{title}</h3>
          <button onClick={onClose} className="text-slate-500 hover:text-slate-300 transition-colors">
            <X size={18} />
          </button>
        </div>
        <div className="overflow-y-auto scrollbar-thin px-5 py-4 flex-1">{children}</div>
        {footer && <div className="border-t border-slate-800 px-5 py-3 flex items-center justify-end gap-2">{footer}</div>}
      </div>
    </div>
  );
}
