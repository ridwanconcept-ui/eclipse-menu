import { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  Copy,
  Download,
  ExternalLink,
  Eye,
  Plus,
  Printer,
  QrCode as QrIcon,
  RefreshCw,
  Trash2,
} from 'lucide-react';
import type { Business, QrCode, VenueArea } from '../../../shared/types';
import { VENUE_AREA_LABELS } from '../../../shared/types';
import { api, ApiError } from '../../lib/api';
import { Confirm, ErrorState, Field, Modal, Spinner, Switch, useToast, BrandMark } from '../../components/ui';
import { PageHeader, StatusPill } from '../../components/admin/parts';

export default function QrCodesPage() {
  const { push } = useToast();
  const [codes, setCodes] = useState<QrCode[]>([]);
  const [business, setBusiness] = useState<Business | null>(null);
  const [baseUrl, setBaseUrl] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [draft, setDraft] = useState({ label: '', table_identifier: '', area: 'general' as VenueArea });
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [toDelete, setToDelete] = useState<QrCode | null>(null);
  const [printTarget, setPrintTarget] = useState<'all' | QrCode | null>(null);
  const [preview, setPreview] = useState<QrCode | null>(null);
  const [urlDraft, setUrlDraft] = useState('');
  const [savingUrl, setSavingUrl] = useState(false);
  const printRef = useRef<HTMLDivElement>(null);

  const load = () => {
    setLoading(true);
    Promise.all([api.listQr(), api.getSettings()])
      .then(([qr, settings]) => {
        setCodes(qr.qr_codes);
        setBaseUrl(qr.base_url);
        setBusiness(settings.business);
        setUrlDraft(settings.business.public_base_url ?? '');
        setError(null);
      })
      .catch((e) => setError(e instanceof ApiError ? e.message : 'Could not load QR codes.'))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    document.title = 'QR codes — Eclipse Admin';
    load();
  }, []);

  const isLocal = useMemo(() => /localhost|127\.0\.0\.1|0\.0\.0\.0|\.local/i.test(baseUrl), [baseUrl]);

  const create = async () => {
    setSaving(true);
    setErrors({});
    try {
      await api.createQr({
        label: draft.label.trim(),
        table_identifier: draft.table_identifier.trim() || null,
        area: draft.area,
      });
      push('success', 'QR code created');
      setCreating(false);
      setDraft({ label: '', table_identifier: '', area: 'general' });
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

  const toggleActive = async (qr: QrCode) => {
    try {
      await api.updateQr(qr.id, { is_active: !qr.is_active });
      setCodes((prev) => prev.map((c) => (c.id === qr.id ? { ...c, is_active: !c.is_active } : c)));
      push('success', `${qr.label} ${qr.is_active ? 'deactivated' : 'activated'}`);
    } catch (e) {
      push('error', e instanceof ApiError ? e.message : 'Could not update the QR code');
    }
  };

  const saveBaseUrl = async () => {
    setSavingUrl(true);
    try {
      const { business: updated } = await api.updateSettings({ public_base_url: urlDraft.trim() || null });
      setBusiness(updated);
      push('success', 'QR destination updated — regenerate the QR images to apply');
      load();
    } catch (e) {
      push('error', e instanceof ApiError ? e.message : 'Could not save the URL');
    } finally {
      setSavingUrl(false);
    }
  };

  const download = (qr: QrCode, format: 'png' | 'svg') => {
    const href = `/api/admin/qr/${qr.id}/image.${format}?base=${encodeURIComponent(baseUrl)}`;
    const a = document.createElement('a');
    a.href = href;
    a.download = `eclipse-qr-${qr.label.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}.${format}`;
    document.body.appendChild(a);
    a.click();
    a.remove();
  };

  const startPrint = (target: 'all' | QrCode) => {
    setPrintTarget(target);
    // Give React one frame to mount the print sheet before opening the dialog.
    window.setTimeout(() => window.print(), 220);
  };

  const printedCodes = printTarget === 'all' ? codes.filter((c) => c.is_active) : printTarget ? [printTarget] : [];

  if (error) return <ErrorState message={error} onRetry={load} />;

  return (
    <div>
      <PageHeader
        title="QR codes"
        subtitle="Each code encodes only the menu URL — so prices, items and categories can change forever without reprinting a single table card."
        actions={
          <>
            <button className="btn-ghost" onClick={() => startPrint('all')} disabled={codes.length === 0}>
              <Printer size={14} /> Print all (A4)
            </button>
            <button className="btn-gold" onClick={() => setCreating(true)}>
              <Plus size={15} /> New QR code
            </button>
          </>
        }
      />

      {/* Destination URL */}
      <div className={`mb-5 rounded-xl border p-4 ${isLocal ? 'border-amber-400/25 bg-amber-400/[0.05]' : 'border-white/[0.07] bg-ink-700/40'}`}>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div className="min-w-0">
            <p className="text-[10.5px] uppercase tracking-[0.14em] text-smoke">QR destination (current)</p>
            <p className="mt-1 break-all font-mono text-[12.5px] text-gold-100">{baseUrl}</p>
            {isLocal && (
              <p className="mt-2 flex items-start gap-1.5 text-[11.5px] leading-snug text-amber-200">
                <AlertTriangle size={13} className="mt-0.5 shrink-0" />
                This looks like a local address. Phones scanning the printed code will not reach it — set your public HTTPS
                domain below before printing.
              </p>
            )}
          </div>
          <div className="flex w-full items-end gap-2 sm:w-auto">
            <Field label="Public base URL" htmlFor="base-url" className="flex-1">
              <input
                id="base-url"
                className="input sm:w-72"
                placeholder="https://menu.yourvenue.com"
                value={urlDraft}
                onChange={(e) => setUrlDraft(e.target.value)}
              />
            </Field>
            <button className="btn-ghost" onClick={saveBaseUrl} disabled={savingUrl}>
              {savingUrl ? <Spinner /> : null} Save
            </button>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="skeleton h-56 rounded-xl" />
          ))}
        </div>
      ) : codes.length === 0 ? (
        <div className="rounded-xl border border-dashed border-white/10 px-6 py-12 text-center">
          <QrIcon size={26} className="mx-auto text-gold-400/70" />
          <h2 className="mt-2 font-display text-lg text-cream">No QR codes yet</h2>
          <p className="mx-auto mt-1 max-w-sm text-[12.5px] text-smoke">
            Create a code for the entrance, the bar, or one per table so orders know where to go.
          </p>
          <button className="btn-gold mt-4" onClick={() => setCreating(true)}>
            <Plus size={14} /> Create the first QR code
          </button>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {codes.map((qr) => (
            <article key={qr.id} className="flex flex-col rounded-xl border border-white/[0.07] bg-ink-700/40 p-4">
              <div className="flex items-start gap-3">
                <div className="rounded-lg bg-white p-1.5">
                  <img
                    src={`/api/admin/qr/${qr.id}/image.png?size=300&base=${encodeURIComponent(baseUrl)}`}
                    alt={`QR code for ${qr.label}`}
                    width={72}
                    height={72}
                    className="h-[72px] w-[72px]"
                    loading="lazy"
                  />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-1">
                    <h2 className="truncate font-display text-[15px] text-cream">{qr.label}</h2>
                    <StatusPill status={qr.is_active ? 'active' : 'inactive'} />
                  </div>
                  <p className="mt-0.5 text-[11.5px] text-smoke">
                    {VENUE_AREA_LABELS[qr.area]}
                    {qr.table_identifier ? ` · ${qr.table_identifier}` : ''}
                  </p>
                  <p className="mt-1 text-[11px] text-smoke/60">{qr.scan_count ?? 0} scans recorded</p>
                </div>
              </div>

              <p className="mt-2 break-all rounded bg-black/30 px-2 py-1 font-mono text-[10.5px] text-smoke/80">{qr.url}</p>

              <div className="mt-3 flex flex-wrap items-center gap-1.5">
                <button className="btn-ghost !px-2.5 !py-1.5 text-[11.5px]" onClick={() => setPreview(qr)}>
                  <Eye size={12} /> Preview
                </button>
                <button className="btn-ghost !px-2.5 !py-1.5 text-[11.5px]" onClick={() => download(qr, 'png')}>
                  <Download size={12} /> PNG
                </button>
                <button className="btn-ghost !px-2.5 !py-1.5 text-[11.5px]" onClick={() => download(qr, 'svg')}>
                  <Download size={12} /> SVG
                </button>
                <button className="btn-ghost !px-2.5 !py-1.5 text-[11.5px]" onClick={() => startPrint(qr)}>
                  <Printer size={12} /> Card
                </button>
                <a
                  className="btn-ghost !px-2.5 !py-1.5 text-[11.5px]"
                  href={qr.url}
                  target="_blank"
                  rel="noreferrer"
                >
                  <ExternalLink size={12} /> Test
                </a>
                <button
                  className="btn-quiet !px-2 !py-1.5"
                  onClick={() => {
                    navigator.clipboard?.writeText(qr.url);
                    push('success', 'URL copied');
                  }}
                  aria-label="Copy URL"
                >
                  <Copy size={12} />
                </button>
                <button
                  className="btn-quiet !px-2 !py-1.5"
                  onClick={() => toggleActive(qr)}
                  aria-label={qr.is_active ? 'Deactivate' : 'Activate'}
                >
                  <RefreshCw size={12} />
                </button>
                <button className="btn-quiet !px-2 !py-1.5 hover:!text-red-300" onClick={() => setToDelete(qr)} aria-label="Delete">
                  <Trash2 size={12} />
                </button>
              </div>
            </article>
          ))}
        </div>
      )}

      {/* Create modal */}
      <Modal
        open={creating}
        onClose={() => setCreating(false)}
        title="New QR code"
        footer={
          <div className="flex justify-end gap-2">
            <button className="btn-ghost" onClick={() => setCreating(false)}>
              Cancel
            </button>
            <button className="btn-gold" onClick={create} disabled={saving || !draft.label.trim()}>
              {saving ? <Spinner /> : null} Create
            </button>
          </div>
        }
      >
        <div className="space-y-3">
          <Field label="Label" htmlFor="qr-label" error={errors.label} required hint="Internal name, e.g. Table 07">
            <input
              id="qr-label"
              className="input"
              value={draft.label}
              onChange={(e) => setDraft({ ...draft, label: e.target.value })}
              placeholder="Table 07"
              maxLength={80}
            />
          </Field>
          <Field
            label="Table / seat identifier (optional)"
            htmlFor="qr-table"
            hint="When set, the code opens the menu pre-tagged to this table and orders carry the table number."
          >
            <input
              id="qr-table"
              className="input"
              value={draft.table_identifier}
              onChange={(e) => setDraft({ ...draft, table_identifier: e.target.value })}
              placeholder="Table 07"
              maxLength={40}
            />
          </Field>
          <Field label="Area" htmlFor="qr-area">
            <select
              id="qr-area"
              className="input"
              value={draft.area}
              onChange={(e) => setDraft({ ...draft, area: e.target.value as VenueArea })}
            >
              {Object.entries(VENUE_AREA_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </Field>
          <p className="rounded-lg bg-white/[0.03] px-3 py-2 text-[11.5px] leading-relaxed text-smoke">
            The code will point to <span className="font-mono text-gold-200">{baseUrl}</span>
            {draft.table_identifier ? ` with table “${draft.table_identifier}” attached` : ''}.
          </p>
        </div>
      </Modal>

      <Confirm
        open={!!toDelete}
        title="Delete this QR code?"
        message={`${toDelete?.label ?? ''} will stop working immediately. Any printed card using it will show an error.`}
        confirmLabel="Delete QR code"
        onConfirm={async () => {
          if (!toDelete) return;
          try {
            await api.deleteQr(toDelete.id);
            setCodes((prev) => prev.filter((c) => c.id !== toDelete.id));
            push('success', 'QR code deleted');
          } catch (e) {
            push('error', e instanceof ApiError ? e.message : 'Could not delete the QR code');
          } finally {
            setToDelete(null);
          }
        }}
        onCancel={() => setToDelete(null)}
      />

      {/* Card preview before download / print */}
      <Modal
        open={!!preview}
        onClose={() => setPreview(null)}
        title="Table card preview"
        size="sm"
        footer={
          <div className="flex flex-wrap justify-end gap-2">
            <button
              className="btn-ghost"
              onClick={() => preview && download(preview, 'svg')}
            >
              <Download size={13} /> SVG
            </button>
            <button className="btn-ghost" onClick={() => preview && download(preview, 'png')}>
              <Download size={13} /> PNG
            </button>
            <button
              className="btn-gold"
              onClick={() => {
                const qr = preview;
                setPreview(null);
                if (qr) window.setTimeout(() => startPrint(qr), 120);
              }}
            >
              <Printer size={13} /> Print card
            </button>
          </div>
        }
      >
        {preview && (
          <div className="rounded-xl bg-[#fffdf8] p-5 text-center text-[#14130f] shadow-inner">
            <div className="mb-3 flex items-center justify-center gap-2">
              {business?.logo_url ? (
                <img src={business.logo_url} alt="" className="h-9 w-9 rounded-full object-cover" />
              ) : (
                <BrandMark size={34} />
              )}
              <div className="text-left">
                <p className="font-display text-[15px] leading-tight">{business?.name ?? 'Eclipse'}</p>
                {business?.tagline && (
                  <p className="text-[8px] uppercase tracking-[0.18em] text-[#8a7135]">{business.tagline}</p>
                )}
              </div>
            </div>
            <img
              src={`/api/admin/qr/${preview.id}/image.png?size=700&base=${encodeURIComponent(baseUrl)}`}
              alt={`QR code for ${preview.label}`}
              className="mx-auto h-48 w-48"
            />
            <p className="mt-3 font-display text-lg">Scan to View Our Menu</p>
            {preview.table_identifier && (
              <p className="mt-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-[#8a7135]">
                {preview.table_identifier}
              </p>
            )}
            <p className="mt-2 text-[10px] text-[#57534a]">Point your phone camera at the code · No app needed</p>
            <p className="mt-1 break-all font-mono text-[8.5px] text-[#8a8578]">{preview.url}</p>
          </div>
        )}
        <p className="mt-3 text-[11px] leading-relaxed text-smoke/70">
          Test this code with a real phone camera before printing a full batch. The printed card is A4-friendly and is
          laid out two per row.
        </p>
      </Modal>

      {/* Print-only sheet */}
      <div ref={printRef} className="print-sheet hidden">
        <div className="print-grid">
          {printedCodes.map((qr) => (
            <div key={qr.id} className="print-card">
              <div className="print-brand">
                {business?.logo_url ? (
                  <img src={business.logo_url} alt="" className="print-logo" />
                ) : (
                  <BrandMark size={38} />
                )}
                <div>
                  <p className="print-name">{business?.name ?? 'Eclipse'}</p>
                  {business?.tagline && <p className="print-tagline">{business.tagline}</p>}
                </div>
              </div>
              <img
                className="print-qr"
                src={`/api/admin/qr/${qr.id}/image.png?size=900&base=${encodeURIComponent(baseUrl)}`}
                alt={`QR code for ${qr.label}`}
              />
              <p className="print-cta">Scan to View Our Menu</p>
              {qr.table_identifier && <p className="print-table">{qr.table_identifier}</p>}
              <p className="print-hint">Point your phone camera at the code · No app needed</p>
              <p className="print-url">{qr.url}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
