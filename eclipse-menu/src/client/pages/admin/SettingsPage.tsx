import { useEffect, useState } from 'react';
import { Building2, Clock, ImagePlus, KeyRound, Save, Upload, X } from 'lucide-react';
import type { Business, OpeningHour } from '../../../shared/types';
import { DAY_NAMES } from '../../../shared/types';
import { api, ApiError } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { BrandMark, ErrorState, Field, Spinner, Switch, useToast } from '../../components/ui';
import { PageHeader } from '../../components/admin/parts';

const DEFAULT_HOURS: OpeningHour[] = DAY_NAMES.map((day) => ({ day, open: '18:00', close: '02:00', closed: false }));

export default function SettingsPage() {
  const { push } = useToast();
  const { user } = useAuth();
  const [business, setBusiness] = useState<Business | null>(null);
  const [form, setForm] = useState<Partial<Business>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [uploading, setUploading] = useState<'logo' | 'hero' | null>(null);
  const [pw, setPw] = useState({ current_password: '', new_password: '', confirm: '' });
  const [pwBusy, setPwBusy] = useState(false);

  const load = () => {
    setLoading(true);
    api
      .getSettings()
      .then(({ business: b }) => {
        setBusiness(b);
        setForm({
          ...b,
          opening_hours: b.opening_hours?.length ? b.opening_hours : DEFAULT_HOURS,
        });
        setError(null);
      })
      .catch((e) => setError(e instanceof ApiError ? e.message : 'Could not load settings.'))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    document.title = 'Settings — Eclipse Admin';
    load();
  }, []);

  const set = <K extends keyof Business>(key: K, value: Business[K]) => setForm((f) => ({ ...f, [key]: value }));

  const upload = async (file: File, target: 'logo' | 'hero') => {
    setUploading(target);
    try {
      const { url } = await api.uploadImage(file);
      set(target === 'logo' ? 'logo_url' : 'hero_image_url', url);
      push('success', 'Image uploaded — remember to save');
    } catch (e) {
      push('error', e instanceof ApiError ? e.message : 'Upload failed');
    } finally {
      setUploading(null);
    }
  };

  const save = async () => {
    setSaving(true);
    setErrors({});
    try {
      const { business: updated } = await api.updateSettings({
        name: form.name,
        tagline: form.tagline ?? null,
        description: form.description ?? null,
        contact_number: form.contact_number ?? null,
        address: form.address ?? null,
        city: form.city ?? null,
        currency: form.currency ?? 'NGN',
        timezone: form.timezone ?? 'Africa/Lagos',
        hero_image_url: form.hero_image_url ?? null,
        hero_title: form.hero_title ?? null,
        hero_message: form.hero_message ?? null,
        promo_banner: form.promo_banner ?? null,
        logo_url: form.logo_url ?? null,
        opening_hours: form.opening_hours,
        social_links: form.social_links ?? {},
        ordering_enabled: form.ordering_enabled,
        menu_visible: form.menu_visible,
        default_qr_path: form.default_qr_path ?? '/',
        public_base_url: form.public_base_url ?? null,
      });
      setBusiness(updated);
      setForm({ ...updated, opening_hours: updated.opening_hours?.length ? updated.opening_hours : DEFAULT_HOURS });
      push('success', 'Settings saved — the live menu is updated');
    } catch (e) {
      if (e instanceof ApiError) {
        setErrors(e.fields ?? {});
        push('error', e.message);
      }
    } finally {
      setSaving(false);
    }
  };

  const changePassword = async () => {
    if (pw.new_password !== pw.confirm) {
      push('error', 'The new passwords do not match');
      return;
    }
    setPwBusy(true);
    try {
      const res = await api.changePassword(pw.current_password, pw.new_password);
      push('success', res.message);
      setPw({ current_password: '', new_password: '', confirm: '' });
      window.setTimeout(() => {
        window.location.href = '/admin/login';
      }, 1600);
    } catch (e) {
      push('error', e instanceof ApiError ? e.message : 'Could not change the password');
    } finally {
      setPwBusy(false);
    }
  };

  if (error) return <ErrorState message={error} onRetry={load} />;
  if (loading || !business) return <div className="skeleton h-72 rounded-xl" />;

  const canEdit = user?.role === 'owner' || user?.role === 'manager';

  return (
    <div>
      <PageHeader
        title="Business settings"
        subtitle="Everything here is stored in the database and appears on the live menu immediately after saving."
        actions={
          canEdit && (
            <button className="btn-gold" onClick={save} disabled={saving}>
              {saving ? <Spinner /> : <Save size={15} />} Save changes
            </button>
          )
        }
      />

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Identity */}
        <section className="card p-4 sm:p-5">
          <h2 className="mb-3 flex items-center gap-2 font-display text-base text-cream">
            <Building2 size={15} className="text-gold-400/80" /> Venue identity
          </h2>
          <div className="space-y-3">
            <Field label="Business name" htmlFor="biz-name" error={errors.name} required>
              <input id="biz-name" className="input" value={form.name ?? ''} onChange={(e) => set('name', e.target.value)} />
            </Field>
            <Field label="Tagline" htmlFor="biz-tagline">
              <input
                id="biz-tagline"
                className="input"
                value={form.tagline ?? ''}
                onChange={(e) => set('tagline', e.target.value)}
                placeholder="Your Evening, Elevated."
              />
            </Field>
            <Field label="Description" htmlFor="biz-desc">
              <textarea
                id="biz-desc"
                className="input min-h-[70px]"
                value={form.description ?? ''}
                onChange={(e) => set('description', e.target.value)}
              />
            </Field>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Contact number" htmlFor="biz-phone">
                <input
                  id="biz-phone"
                  className="input"
                  value={form.contact_number ?? ''}
                  onChange={(e) => set('contact_number', e.target.value)}
                  placeholder="+234 …"
                />
              </Field>
              <Field label="City / country" htmlFor="biz-city">
                <input id="biz-city" className="input" value={form.city ?? ''} onChange={(e) => set('city', e.target.value)} />
              </Field>
            </div>
            <Field label="Address" htmlFor="biz-address">
              <input id="biz-address" className="input" value={form.address ?? ''} onChange={(e) => set('address', e.target.value)} />
            </Field>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Currency" htmlFor="biz-currency" hint="ISO code, e.g. NGN">
                <input id="biz-currency" className="input" value={form.currency ?? 'NGN'} onChange={(e) => set('currency', e.target.value.toUpperCase())} maxLength={3} />
              </Field>
              <Field label="Timezone" htmlFor="biz-tz" hint="Promotions use this clock">
                <select id="biz-tz" className="input" value={form.timezone ?? 'Africa/Lagos'} onChange={(e) => set('timezone', e.target.value)}>
                  {['Africa/Lagos', 'Africa/Accra', 'Africa/Nairobi', 'Africa/Johannesburg', 'Europe/London', 'Europe/Paris', 'America/New_York', 'America/Los_Angeles', 'Asia/Dubai'].map((tz) => (
                    <option key={tz} value={tz}>
                      {tz}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
          </div>
        </section>

        {/* Branding */}
        <section className="card p-4 sm:p-5">
          <h2 className="mb-3 flex items-center gap-2 font-display text-base text-cream">
            <ImagePlus size={15} className="text-gold-400/80" /> Branding & hero
          </h2>
          <div className="space-y-3">
            <div>
              <p className="label">Logo</p>
              <div className="flex items-center gap-3">
                {form.logo_url ? (
                  <div className="relative">
                    <img src={form.logo_url} alt="" className="h-12 w-12 rounded-full object-cover ring-1 ring-gold-400/30" />
                    <button
                      className="absolute -right-1 -top-1 rounded-full bg-black/80 p-1 text-cream"
                      onClick={() => set('logo_url', null)}
                      aria-label="Remove logo"
                    >
                      <X size={10} />
                    </button>
                  </div>
                ) : (
                  <BrandMark size={48} />
                )}
                <label className="btn-ghost cursor-pointer">
                  {uploading === 'logo' ? <Spinner /> : <Upload size={14} />} Upload
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) void upload(f, 'logo');
                    }}
                  />
                </label>
                <span className="text-[11px] text-smoke/60">Placeholder monogram is used until you upload one.</span>
              </div>
            </div>

            <div>
              <p className="label">Hero banner image</p>
              <div className="overflow-hidden rounded-xl border border-white/10">
                {form.hero_image_url ? (
                  <img src={form.hero_image_url} alt="" className="aspect-[16/9] w-full object-cover" />
                ) : (
                  <div className="placeholder-tile flex aspect-[16/9] items-center justify-center text-[11.5px] text-smoke">
                    No banner image — a gradient is used
                  </div>
                )}
              </div>
              <div className="mt-2 flex items-center gap-2">
                <label className="btn-ghost cursor-pointer">
                  {uploading === 'hero' ? <Spinner /> : <Upload size={14} />} Upload banner
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) void upload(f, 'hero');
                    }}
                  />
                </label>
                {form.hero_image_url && (
                  <button className="btn-quiet" onClick={() => set('hero_image_url', null)}>
                    Remove
                  </button>
                )}
              </div>
            </div>

            <Field label="Hero title" htmlFor="hero-title">
              <input id="hero-title" className="input" value={form.hero_title ?? ''} onChange={(e) => set('hero_title', e.target.value)} placeholder="Explore Our Menu" />
            </Field>
            <Field label="Hero message" htmlFor="hero-msg">
              <textarea
                id="hero-msg"
                className="input min-h-[60px]"
                value={form.hero_message ?? ''}
                onChange={(e) => set('hero_message', e.target.value)}
              />
            </Field>
            <Field label="Promotional banner (optional)" htmlFor="promo-banner" hint="Shown as a pill on the hero">
              <input
                id="promo-banner"
                className="input"
                value={form.promo_banner ?? ''}
                onChange={(e) => set('promo_banner', e.target.value)}
                placeholder="Happy hour: 20% off cocktails, Mon–Thu 5–8pm"
              />
            </Field>
          </div>
        </section>

        {/* Opening hours */}
        <section className="card p-4 sm:p-5">
          <h2 className="mb-3 flex items-center gap-2 font-display text-base text-cream">
            <Clock size={15} className="text-gold-400/80" /> Opening hours
          </h2>
          <div className="space-y-1.5">
            {(form.opening_hours ?? DEFAULT_HOURS).map((hour, index) => (
              <div key={hour.day} className="flex items-center gap-2 text-[12.5px]">
                <span className="w-24 shrink-0 text-smoke">{hour.day}</span>
                <input
                  type="time"
                  className="input !py-1.5 !text-[12px]"
                  value={hour.open ?? ''}
                  disabled={hour.closed}
                  onChange={(e) => {
                    const next = [...(form.opening_hours ?? DEFAULT_HOURS)];
                    next[index] = { ...hour, open: e.target.value };
                    set('opening_hours', next);
                  }}
                  aria-label={`${hour.day} opening time`}
                />
                <span className="text-smoke/50">–</span>
                <input
                  type="time"
                  className="input !py-1.5 !text-[12px]"
                  value={hour.close ?? ''}
                  disabled={hour.closed}
                  onChange={(e) => {
                    const next = [...(form.opening_hours ?? DEFAULT_HOURS)];
                    next[index] = { ...hour, close: e.target.value };
                    set('opening_hours', next);
                  }}
                  aria-label={`${hour.day} closing time`}
                />
                <label className="ml-auto flex items-center gap-1 text-[11px] text-smoke">
                  <input
                    type="checkbox"
                    checked={hour.closed}
                    className="h-3.5 w-3.5 accent-[#d0ac6b]"
                    onChange={(e) => {
                      const next = [...(form.opening_hours ?? DEFAULT_HOURS)];
                      next[index] = { ...hour, closed: e.target.checked };
                      set('opening_hours', next);
                    }}
                  />
                  Closed
                </label>
              </div>
            ))}
          </div>
        </section>

        {/* Operations */}
        <section className="card p-4 sm:p-5">
          <h2 className="mb-3 font-display text-base text-cream">Menu & ordering</h2>
          <div className="space-y-4">
            <Switch
              checked={form.menu_visible !== false}
              onChange={(v) => set('menu_visible', v)}
              label="Menu is live"
              description="Turn off to hide the whole menu from guests (e.g. during refurbishment)."
            />
            <Switch
              checked={!!form.ordering_enabled}
              onChange={(v) => set('ordering_enabled', v)}
              label="Digital ordering"
              description="Off = browse-only mode: guests scan and order with a member of staff. On = cart, table numbers and an order queue."
            />
            <Field label="Default QR landing path" htmlFor="qr-path" hint="Used when a QR code has no table identifier">
              <input id="qr-path" className="input" value={form.default_qr_path ?? '/'} onChange={(e) => set('default_qr_path', e.target.value)} />
            </Field>
            <Field label="Public base URL" htmlFor="base-url" hint="Your HTTPS domain — used to build QR destinations">
              <input
                id="base-url"
                className="input"
                value={form.public_base_url ?? ''}
                onChange={(e) => set('public_base_url', e.target.value)}
                placeholder="https://menu.yourvenue.com"
              />
            </Field>

            <div>
              <p className="label">Social links</p>
              <div className="grid gap-2 sm:grid-cols-2">
                {(['instagram', 'whatsapp', 'x', 'facebook', 'tiktok'] as const).map((key) => (
                  <input
                    key={key}
                    className="input"
                    value={(form.social_links?.[key] as string) ?? ''}
                    onChange={(e) => set('social_links', { ...(form.social_links ?? {}), [key]: e.target.value })}
                    placeholder={key === 'whatsapp' ? 'WhatsApp number' : `${key} URL`}
                    aria-label={`${key} link`}
                  />
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* Password */}
        <section className="card p-4 sm:p-5 lg:col-span-2">
          <h2 className="mb-3 flex items-center gap-2 font-display text-base text-cream">
            <KeyRound size={15} className="text-gold-400/80" /> Change your password
          </h2>
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Current password" htmlFor="pw-current">
              <input
                id="pw-current"
                type="password"
                className="input"
                autoComplete="current-password"
                value={pw.current_password}
                onChange={(e) => setPw({ ...pw, current_password: e.target.value })}
              />
            </Field>
            <Field label="New password" htmlFor="pw-new" hint="At least 10 characters">
              <input
                id="pw-new"
                type="password"
                className="input"
                autoComplete="new-password"
                value={pw.new_password}
                onChange={(e) => setPw({ ...pw, new_password: e.target.value })}
              />
            </Field>
            <Field label="Confirm new password" htmlFor="pw-confirm">
              <input
                id="pw-confirm"
                type="password"
                className="input"
                autoComplete="new-password"
                value={pw.confirm}
                onChange={(e) => setPw({ ...pw, confirm: e.target.value })}
              />
            </Field>
          </div>
          <p className="mt-2 text-[11.5px] text-smoke/60">
            Changing your password signs you out of every device, including this one.
          </p>
          <button
            className="btn-ghost mt-3"
            onClick={changePassword}
            disabled={pwBusy || !pw.current_password || pw.new_password.length < 10}
          >
            {pwBusy ? <Spinner /> : <KeyRound size={14} />} Update password
          </button>
        </section>
      </div>

      {canEdit && (
        <div className="mt-5 flex items-center gap-2">
          <button className="btn-gold" onClick={save} disabled={saving}>
            {saving ? <Spinner /> : <Save size={15} />} Save changes
          </button>
          <button className="btn-ghost" onClick={load} disabled={saving}>
            Discard
          </button>
        </div>
      )}
    </div>
  );
}
