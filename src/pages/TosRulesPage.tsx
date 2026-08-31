import { useEffect, useState, useCallback } from 'react';
import { Scale, Plus, Pencil, Trash2, Save, X } from 'lucide-react';
import { getTosRules, saveTosRule, logAudit } from '@/lib/db';
import type { TosRule } from '@/lib/types';
import { LoadingSpinner, EmptyState } from '@/components/ui/LoadingSpinner';
import { Pill } from '@/components/ui/Badge';
import { Modal } from '@/components/ui/Modal';

export function TosRulesPage() {
  const [loading, setLoading] = useState(true);
  const [rules, setRules] = useState<TosRule[]>([]);
  const [editing, setEditing] = useState<TosRule | null>(null);
  const [showInactive, setShowInactive] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getTosRules();
      setRules(data);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const visible = showInactive ? rules : rules.filter((r) => r.active);

  const openNew = () => setEditing({
    id: '', section: '', clause_name: '', clause_text: '', internal_description: '',
    evidence_requirements: '', damages_may_apply: false, active: true, internal_notes: '',
    sort_order: rules.length * 10 + 10,
  });

  const save = async (rule: Partial<TosRule>) => {
    try {
      await saveTosRule(rule);
      await logAudit({ entity_type: 'tos_rule', action: rule.id ? `Updated rule: ${rule.clause_name}` : `Created rule: ${rule.clause_name}` });
      setEditing(null);
      await load();
    } catch (e) { console.error(e); }
  };

  const toggleActive = async (rule: TosRule) => {
    await saveTosRule({ ...rule, active: !rule.active });
    await load();
  };

  if (loading) return <LoadingSpinner label="Loading TOS rules…" />;

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-slate-100">TOS Rules</h2>
          <p className="text-sm text-slate-500 mt-1">{visible.length} rules · governing Terms of Service clauses used in assessments</p>
        </div>
        <div className="flex items-center gap-2">
          <label className="flex items-center gap-2 text-sm text-slate-400">
            <input type="checkbox" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} className="accent-sky-600" />
            Show inactive
          </label>
          <button className="btn-primary" onClick={openNew}>
            <Plus size={16} />
            Add Rule
          </button>
        </div>
      </div>

      {visible.length === 0 ? (
        <div className="card"><EmptyState message="No TOS rules configured. Add your first rule to start assessing violations." icon={Scale} /></div>
      ) : (
        <div className="space-y-3">
          {visible.map((rule) => (
            <div key={rule.id} className="card card-hover p-4">
              <div className="flex items-start justify-between mb-2">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-sky-500/10 text-sky-400">
                    <Scale size={16} />
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold text-slate-200">{rule.section}</h3>
                    <p className="text-xs text-slate-500">{rule.clause_name}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {rule.damages_may_apply && <Pill color="amber">Damages</Pill>}
                  <button className="btn-ghost px-2 py-1" onClick={() => setEditing(rule)}>
                    <Pencil size={14} />
                  </button>
                </div>
              </div>
              <p className="text-sm text-slate-400 leading-relaxed">{rule.clause_text}</p>
              {rule.internal_description && (
                <p className="text-xs text-slate-500 mt-2 italic">{rule.internal_description}</p>
              )}
              {rule.evidence_requirements && (
                <div className="mt-2">
                  <span className="text-xs text-slate-600">Evidence required: </span>
                  <span className="text-xs text-slate-400">{rule.evidence_requirements}</span>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <RuleEditor rule={editing} onClose={() => setEditing(null)} onSave={save} />
    </div>
  );
}

function RuleEditor({ rule, onClose, onSave }: { rule: TosRule | null; onClose: () => void; onSave: (r: Partial<TosRule>) => void }) {
  const [form, setForm] = useState<TosRule | null>(rule);

  useEffect(() => { setForm(rule); }, [rule]);

  if (!form) return null;

  const update = (patch: Partial<TosRule>) => setForm({ ...form, ...patch });

  return (
    <Modal
      open={!!rule}
      onClose={onClose}
      title={form.id ? 'Edit TOS Rule' : 'New TOS Rule'}
      wide
      footer={
        <>
          <button className="btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn-primary" onClick={() => onSave(form)}>
            <Save size={16} />
            Save Rule
          </button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="text-sm text-slate-400 block mb-1">Section</label>
            <input className="input w-full" value={form.section} onChange={(e) => update({ section: e.target.value })} placeholder="e.g. 1. Eligibility" />
          </div>
          <div>
            <label className="text-sm text-slate-400 block mb-1">Clause Name</label>
            <input className="input w-full" value={form.clause_name} onChange={(e) => update({ clause_name: e.target.value })} placeholder="e.g. Minimum Age" />
          </div>
        </div>
        <div>
          <label className="text-sm text-slate-400 block mb-1">Clause Text</label>
          <textarea className="input w-full min-h-[80px]" value={form.clause_text} onChange={(e) => update({ clause_text: e.target.value })} placeholder="The actual TOS text…" />
        </div>
        <div>
          <label className="text-sm text-slate-400 block mb-1">Internal Description</label>
          <textarea className="input w-full min-h-[60px]" value={form.internal_description} onChange={(e) => update({ internal_description: e.target.value })} placeholder="What this clause means for reviewers…" />
        </div>
        <div>
          <label className="text-sm text-slate-400 block mb-1">Evidence Requirements</label>
          <input className="input w-full" value={form.evidence_requirements} onChange={(e) => update({ evidence_requirements: e.target.value })} placeholder="What evidence is needed to confirm a violation…" />
        </div>
        <div className="grid grid-cols-3 gap-4">
          <div>
            <label className="text-sm text-slate-400 block mb-1">Sort Order</label>
            <input type="number" className="input w-full" value={form.sort_order} onChange={(e) => update({ sort_order: Number(e.target.value) })} />
          </div>
          <label className="flex items-center gap-2 text-sm text-slate-400 self-end pb-2">
            <input type="checkbox" checked={form.damages_may_apply} onChange={(e) => update({ damages_may_apply: e.target.checked })} className="accent-sky-600" />
            Damages may apply
          </label>
          <label className="flex items-center gap-2 text-sm text-slate-400 self-end pb-2">
            <input type="checkbox" checked={form.active} onChange={(e) => update({ active: e.target.checked })} className="accent-sky-600" />
            Active
          </label>
        </div>
        <div>
          <label className="text-sm text-slate-400 block mb-1">Internal Notes</label>
          <textarea className="input w-full min-h-[60px]" value={form.internal_notes} onChange={(e) => update({ internal_notes: e.target.value })} />
        </div>
      </div>
    </Modal>
  );
}
