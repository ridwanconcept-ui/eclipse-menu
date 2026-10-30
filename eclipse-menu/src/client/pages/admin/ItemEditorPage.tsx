import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, ImagePlus, Save, Trash2, Upload, X } from 'lucide-react';
import type { Category, MenuItem } from '../../../shared/types';
import { api, ApiError } from '../../lib/api';
import { koboToInput, parseNairaToKobo } from '../../../shared/money';
import { ErrorState, Field, Spinner, Switch, useToast } from '../../components/ui';
import { PageHeader } from '../../components/admin/parts';
import { MenuItemCard } from '../../components/menu/ItemViews';

interface FormState {
  name: string;
  category_id: string;
  description: string;
  ingredients: string;
  allergens: string;
  price: string;
  promotional_price: string;
  size_label: string;
  availability_status: MenuItem['availability_status'];
  is_signature: boolean;
  is_popular: boolean;
  is_new: boolean;
  display_order: string;
  image_url: string;
}

const EMPTY: FormState = {
  name: '',
  category_id: '',
  description: '',
  ingredients: '',
  allergens: '',
  price: '',
  promotional_price: '',
  size_label: '',
  availability_status: 'available',
  is_signature: false,
  is_popular: false,
  is_new: false,
  display_order: '',
  image_url: '',
};

export default function ItemEditorPage() {
  const { id } = useParams();
  const isEdit = Boolean(id);
  const navigate = useNavigate();
  const { push } = useToast();
  const [form, setForm] = useState<FormState>(EMPTY);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    document.title = isEdit ? 'Edit item — Eclipse Admin' : 'New item — Eclipse Admin';
    const load = async () => {
      try {
        const { categories: cats } = await api.listItems();
        setCategories(cats);
        if (isEdit) {
          const { item } = await api.getItem(Number(id));
          setForm({
            name: item.name,
            category_id: String(item.category_id),
            description: item.description ?? '',
            ingredients: item.ingredients ?? '',
            allergens: item.allergens ?? '',
            price: koboToInput(item.price),
            promotional_price: koboToInput(item.promotional_price),
            size_label: item.size_label ?? '',
            availability_status: item.availability_status,
            is_signature: item.is_signature,
            is_popular: item.is_popular,
            is_new: item.is_new,
            display_order: String(item.display_order),
            image_url: item.image_url ?? '',
          });
        } else if (cats.length) {
          setForm((f) => ({ ...f, category_id: String(cats[0].id) }));
        }
      } catch (e) {
        if (e instanceof ApiError && e.status === 404) setNotFound(true);
        else setFormError(e instanceof ApiError ? e.message : 'Could not load the item');
      } finally {
        setLoading(false);
      }
    };
    void load();
  }, [id, isEdit]);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => setForm((f) => ({ ...f, [key]: value }));

  const upload = async (file: File) => {
    setUploading(true);
    try {
      const { url } = await api.uploadImage(file);
      set('image_url', url);
      push('success', 'Image uploaded');
    } catch (e) {
      push('error', e instanceof ApiError ? e.message : 'Upload failed');
    } finally {
      setUploading(false);
    }
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrors({});
    setFormError(null);

    const priceKobo = parseNairaToKobo(form.price);
    if (priceKobo === null) {
      setErrors({ price: 'Enter a valid price in naira, e.g. 7000 or 7000.50' });
      return;
    }
    const promoRaw = form.promotional_price.trim();
    const promoKobo = promoRaw === '' ? null : parseNairaToKobo(promoRaw);
    if (promoRaw !== '' && promoKobo === null) {
      setErrors({ promotional_price: 'Enter a valid naira amount, or leave this empty' });
      return;
    }
    if (promoKobo !== null && promoKobo >= priceKobo) {
      setErrors({ promotional_price: 'Promotional price must be lower than the regular price' });
      return;
    }
    if (!form.category_id) {
      setErrors({ category_id: 'Choose a category' });
      return;
    }

    const payload = {
      name: form.name.trim(),
      category_id: Number(form.category_id),
      description: form.description.trim() || null,
      ingredients: form.ingredients.trim() || null,
      allergens: form.allergens.trim() || null,
      price: priceKobo,
      promotional_price: promoKobo,
      image_url: form.image_url.trim() || null,
      size_label: form.size_label.trim() || null,
      availability_status: form.availability_status,
      is_signature: form.is_signature,
      is_popular: form.is_popular,
      is_new: form.is_new,
      display_order: form.display_order ? Number(form.display_order) : undefined,
    };

    setSaving(true);
    try {
      if (isEdit) {
        await api.updateItem(Number(id), payload);
        push('success', 'Item updated — the live menu now shows the new details');
      } else {
        await api.createItem(payload);
        push('success', 'Item created');
      }
      navigate('/admin/items');
    } catch (err) {
      if (err instanceof ApiError) {
        setErrors(err.fields ?? {});
        setFormError(err.message);
      } else {
        setFormError('Could not save the item');
      }
    } finally {
      setSaving(false);
    }
  };

  if (notFound) {
    return <ErrorState message="That menu item no longer exists." onRetry={() => navigate('/admin/items')} />;
  }

  const previewItem: MenuItem | null = form.name
    ? {
        id: 0,
        category_id: Number(form.category_id) || 0,
        category_name: categories.find((c) => String(c.id) === form.category_id)?.name ?? 'Uncategorised',
        category_slug: 'preview',
        name: form.name,
        slug: 'preview',
        description: form.description || null,
        ingredients: form.ingredients || null,
        price: parseNairaToKobo(form.price) ?? 0,
        promotional_price: parseNairaToKobo(form.promotional_price),
        effective_price:
          parseNairaToKobo(form.promotional_price) ?? parseNairaToKobo(form.price) ?? 0,
        active_promotion: parseNairaToKobo(form.promotional_price) ? 'Special price' : null,
        image_url: form.image_url || null,
        size_label: form.size_label || null,
        allergens: form.allergens || null,
        availability_status: form.availability_status,
        is_signature: form.is_signature,
        is_popular: form.is_popular,
        is_new: form.is_new,
        display_order: 0,
        created_at: '',
        updated_at: '',
      }
    : null;

  return (
    <div>
      <Link to="/admin/items" className="mb-4 inline-flex items-center gap-1.5 text-[11.5px] uppercase tracking-[0.14em] text-smoke hover:text-gold-200">
        <ArrowLeft size={12} /> Menu items
      </Link>
      <PageHeader
        title={isEdit ? 'Edit menu item' : 'New menu item'}
        subtitle="Prices are entered in naira and stored as whole kobo so totals never drift."
      />

      {loading ? (
        <div className="skeleton h-64 rounded-xl" />
      ) : (
        <form onSubmit={submit} className="grid gap-5 lg:grid-cols-[1.5fr_1fr]">
          <div className="space-y-4">
            <div className="card p-4 sm:p-5">
              <h2 className="mb-3 font-display text-base text-cream">Basics</h2>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Item name" htmlFor="name" error={errors.name} required className="sm:col-span-2">
                  <input
                    id="name"
                    className="input"
                    value={form.name}
                    onChange={(e) => set('name', e.target.value)}
                    placeholder="e.g. Classic Mojito"
                    maxLength={120}
                    required
                  />
                </Field>
                <Field label="Category" htmlFor="category" error={errors.category_id} required>
                  <select
                    id="category"
                    className="input"
                    value={form.category_id}
                    onChange={(e) => set('category_id', e.target.value)}
                    required
                  >
                    <option value="">Select a category</option>
                    {categories.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                        {c.is_active ? '' : ' (hidden)'}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Size / serving (optional)" htmlFor="size" hint="e.g. 75cl bottle, 500ml, double">
                  <input id="size" className="input" value={form.size_label} onChange={(e) => set('size_label', e.target.value)} maxLength={80} />
                </Field>
                <Field label="Description" htmlFor="description" className="sm:col-span-2" error={errors.description}>
                  <textarea
                    id="description"
                    className="input min-h-[80px]"
                    value={form.description}
                    onChange={(e) => set('description', e.target.value)}
                    maxLength={1000}
                    placeholder="How the item tastes, what makes it special…"
                  />
                </Field>
                <Field
                  label="Ingredients"
                  htmlFor="ingredients"
                  className="sm:col-span-2"
                  hint="Only list what you actually use — guests rely on this."
                >
                  <textarea
                    id="ingredients"
                    className="input min-h-[64px]"
                    value={form.ingredients}
                    onChange={(e) => set('ingredients', e.target.value)}
                    maxLength={1000}
                    placeholder="Lime, mint, sugar syrup, soda water"
                  />
                </Field>
                <Field label="Allergen information (optional)" htmlFor="allergens" className="sm:col-span-2">
                  <input
                    id="allergens"
                    className="input"
                    value={form.allergens}
                    onChange={(e) => set('allergens', e.target.value)}
                    maxLength={500}
                    placeholder="Contains sulphites, milk"
                  />
                </Field>
              </div>
            </div>

            <div className="card p-4 sm:p-5">
              <h2 className="mb-3 font-display text-base text-cream">Pricing</h2>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Price (₦)" htmlFor="price" error={errors.price} required hint="Naira, e.g. 7000">
                  <input
                    id="price"
                    className="input"
                    inputMode="decimal"
                    value={form.price}
                    onChange={(e) => set('price', e.target.value)}
                    placeholder="7000"
                    required
                  />
                </Field>
                <Field
                  label="Promotional price (₦, optional)"
                  htmlFor="promo"
                  error={errors.promotional_price}
                  hint="Shows a strike-through of the regular price"
                >
                  <input
                    id="promo"
                    className="input"
                    inputMode="decimal"
                    value={form.promotional_price}
                    onChange={(e) => set('promotional_price', e.target.value)}
                    placeholder="e.g. 5500"
                  />
                </Field>
              </div>
            </div>

            <div className="card p-4 sm:p-5">
              <h2 className="mb-3 font-display text-base text-cream">Availability & labels</h2>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Availability" htmlFor="availability">
                  <select
                    id="availability"
                    className="input"
                    value={form.availability_status}
                    onChange={(e) => set('availability_status', e.target.value as FormState['availability_status'])}
                  >
                    <option value="available">Available</option>
                    <option value="sold_out">Sold out</option>
                    <option value="unavailable">Unavailable (hidden)</option>
                  </select>
                </Field>
                <Field label="Display order (optional)" htmlFor="order" hint="Lower numbers appear first">
                  <input
                    id="order"
                    className="input"
                    inputMode="numeric"
                    value={form.display_order}
                    onChange={(e) => set('display_order', e.target.value.replace(/[^\d]/g, ''))}
                  />
                </Field>
              </div>
              <div className="mt-4 space-y-3">
                <Switch checked={form.is_signature} onChange={(v) => set('is_signature', v)} label="Signature item" description="Highlights the house specialities" />
                <Switch checked={form.is_popular} onChange={(v) => set('is_popular', v)} label="Popular" description="Guest favourite" />
                <Switch checked={form.is_new} onChange={(v) => set('is_new', v)} label="New" description="Recently added to the menu" />
              </div>
            </div>

            {formError && <p className="rounded-lg bg-red-950/50 px-3 py-2 text-[12.5px] text-red-200">{formError}</p>}

            <div className="flex items-center gap-2">
              <button className="btn-gold" type="submit" disabled={saving}>
                {saving ? <Spinner /> : <Save size={15} />} {isEdit ? 'Save changes' : 'Create item'}
              </button>
              <button type="button" className="btn-ghost" onClick={() => navigate('/admin/items')}>
                Cancel
              </button>
            </div>
          </div>

          {/* Sidebar: image + live preview */}
          <div className="space-y-4">
            <div className="card p-4">
              <h2 className="mb-2 font-display text-base text-cream">Image</h2>
              <div className="relative mb-2 overflow-hidden rounded-xl border border-white/10 bg-ink-800">
                {form.image_url ? (
                  <>
                    <img src={form.image_url} alt="" className="aspect-[16/10] w-full object-cover" />
                    <button
                      type="button"
                      onClick={() => set('image_url', '')}
                      className="absolute right-2 top-2 rounded-full bg-black/70 p-1.5 text-cream hover:bg-black"
                      aria-label="Remove image"
                    >
                      <X size={13} />
                    </button>
                  </>
                ) : (
                  <div className="placeholder-tile flex aspect-[16/10] w-full flex-col items-center justify-center gap-1.5 text-smoke">
                    <ImagePlus size={22} className="text-gold-400/60" />
                    <span className="text-[11px]">Elegant placeholder is shown instead</span>
                  </div>
                )}
              </div>
              <label className="btn-ghost w-full cursor-pointer">
                {uploading ? <Spinner /> : <Upload size={14} />}
                {uploading ? 'Uploading…' : 'Upload image'}
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) void upload(file);
                  }}
                />
              </label>
              <Field label="…or paste an image URL" className="mt-2">
                <input className="input" value={form.image_url} onChange={(e) => set('image_url', e.target.value)} placeholder="/uploads/… or https://…" />
              </Field>
              <p className="mt-2 text-[11px] leading-snug text-smoke/60">PNG, JPEG or WebP · max 4 MB.</p>
            </div>

            <div className="card p-4">
              <h2 className="mb-2 font-display text-base text-cream">Guest preview</h2>
              {previewItem ? (
                <MenuItemCard item={previewItem} onSelect={() => {}} />
              ) : (
                <p className="py-6 text-center text-[12px] text-smoke/60">Start typing a name to preview the card.</p>
              )}
              {isEdit && (
                <Link to="/admin/items" className="mt-3 flex items-center justify-center gap-1.5 text-[11px] uppercase tracking-[0.12em] text-smoke/60">
                  <Trash2 size={11} /> Delete from the list view
                </Link>
              )}
            </div>
          </div>
        </form>
      )}
    </div>
  );
}
