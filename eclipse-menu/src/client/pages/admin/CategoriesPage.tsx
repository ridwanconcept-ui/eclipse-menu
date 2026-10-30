import { useEffect, useState } from 'react';
import { ArrowDown, ArrowUp, Eye, EyeOff, FolderTree, Pencil, Plus, Trash2 } from 'lucide-react';
import type { Category } from '../../../shared/types';
import { api, ApiError } from '../../lib/api';
import { Confirm, EmptyState, ErrorState, Field, Modal, Spinner, Switch, useToast } from '../../components/ui';
import { PageHeader } from '../../components/admin/parts';

interface Draft {
  id?: number;
  name: string;
  description: string;
  is_active: boolean;
}

const EMPTY: Draft = { name: '', description: '', is_active: true };

export default function CategoriesPage() {
  const { push } = useToast();
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [toDelete, setToDelete] = useState<Category | null>(null);
  const [deleting, setDeleting] = useState(false);

  const load = () => {
    setLoading(true);
    api
      .listCategories()
      .then((res) => {
        setCategories(res.categories);
        setError(null);
      })
      .catch((e) => setError(e instanceof ApiError ? e.message : 'Could not load categories.'))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    document.title = 'Categories — Eclipse Admin';
    load();
  }, []);

  const save = async () => {
    if (!draft) return;
    setSaving(true);
    setErrors({});
    try {
      const payload = {
        name: draft.name.trim(),
        description: draft.description.trim() || null,
        is_active: draft.is_active,
      };
      if (draft.id) await api.updateCategory(draft.id, payload);
      else await api.createCategory(payload);
      push('success', draft.id ? 'Category updated' : 'Category created');
      setDraft(null);
      load();
    } catch (e) {
      if (e instanceof ApiError) {
        setErrors(e.fields ?? {});
        push('error', e.message);
      }
    } finally {
      setSaving(false);
    }
  };

  const toggle = async (cat: Category) => {
    try {
      await api.updateCategory(cat.id, {
        name: cat.name,
        description: cat.description,
        is_active: !cat.is_active,
      });
      setCategories((prev) => prev.map((c) => (c.id === cat.id ? { ...c, is_active: !c.is_active } : c)));
      push('success', `${cat.name} ${cat.is_active ? 'hidden from' : 'shown on'} the menu`);
    } catch (e) {
      push('error', e instanceof ApiError ? e.message : 'Could not update the category');
    }
  };

  const move = async (cat: Category, direction: -1 | 1) => {
    const index = categories.findIndex((c) => c.id === cat.id);
    const target = categories[index + direction];
    if (!target) return;
    const next = [...categories];
    [next[index], next[index + direction]] = [next[index + direction], next[index]];
    setCategories(next);
    try {
      await api.reorderCategories(next.map((c) => c.id));
    } catch (e) {
      push('error', e instanceof ApiError ? e.message : 'Could not save the new order');
      load();
    }
  };

  const confirmDelete = async () => {
    if (!toDelete) return;
    setDeleting(true);
    try {
      await api.deleteCategory(toDelete.id);
      setCategories((prev) => prev.filter((c) => c.id !== toDelete.id));
      push('success', 'Category deleted');
      setToDelete(null);
    } catch (e) {
      push('error', e instanceof ApiError ? e.message : 'Could not delete the category');
      setToDelete(null);
    } finally {
      setDeleting(false);
    }
  };

  if (error) return <ErrorState message={error} onRetry={load} />;

  return (
    <div>
      <PageHeader
        title="Categories"
        subtitle="Categories order the guest menu. Only categories containing visible items appear on the public menu."
        actions={
          <button className="btn-gold" onClick={() => setDraft({ ...EMPTY })}>
            <Plus size={15} /> New category
          </button>
        }
      />

      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="skeleton h-16 rounded-xl" />
          ))}
        </div>
      ) : categories.length === 0 ? (
        <EmptyState
          icon={<FolderTree size={26} />}
          title="No categories yet"
          message="Create categories such as Cocktails, Whisky or Shisha to organise the menu."
          action={
            <button className="btn-gold mt-2" onClick={() => setDraft({ ...EMPTY })}>
              <Plus size={14} /> Add a category
            </button>
          }
        />
      ) : (
        <ul className="space-y-2">
          {categories.map((cat, index) => (
            <li
              key={cat.id}
              className="flex flex-col gap-3 rounded-xl border border-white/[0.07] bg-ink-700/40 p-3.5 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-[10.5px] tabular-nums text-smoke/50">{String(index + 1).padStart(2, '0')}</span>
                  <h2 className="truncate font-display text-[15px] text-cream">{cat.name}</h2>
                  {!cat.is_active && (
                    <span className="chip border-white/[0.12] bg-white/[0.04] text-smoke">
                      <EyeOff size={9} /> hidden
                    </span>
                  )}
                </div>
                {cat.description && <p className="mt-0.5 line-clamp-1 text-[12px] text-smoke/75">{cat.description}</p>}
                <p className="mt-1 text-[11px] text-smoke/50">{cat.item_count ?? 0} available items</p>
              </div>
              <div className="flex items-center gap-0.5 self-end sm:self-auto">
                <button className="p-2 text-smoke hover:text-cream" onClick={() => move(cat, -1)} aria-label="Move up">
                  <ArrowUp size={14} />
                </button>
                <button className="p-2 text-smoke hover:text-cream" onClick={() => move(cat, 1)} aria-label="Move down">
                  <ArrowDown size={14} />
                </button>
                <button className="p-2 text-smoke hover:text-cream" onClick={() => toggle(cat)} aria-label={cat.is_active ? 'Hide category' : 'Show category'}>
                  {cat.is_active ? <Eye size={14} /> : <EyeOff size={14} />}
                </button>
                <button
                  className="p-2 text-smoke hover:text-cream"
                  onClick={() => setDraft({ id: cat.id, name: cat.name, description: cat.description ?? '', is_active: cat.is_active })}
                  aria-label="Edit category"
                >
                  <Pencil size={14} />
                </button>
                <button className="p-2 text-smoke hover:text-red-300" onClick={() => setToDelete(cat)} aria-label="Delete category">
                  <Trash2 size={14} />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <Modal
        open={!!draft}
        onClose={() => setDraft(null)}
        title={draft?.id ? 'Edit category' : 'New category'}
        footer={
          <div className="flex justify-end gap-2">
            <button className="btn-ghost" onClick={() => setDraft(null)}>
              Cancel
            </button>
            <button className="btn-gold" onClick={save} disabled={saving || !draft?.name.trim()}>
              {saving ? <Spinner /> : null} Save
            </button>
          </div>
        }
      >
        {draft && (
          <div className="space-y-3">
            <Field label="Name" htmlFor="cat-name" error={errors.name} required>
              <input
                id="cat-name"
                className="input"
                value={draft.name}
                onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                placeholder="e.g. Signature Cocktails"
                maxLength={80}
              />
            </Field>
            <Field label="Description (optional)" htmlFor="cat-desc">
              <textarea
                id="cat-desc"
                className="input min-h-[70px]"
                value={draft.description}
                onChange={(e) => setDraft({ ...draft, description: e.target.value })}
                maxLength={500}
              />
            </Field>
            <Switch
              checked={draft.is_active}
              onChange={(v) => setDraft({ ...draft, is_active: v })}
              label="Visible on the menu"
              description="Hidden categories and their items are not shown to guests."
            />
          </div>
        )}
      </Modal>

      <Confirm
        open={!!toDelete}
        title="Delete category?"
        message={`“${toDelete?.name ?? ''}” can only be deleted when it contains no items. To keep the items, hide the category instead.`}
        confirmLabel="Delete category"
        onConfirm={confirmDelete}
        onCancel={() => setToDelete(null)}
        busy={deleting}
      />
    </div>
  );
}
