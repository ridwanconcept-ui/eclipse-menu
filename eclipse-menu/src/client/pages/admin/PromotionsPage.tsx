import { useEffect, useMemo, useState } from 'react';
import { Clock, Megaphone, Pencil, Plus, Trash2 } from 'lucide-react';
import type { MenuItem, Promotion, PromotionKind } from '../../../shared/types';
import { DAY_NAMES, PROMOTION_KIND_LABELS } from '../../../shared/types';
import { describeSchedule } from '../../../shared/promo';
import { api, ApiError } from '../../lib/api';
import { Confirm, EmptyState, ErrorState, Field, Modal, Spinner, Switch, useToast } from '../../components/ui';
import { PageHeader, StatusPill } from '../../components/admin/parts';

interface Draft {
  id?: number;
  name: string;
  description: string;
  kind: PromotionKind;
  discount_percent: string;
  start_at: string;
  end_at: string;
  days_of_week: number[];
  start_time: string;
  end_time: string;
  is_active: boolean;
  item_ids: number[];
}

const EMPTY: Draft = {
  name: '',
  description: '',
  kind: 'happy_hour',
  discount_percent: '',
  start_at: '',
  end_at: '',
  days_of_week: [],
  start_time: '',
  end_time: '',
  is_active: true,
  item_ids: [],
};

export default function PromotionsPage() {
  const { push } = useToast();
  const [promotions, setPromotions] = useState<(Promotion & { is_currently_active?: boolean })[]>([]);
  const [items, setItems] = useState<MenuItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [toDelete, setToDelete] = useState<Promotion | null>(null);
  const [itemQuery, setItemQuery] = useState('');

  const load = () => {
    setLoading(true);
    Promise.all([api.listPromotions(), api.listItems()])
      .then(([promos, menu]) => {
        setPromotions(promos.promotions);
        setItems(menu.items);
        setError(null);
      })
      .catch((e) => setError(e instanceof ApiError ? e.message : 'Could not load promotions.'))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    document.title = 'Promotions — Eclipse Admin';
    load();
  }, []);

  const filteredItems = useMemo(() => {
    const q = itemQuery.trim().toLowerCase();
    if (!q) return items.slice(0, 40);
    return items.filter((i) => `${i.name} ${i.category_name}`.toLowerCase().includes(q)).slice(0, 60);
  }, [items, itemQuery]);

  const save = async () => {
    if (!draft) return;
    setSaving(true);
    setErrors({});
    try {
      const payload = {
        name: draft.name.trim(),
        description: draft.description.trim() || null,
        kind: draft.kind,
        discount_percent: draft.discount_percent === '' ? null : Number(draft.discount_percent),
        start_at: draft.start_at || null,
        end_at: draft.end_at || null,
        days_of_week: draft.days_of_week,
        start_time: draft.start_time || null,
        end_time: draft.end_time || null,
        is_active: draft.is_active,
        item_ids: draft.item_ids,
      };
      if (draft.id) await api.updatePromotion(draft.id, payload);
      else await api.createPromotion(payload);
      push('success', draft.id ? 'Promotion updated' : 'Promotion created');
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

  const remove = async () => {
    if (!toDelete) return;
    try {
      await api.deletePromotion(toDelete.id);
      push('success', 'Promotion deleted');
      setToDelete(null);
      load();
    } catch (e) {
      push('error', e instanceof ApiError ? e.message : 'Could not delete the promotion');
    }
  };

  if (error) return <ErrorState message={error} onRetry={load} />;

  return (
    <div>
      <PageHeader
        title="Promotions & happy hour"
        subtitle="Promotions apply automatically at the scheduled venue time (Africa/Lagos). Expired or out-of-window promotions never display."
        actions={
          <button className="btn-gold" onClick={() => setDraft({ ...EMPTY })}>
            <Plus size={15} /> New promotion
          </button>
        }
      />

      {loading ? (
        <div className="grid gap-3 sm:grid-cols-2">
          {Array.from({ length: 2 }).map((_, i) => (
            <div key={i} className="skeleton h-40 rounded-xl" />
          ))}
        </div>
      ) : promotions.length === 0 ? (
        <EmptyState
          icon={<Megaphone size={26} />}
          title="No promotions yet"
          message="Create a happy hour, a daily special or a featured cocktail. Promotions can discount selected items by a percentage."
          action={
            <button className="btn-gold mt-2" onClick={() => setDraft({ ...EMPTY })}>
              <Plus size={14} /> Set up a promotion
            </button>
          }
        />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {promotions.map((promo) => (
            <article key={promo.id} className="rounded-xl border border-white/[0.07] bg-ink-700/40 p-4">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="mb-1 flex flex-wrap items-center gap-1.5">
                    <span className="chip border-gold-400/35 bg-gold-400/10 text-gold-200">
                      {PROMOTION_KIND_LABELS[promo.kind]}
                    </span>
                    <StatusPill status={promo.is_currently_active ? 'active' : 'inactive'} />
                    {promo.discount_percent ? (
                      <span className="chip border-white/[0.12] bg-white/[0.04] text-cream">{promo.discount_percent}% off</span>
                    ) : null}
                  </div>
                  <h2 className="font-display text-lg text-cream">{promo.name}</h2>
                  {promo.description && <p className="mt-1 text-[12.5px] leading-relaxed text-smoke">{promo.description}</p>}
                  <p className="mt-2 flex items-center gap-1.5 text-[11px] uppercase tracking-[0.1em] text-gold-300/80">
                    <Clock size={11} /> {describeSchedule(promo, DAY_NAMES)}
                  </p>
                  {(promo.start_at || promo.end_at) && (
                    <p className="mt-1 text-[11px] text-smoke/60">
                      {promo.start_at ? `From ${promo.start_at}` : 'No start date'} ·{' '}
                      {promo.end_at ? `until ${promo.end_at}` : 'no end date'}
                    </p>
                  )}
                  <p className="mt-1 text-[11px] text-smoke/60">
                    {promo.item_ids.length === 0
                      ? 'Applies to every menu item'
                      : `Applies to ${promo.item_ids.length} selected item${promo.item_ids.length === 1 ? '' : 's'}`}
                  </p>
                </div>
                <div className="flex shrink-0 flex-col gap-1">
                  <button
                    className="p-1.5 text-smoke hover:text-cream"
                    onClick={() =>
                      setDraft({
                        id: promo.id,
                        name: promo.name,
                        description: promo.description ?? '',
                        kind: promo.kind,
                        discount_percent: promo.discount_percent === null ? '' : String(promo.discount_percent),
                        start_at: promo.start_at ?? '',
                        end_at: promo.end_at ?? '',
                        days_of_week: promo.days_of_week,
                        start_time: promo.start_time ?? '',
                        end_time: promo.end_time ?? '',
                        is_active: promo.is_active,
                        item_ids: promo.item_ids,
                      })
                    }
                    aria-label={`Edit ${promo.name}`}
                  >
                    <Pencil size={14} />
                  </button>
                  <button className="p-1.5 text-smoke hover:text-red-300" onClick={() => setToDelete(promo)} aria-label={`Delete ${promo.name}`}>
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            </article>
          ))}
        </div>
      )}

      <Modal
        open={!!draft}
        onClose={() => setDraft(null)}
        title={draft?.id ? 'Edit promotion' : 'New promotion'}
        size="lg"
        footer={
          <div className="flex justify-end gap-2">
            <button className="btn-ghost" onClick={() => setDraft(null)}>
              Cancel
            </button>
            <button className="btn-gold" onClick={save} disabled={saving || !draft?.name.trim()}>
              {saving ? <Spinner /> : null} Save promotion
            </button>
          </div>
        }
      >
        {draft && (
          <div className="space-y-3.5">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Name" htmlFor="promo-name" error={errors.name} required>
                <input
                  id="promo-name"
                  className="input"
                  value={draft.name}
                  onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                  placeholder="Golden Hour"
                  maxLength={120}
                />
              </Field>
              <Field label="Type" htmlFor="promo-kind">
                <select
                  id="promo-kind"
                  className="input"
                  value={draft.kind}
                  onChange={(e) => setDraft({ ...draft, kind: e.target.value as PromotionKind })}
                >
                  {Object.entries(PROMOTION_KIND_LABELS).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </Field>
            </div>

            <Field label="Description" htmlFor="promo-desc">
              <textarea
                id="promo-desc"
                className="input min-h-[64px]"
                value={draft.description}
                onChange={(e) => setDraft({ ...draft, description: e.target.value })}
                maxLength={500}
                placeholder="20% off every cocktail, Monday to Thursday, 5pm to 8pm."
              />
            </Field>

            <div className="grid gap-3 sm:grid-cols-3">
              <Field
                label="Discount %"
                htmlFor="promo-discount"
                error={errors.discount_percent}
                hint="Leave empty for non-monetary offers"
              >
                <input
                  id="promo-discount"
                  className="input"
                  inputMode="numeric"
                  value={draft.discount_percent}
                  onChange={(e) => setDraft({ ...draft, discount_percent: e.target.value.replace(/[^\d]/g, '') })}
                  placeholder="20"
                />
              </Field>
              <Field label="Start time" htmlFor="start-time" error={errors.end_time}>
                <input
                  id="start-time"
                  type="time"
                  className="input"
                  value={draft.start_time}
                  onChange={(e) => setDraft({ ...draft, start_time: e.target.value })}
                />
              </Field>
              <Field label="End time" htmlFor="end-time">
                <input
                  id="end-time"
                  type="time"
                  className="input"
                  value={draft.end_time}
                  onChange={(e) => setDraft({ ...draft, end_time: e.target.value })}
                />
              </Field>
            </div>

            <div>
              <p className="label">Days of the week</p>
              <div className="flex flex-wrap gap-1.5">
                {DAY_NAMES.map((day, index) => {
                  const active = draft.days_of_week.includes(index);
                  return (
                    <button
                      key={day}
                      type="button"
                      onClick={() =>
                        setDraft({
                          ...draft,
                          days_of_week: active
                            ? draft.days_of_week.filter((d) => d !== index)
                            : [...draft.days_of_week, index],
                        })
                      }
                      aria-pressed={active}
                      className={`rounded-full border px-3 py-1 text-[12px] ${
                        active ? 'border-gold-400/60 bg-gold-400/15 text-gold-100' : 'border-white/10 text-smoke hover:text-cream'
                      }`}
                    >
                      {day.slice(0, 3)}
                    </button>
                  );
                })}
              </div>
              <p className="mt-1 text-[11px] text-smoke/60">No days selected means every day.</p>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Start date (optional)" htmlFor="start-date" error={errors.start_at}>
                <input
                  id="start-date"
                  type="date"
                  className="input"
                  value={draft.start_at}
                  onChange={(e) => setDraft({ ...draft, start_at: e.target.value })}
                />
              </Field>
              <Field label="End date (optional)" htmlFor="end-date" error={errors.end_at}>
                <input
                  id="end-date"
                  type="date"
                  className="input"
                  value={draft.end_at}
                  onChange={(e) => setDraft({ ...draft, end_at: e.target.value })}
                />
              </Field>
            </div>

            <div>
              <p className="label">Applies to</p>
              <p className="mb-2 text-[11.5px] text-smoke/70">
                {draft.item_ids.length === 0
                  ? 'Every menu item (no selection)'
                  : `${draft.item_ids.length} item${draft.item_ids.length === 1 ? '' : 's'} selected`}
              </p>
              <input
                className="input mb-2"
                placeholder="Search items to include…"
                value={itemQuery}
                onChange={(e) => setItemQuery(e.target.value)}
              />
              <div className="max-h-48 overflow-y-auto rounded-lg border border-white/[0.07]">
                {filteredItems.map((item) => {
                  const checked = draft.item_ids.includes(item.id);
                  return (
                    <label
                      key={item.id}
                      className="flex cursor-pointer items-center gap-2.5 border-b border-white/[0.04] px-3 py-2 text-[12.5px] last:border-0 hover:bg-white/[0.03]"
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() =>
                          setDraft({
                            ...draft,
                            item_ids: checked ? draft.item_ids.filter((i) => i !== item.id) : [...draft.item_ids, item.id],
                          })
                        }
                        className="h-3.5 w-3.5 accent-[#d0ac6b]"
                      />
                      <span className="flex-1 truncate text-cream/85">{item.name}</span>
                      <span className="text-[11px] text-smoke/60">{item.category_name}</span>
                    </label>
                  );
                })}
                {filteredItems.length === 0 && <p className="px-3 py-4 text-center text-[12px] text-smoke/60">No items match.</p>}
              </div>
              {draft.item_ids.length > 0 && (
                <button
                  type="button"
                  className="mt-1.5 text-[11px] uppercase tracking-[0.1em] text-gold-300 hover:text-gold-100"
                  onClick={() => setDraft({ ...draft, item_ids: [] })}
                >
                  Clear selection (apply to all)
                </button>
              )}
            </div>

            <Switch
              checked={draft.is_active}
              onChange={(v) => setDraft({ ...draft, is_active: v })}
              label="Promotion enabled"
              description="Disabled promotions never display or affect prices."
            />
          </div>
        )}
      </Modal>

      <Confirm
        open={!!toDelete}
        title="Delete promotion?"
        message={`“${toDelete?.name ?? ''}” will be removed and prices return to normal.`}
        confirmLabel="Delete"
        onConfirm={remove}
        onCancel={() => setToDelete(null)}
      />
    </div>
  );
}
