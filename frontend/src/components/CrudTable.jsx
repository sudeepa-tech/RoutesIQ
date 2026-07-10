import { useState } from 'react';
import { Plus, Pencil, Trash2, Check, X } from 'lucide-react';

/**
 * columns: [{ key, label, type: 'text'|'number'|'select', options?, width? }]
 * rows: array of row objects (must include `id`)
 * onCreate(values) / onUpdate(id, values) / onDelete(id)
 */
export default function CrudTable({ columns, rows, onCreate, onUpdate, onDelete, emptyLabel = 'No records yet' }) {
  const [editingId, setEditingId] = useState(null);
  const [draft, setDraft] = useState({});
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState(false);

  const startEdit = (row) => {
    setEditingId(row.id);
    setDraft(Object.fromEntries(columns.map((c) => [c.key, row[c.key] ?? ''])));
  };
  const cancelEdit = () => {
    setEditingId(null);
    setAdding(false);
    setDraft({});
  };
  const startAdd = () => {
    setAdding(true);
    setEditingId(null);
    setDraft(Object.fromEntries(columns.map((c) => [c.key, c.type === 'number' ? 0 : ''])));
  };
  const saveEdit = async () => {
    setBusy(true);
    try {
      await onUpdate(editingId, draft);
      cancelEdit();
    } finally {
      setBusy(false);
    }
  };
  const saveAdd = async () => {
    setBusy(true);
    try {
      await onCreate(draft);
      cancelEdit();
    } finally {
      setBusy(false);
    }
  };
  const remove = async (id) => {
    setBusy(true);
    try {
      await onDelete(id);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="panel overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <span className="text-xs text-ink-muted font-mono">{rows.length} records</span>
        {!adding && (
          <button
            onClick={startAdd}
            className="flex items-center gap-1.5 text-xs font-medium bg-panel2 border border-border px-2.5 py-1.5 rounded-lg hover:bg-panel transition"
          >
            <Plus size={13} />
            Add
          </button>
        )}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-ink-muted text-xs uppercase tracking-wider">
              {columns.map((c) => (
                <th key={c.key} className="px-3 py-2 font-medium">
                  {c.label}
                </th>
              ))}
              <th className="px-3 py-2 font-medium w-24">Actions</th>
            </tr>
          </thead>
          <tbody>
            {adding && (
              <EditRow columns={columns} draft={draft} setDraft={setDraft} onSave={saveAdd} onCancel={cancelEdit} busy={busy} />
            )}
            {rows.length === 0 && !adding && (
              <tr>
                <td colSpan={columns.length + 1} className="px-3 py-6 text-center text-ink-muted text-sm">
                  {emptyLabel}
                </td>
              </tr>
            )}
            {rows.map((row) =>
              editingId === row.id ? (
                <EditRow key={row.id} columns={columns} draft={draft} setDraft={setDraft} onSave={saveEdit} onCancel={cancelEdit} busy={busy} />
              ) : (
                <tr key={row.id} className="border-b border-border/60 last:border-0 hover:bg-panel2/40">
                  {columns.map((c) => (
                    <td key={c.key} className="px-3 py-2.5">
                      {c.render ? c.render(row[c.key], row) : row[c.key] ?? '—'}
                    </td>
                  ))}
                  <td className="px-3 py-2.5">
                    <div className="flex items-center gap-2">
                      <button onClick={() => startEdit(row)} className="text-ink-muted hover:text-teal transition">
                        <Pencil size={14} />
                      </button>
                      <button onClick={() => remove(row.id)} disabled={busy} className="text-ink-muted hover:text-coral transition">
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </td>
                </tr>
              )
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function EditRow({ columns, draft, setDraft, onSave, onCancel, busy }) {
  return (
    <tr className="bg-panel2/60">
      {columns.map((c) => (
        <td key={c.key} className="px-3 py-2">
          {c.type === 'select' ? (
            <select
              value={draft[c.key] ?? ''}
              onChange={(e) => setDraft((d) => ({ ...d, [c.key]: e.target.value }))}
              className="w-full bg-panel border border-border rounded-md px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-teal"
            >
              {(c.options || []).map((opt) => (
                <option key={opt} value={opt}>
                  {opt}
                </option>
              ))}
            </select>
          ) : (
            <input
              type={c.type === 'number' ? 'number' : 'text'}
              value={draft[c.key] ?? ''}
              onChange={(e) =>
                setDraft((d) => ({ ...d, [c.key]: c.type === 'number' ? Number(e.target.value) : e.target.value }))
              }
              className="w-full bg-panel border border-border rounded-md px-2 py-1.5 text-xs font-mono focus:outline-none focus:ring-1 focus:ring-teal"
            />
          )}
        </td>
      ))}
      <td className="px-3 py-2">
        <div className="flex items-center gap-2">
          <button onClick={onSave} disabled={busy} className="text-teal hover:brightness-125 transition">
            <Check size={15} />
          </button>
          <button onClick={onCancel} disabled={busy} className="text-ink-muted hover:text-coral transition">
            <X size={15} />
          </button>
        </div>
      </td>
    </tr>
  );
}
