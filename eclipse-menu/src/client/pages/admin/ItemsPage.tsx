import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Plus,
  Search,
  Copy,
  Trash2,
  Pencil,
  Download,
  Upload,
  ArrowUp,
  ArrowDown,
  Eye,
  ChefHat,
} from 'lucide-react';
import type { Category, MenuItem } from '../../../shared/types';
import { api, ApiError } from '../../lib/api';
import { formatMoney } from '../../../shared/money';
import { Confirm, EmptyState, ErrorState, Field, Modal, Spinner, useToast } from '../../components/ui';
import { PageHeader, StatusPill, TableShell } from '../../components/admin/parts';
import { ItemThumb, ItemDetail } from '../../components/menu/ItemViews';

export default function ItemsPage() {
  const { push } = useToast();
  const [items, setItems] = useState<MenuItem[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [toDelete, setToDelete] = useState<MenuItem | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [preview, setPreview] = useState<MenuItem | null>(null);
  const [importOpen, setImportOpen] = useState(false);

  const load = () => {
    setLoading(true);
    api
      .listItems()
      .then((res) => {
        setItems(res.items);
        setCategories(res.categories);
        setError(null);
      })
      .catch((e) => setError(e instanceof ApiError ? e.message : 'Could not load menu items.'))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    document.title = 'Menu items — Eclipse Admin';
    load();
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return items.filter((i) => {
      if (categoryFilter !== 'all' && String(i.category_id) !== categoryFilter) return false;
      if (statusFilter !== 'all' && i.availability_status !== statusFilter) return false;
      if (!q) return true;
      return `${i.name} ${i.category_name} ${i.description ?? ''} ${i.ingredients ?? ''}`.toLowerCase().includes(q);
    });
  }, [items, query, categoryFilter, statusFilter]);

  const setStatus = async (item: MenuItem, status: MenuItem['availability_status']) => {
    try {
      await api.setItemStatus(item.id, status);
      setItems((prev) => prev.map((i) => (i.id === item.id ? { ...i, availability_status: status } : i)));
      push('success', `${item.name} marked ${status.replace('_', ' ')}`);
    } catch (e) {
      push('error', e instanceof ApiError ? e.message : 'Could not update availability');
    }
  };

  const duplicate = async (item: MenuItem) => {
    try {
      await api.duplicateItem(item.id);
      push('success', `${item.name} duplicated`);
      load();
    } catch (e) {
      push('error', e instanceof ApiError ? e.message : 'Could not duplicate the item');
    }
  };

  const confirmDelete = async () => {
    if (!toDelete) return;
    setDeleting(true);
    try {
      await api.deleteItem(toDelete.id);
      setItems((prev) => prev.filter((i) => i.id !== toDelete.id));
      push('success', `${toDelete.name} removed from the menu`);
      setToDelete(null);
    } catch (e) {
      push('error', e instanceof ApiError ? e.message : 'Could not delete the item');
    } finally {
      setDeleting(false);
    }
  };

  const move = async (item: MenuItem, direction: -1 | 1) => {
    const sameCategory = filtered.filter((i) => i.category_id === item.category_id);
    const index = sameCategory.findIndex((i) => i.id === item.id);
    const target = sameCategory[index + direction];
    if (!target) return;
    const order = items.map((i) => i.id);
    const a = order.indexOf(item.id);
    const b = order.indexOf(target.id);
    [order[a], order[b]] = [order[b], order[a]];
    setItems([...items].sort((x, y) => order.indexOf(x.id) - order.indexOf(y.id)));
    try {
      await api.reorderItems(order);
    } catch (e) {
      push('error', e instanceof ApiError ? e.message : 'Could not save the new order');
      load();
    }
  };

  if (error) return <ErrorState message={error} onRetry={load} />;

  return (
    <div>
      <PageHeader
        title="Menu items"
        subtitle="Create, price, hide and reorder everything guests see. Changes go live on the QR menu immediately."
        actions={
          <>
            <a className="btn-ghost" href={api.exportItemsUrl()}>
              <Download size={14} /> Export CSV
            </a>
            <button className="btn-ghost" onClick={() => setImportOpen(true)}>
              <Upload size={14} /> Import CSV
            </button>
            <Link to="/admin/items/new" className="btn-gold">
              <Plus size={15} /> New item
            </Link>
          </>
        }
      />

      <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-smoke/60" />
          <input
            className="input !pl-9"
            placeholder="Search items…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="Search menu items"
          />
        </div>
        <select className="input sm:w-52" value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)} aria-label="Filter by category">
          <option value="all">All categories</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <select className="input sm:w-44" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} aria-label="Filter by status">
          <option value="all">Any status</option>
          <option value="available">Available</option>
          <option value="unavailable">Unavailable</option>
          <option value="sold_out">Sold out</option>
        </select>
      </div>

      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="skeleton h-14 rounded-lg" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={<ChefHat size={26} />}
          title={items.length === 0 ? 'No menu items yet' : 'No items match those filters'}
          message={
            items.length === 0
              ? 'Add your first item, or import an existing menu from CSV.'
              : 'Try a different search term or clear the filters.'
          }
          action={
            items.length === 0 ? (
              <Link to="/admin/items/new" className="btn-gold mt-2">
                <Plus size={14} /> Add an item
              </Link>
            ) : (
              <button
                className="btn-ghost mt-2"
                onClick={() => {
                  setQuery('');
                  setCategoryFilter('all');
                  setStatusFilter('all');
                }}
              >
                Clear filters
              </button>
            )
          }
        />
      ) : (
        <TableShell>
          <table className="w-full min-w-[760px] text-left text-[13px]">
            <thead className="bg-white/[0.03] text-[10.5px] uppercase tracking-[0.12em] text-smoke">
              <tr>
                <th className="px-3 py-2.5 font-medium">Item</th>
                <th className="px-3 py-2.5 font-medium">Category</th>
                <th className="px-3 py-2.5 text-right font-medium">Price</th>
                <th className="px-3 py-2.5 font-medium">Availability</th>
                <th className="px-3 py-2.5 font-medium">Flags</th>
                <th className="px-3 py-2.5 text-right font-medium">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.05]">
              {filtered.map((item) => (
                <tr key={item.id} className="align-middle hover:bg-white/[0.02]">
                  <td className="px-3 py-2.5">
                    <div className="flex items-center gap-2.5">
                      <ItemThumb item={item} size={38} />
                      <div className="min-w-0">
                        <Link to={`/admin/items/${item.id}`} className="block truncate text-cream hover:text-gold-100">
                          {item.name}
                        </Link>
                        {item.size_label && <span className="text-[11px] text-smoke/60">{item.size_label}</span>}
                      </div>
                    </div>
                  </td>
                  <td className="px-3 py-2.5 text-smoke">{item.category_name}</td>
                  <td className="px-3 py-2.5 text-right">
                    <span className="text-gold-100 tabular-nums">{formatMoney(item.effective_price)}</span>
                    {item.promotional_price !== null && (
                      <span className="ml-1 text-[11px] text-smoke/60 line-through">{formatMoney(item.price)}</span>
                    )}
                    {item.active_promotion && (
                      <div className="text-[10px] uppercase tracking-wide text-gold-400/80">{item.active_promotion}</div>
                    )}
                  </td>
                  <td className="px-3 py-2.5">
                    <select
                      className="rounded-lg border border-white/10 bg-ink-800 px-2 py-1 text-[12px] text-cream"
                      value={item.availability_status}
                      onChange={(e) => setStatus(item, e.target.value as MenuItem['availability_status'])}
                      aria-label={`Availability for ${item.name}`}
                    >
                      <option value="available">Available</option>
                      <option value="unavailable">Unavailable</option>
                      <option value="sold_out">Sold out</option>
                    </select>
                  </td>
                  <td className="px-3 py-2.5">
                    <div className="flex flex-wrap gap-1">
                      {item.is_signature && (
                        <span className="chip border-gold-400/40 bg-gold-400/10 text-gold-200">signature</span>
                      )}
                      {item.is_popular && (
                        <span className="chip border-white/[0.12] bg-white/[0.04] text-smoke">popular</span>
                      )}
                      {item.is_new && <span className="chip border-sky-400/30 bg-sky-400/10 text-sky-200">new</span>}
                      {!item.is_signature && !item.is_popular && !item.is_new && (
                        <span className="text-[11px] text-smoke/40">—</span>
                      )}
                    </div>
                  </td>
                  <td className="px-3 py-2.5">
                    <div className="flex items-center justify-end gap-0.5">
                      <button className="p-1.5 text-smoke hover:text-cream" onClick={() => move(item, -1)} aria-label="Move up">
                        <ArrowUp size={14} />
                      </button>
                      <button className="p-1.5 text-smoke hover:text-cream" onClick={() => move(item, 1)} aria-label="Move down">
                        <ArrowDown size={14} />
                      </button>
                      <button className="p-1.5 text-smoke hover:text-cream" onClick={() => setPreview(item)} aria-label="Preview">
                        <Eye size={14} />
                      </button>
                      <Link to={`/admin/items/${item.id}`} className="p-1.5 text-smoke hover:text-cream" aria-label="Edit">
                        <Pencil size={14} />
                      </Link>
                      <button className="p-1.5 text-smoke hover:text-cream" onClick={() => duplicate(item)} aria-label="Duplicate">
                        <Copy size={14} />
                      </button>
                      <button className="p-1.5 text-smoke hover:text-red-300" onClick={() => setToDelete(item)} aria-label="Delete">
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableShell>
      )}

      <p className="mt-3 text-[11.5px] text-smoke/60">
        {filtered.length} of {items.length} items shown. Deleting hides an item permanently but keeps it attached to past
        orders for accurate history.
      </p>

      <Confirm
        open={!!toDelete}
        title="Delete this menu item?"
        message={`“${toDelete?.name ?? ''}” will be removed from the menu. Past orders keep their own copy of the name and price.`}
        confirmLabel="Delete item"
        onConfirm={confirmDelete}
        onCancel={() => setToDelete(null)}
        busy={deleting}
      />

      <ItemDetail item={preview} onClose={() => setPreview(null)} orderingEnabled={false} />

      <ImportModal open={importOpen} onClose={() => setImportOpen(false)} onImported={load} />
    </div>
  );
}

function ImportModal({ open, onClose, onImported }: { open: boolean; onClose: () => void; onImported: () => void }) {
  const { push } = useToast();
  const [csv, setCsv] = useState('');
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);

  const submit = async () => {
    setBusy(true);
    setErrors([]);
    try {
      const res = await api.importItems(csv);
      push('success', `${res.created} item${res.created === 1 ? '' : 's'} imported`);
      setErrors(res.errors);
      if (res.created > 0) {
        setCsv('');
        onImported();
      }
    } catch (e) {
      push('error', e instanceof ApiError ? e.message : 'Import failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="Import menu items from CSV" size="lg">
      <p className="text-[12.5px] leading-relaxed text-smoke">
        Required columns: <code className="text-gold-200">name</code>, <code className="text-gold-200">category</code>,{' '}
        <code className="text-gold-200">price_naira</code>. Optional: description, ingredients, allergens,
        promotional_price_naira, size_label, availability_status, is_signature, is_popular, is_new, display_order.
        Categories that don't exist yet are created automatically.
      </p>
      <Field label="Upload a .csv file" className="mt-3">
        <input
          type="file"
          accept=".csv,text/csv"
          className="input file:mr-3 file:rounded-full file:border-0 file:bg-gold-300 file:px-3 file:py-1 file:text-[12px] file:text-ink-900"
          onChange={async (e) => {
            const file = e.target.files?.[0];
            if (file) setCsv(await file.text());
          }}
        />
      </Field>
      <Field label="…or paste CSV content" className="mt-3">
        <textarea
          className="input min-h-[160px] font-mono text-[11.5px]"
          value={csv}
          onChange={(e) => setCsv(e.target.value)}
          placeholder="name,category,price_naira&#10;Espresso Martini,Cocktails,9000"
        />
      </Field>
      {errors.length > 0 && (
        <ul className="mt-3 max-h-32 space-y-1 overflow-y-auto rounded-lg bg-amber-950/30 p-2 text-[11.5px] text-amber-200">
          {errors.map((e, i) => (
            <li key={i}>{e}</li>
          ))}
        </ul>
      )}
      <div className="mt-4 flex justify-end gap-2">
        <button className="btn-ghost" onClick={onClose}>
          Close
        </button>
        <button className="btn-gold" onClick={submit} disabled={busy || !csv.trim()}>
          {busy ? <Spinner /> : <Upload size={14} />} Import
        </button>
      </div>
    </Modal>
  );
}
