/**
 * Timezone-aware promotion scheduling.
 * Single source of truth — imported by the API (to compute live prices)
 * and by the client (to render the happy-hour strip and countdowns).
 */
import { discountPrice } from './money.js';
import type { Promotion } from './types.js';

export interface VenueClock {
  /** 0 = Sunday ... 6 = Saturday, in the venue timezone */
  weekday: number;
  /** minutes since local midnight */
  minutes: number;
  /** yyyy-mm-dd in the venue timezone */
  date: string;
  /** "HH:MM" in the venue timezone */
  time: string;
}

const DEFAULT_TZ = 'Africa/Lagos';

export function getVenueClock(timeZone: string = DEFAULT_TZ, at: Date = new Date()): VenueClock {
  let parts: Intl.DateTimeFormatPart[];
  try {
    parts = new Intl.DateTimeFormat('en-GB', {
      timeZone,
      hour12: false,
      weekday: 'short',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    }).formatToParts(at);
  } catch {
    parts = new Intl.DateTimeFormat('en-GB', {
      timeZone: DEFAULT_TZ,
      hour12: false,
      weekday: 'short',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    }).formatToParts(at);
  }
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
  const weekdayMap: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  const hour = Number(get('hour')) % 24;
  const minute = Number(get('minute'));
  return {
    weekday: weekdayMap[get('weekday')] ?? 0,
    minutes: hour * 60 + minute,
    date: `${get('year')}-${get('month')}-${get('day')}`,
    time: `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`,
  };
}

export function timeToMinutes(value: string | null | undefined): number | null {
  if (!value) return null;
  const m = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
}

function isoDateInZone(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

/** A promotion is active when: enabled + inside its date range + matching weekday + inside its time window. */
export function isPromotionActive(
  promo: Promotion,
  clock: VenueClock,
  now: Date = new Date(),
  timeZone: string = DEFAULT_TZ,
): boolean {
  if (!promo.is_active) return false;

  // Absolute date range (in venue timezone)
  if (promo.start_at) {
    const startDate = /^\d{4}-\d{2}-\d{2}/.test(promo.start_at) && promo.start_at.length <= 10
      ? promo.start_at.slice(0, 10)
      : isoDateInZone(new Date(promo.start_at), timeZone);
    if (clock.date < startDate) return false;
  }
  if (promo.end_at) {
    const endDate = /^\d{4}-\d{2}-\d{2}/.test(promo.end_at) && promo.end_at.length <= 10
      ? promo.end_at.slice(0, 10)
      : isoDateInZone(new Date(promo.end_at), timeZone);
    if (clock.date > endDate) return false;
  }

  const start = timeToMinutes(promo.start_time);
  const end = timeToMinutes(promo.end_time);

  if (start === null && end === null) {
    // All-day promotion, only weekday restrictions apply
    return promo.days_of_week.length === 0 || promo.days_of_week.includes(clock.weekday);
  }

  const startMin = start ?? 0;
  const endMin = end ?? 24 * 60 - 1;
  const wrapsMidnight = endMin <= startMin;
  const days = promo.days_of_week;

  const dayMatches = (weekday: number) => days.length === 0 || days.includes(weekday);

  if (!wrapsMidnight) {
    return dayMatches(clock.weekday) && clock.minutes >= startMin && clock.minutes <= endMin;
  }

  // Window crosses midnight: e.g. 20:00 -> 02:00
  if (clock.minutes >= startMin && dayMatches(clock.weekday)) return true;
  if (clock.minutes <= endMin && dayMatches((clock.weekday + 6) % 7)) return true;
  return false;
}

export interface PriceInput {
  price: number;
  promotional_price: number | null;
}

export interface ResolvedPricing {
  effective_price: number;
  active_promotion: string | null;
}

/**
 * Resolve the live selling price for an item.
 * Order of precedence: best active promotion (biggest discount) > item promotional price > list price.
 */
export function resolvePricing(
  item: PriceInput,
  promotions: Promotion[],
  clock: VenueClock,
  now: Date = new Date(),
  timeZone: string = DEFAULT_TZ,
): ResolvedPricing {
  let best = item.price;
  let label: string | null = null;

  if (item.promotional_price !== null && item.promotional_price > 0 && item.promotional_price < best) {
    best = item.promotional_price;
    label = 'Special price';
  }

  for (const promo of promotions) {
    if (promo.discount_percent === null || promo.discount_percent <= 0) continue;
    if (!isPromotionActive(promo, clock, now, timeZone)) continue;
    const candidate = discountPrice(item.price, promo.discount_percent);
    if (candidate < best) {
      best = candidate;
      label = promo.name;
    }
  }

  return { effective_price: best, active_promotion: label };
}

/** Human summary of a promotion schedule, e.g. "Fri, Sat · 8:00 PM – 11:00 PM" */
export function describeSchedule(promo: Promotion, dayNames: string[]): string {
  const days =
    promo.days_of_week.length === 0 || promo.days_of_week.length === 7
      ? 'Every day'
      : promo.days_of_week
          .slice()
          .sort((a, b) => a - b)
          .map((d) => dayNames[d]?.slice(0, 3) ?? '')
          .join(', ');
  const time =
    promo.start_time && promo.end_time ? ` · ${prettyTime(promo.start_time)} – ${prettyTime(promo.end_time)}` : ' · All day';
  return `${days}${time}`;
}

export function prettyTime(hhmm: string): string {
  const mins = timeToMinutes(hhmm);
  if (mins === null) return hhmm;
  const h24 = Math.floor(mins / 60);
  const m = mins % 60;
  const suffix = h24 >= 12 ? 'PM' : 'AM';
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${h12}:${String(m).padStart(2, '0')} ${suffix}`;
}
