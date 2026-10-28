import type { DatePrecision, LaunchStatus } from '../data/types.ts';

const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTHS_LONG = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

export function esc(value: string | number | null | undefined): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Only http(s) links reach the page. */
export function safeUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const u = new URL(url);
    return u.protocol === 'https:' || u.protocol === 'http:' ? u.href : null;
  } catch {
    return null;
  }
}

/** "28 Sep 2026", in UTC so every visitor sees the same launch date. */
export function fmtDate(iso: string): string {
  const d = new Date(iso);
  return `${d.getUTCDate()} ${MONTHS_SHORT[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

export function fmtMonthYear(iso: string): string {
  const d = new Date(iso);
  return `${MONTHS_LONG[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

export function hasPreciseTime(precision: DatePrecision): boolean {
  return precision === 'second' || precision === 'minute' || precision === 'hour';
}

export function hasPreciseDay(precision: DatePrecision): boolean {
  return hasPreciseTime(precision) || precision === 'day' || precision === 'morning' || precision === 'afternoon';
}

/** Launch date as precise as Launch Library knows it. */
export function netText(iso: string, precision: DatePrecision): string {
  const d = new Date(iso);
  const year = d.getUTCFullYear();
  switch (precision) {
    case 'second':
    case 'minute':
    case 'hour': {
      const hh = String(d.getUTCHours()).padStart(2, '0');
      const mm = String(d.getUTCMinutes()).padStart(2, '0');
      return `${fmtDate(iso)}, ${hh}:${mm} UTC`;
    }
    case 'morning':
    case 'afternoon':
    case 'day':
      return fmtDate(iso);
    case 'week':
      return `Week of ${fmtDate(iso)}`;
    case 'month':
      return fmtMonthYear(iso);
    case 'quarter':
      return `Q${Math.floor(d.getUTCMonth() / 3) + 1} ${year}`;
    case 'half':
      return `${d.getUTCMonth() < 6 ? 'First' : 'Second'} half of ${year}`;
    case 'year':
      return String(year);
    default:
      return fmtDate(iso);
  }
}

/** The viewer's local time for a precise launch time. */
export function localTimeText(iso: string): string {
  return new Intl.DateTimeFormat(undefined, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    timeZoneName: 'short',
  }).format(new Date(iso));
}

export function relTime(iso: string, now = Date.now()): string {
  const diff = now - Date.parse(iso);
  const future = diff < 0;
  const s = Math.abs(diff) / 1000;
  let text: string;
  if (s < 60) text = 'just now';
  else if (s < 3600) text = `${Math.round(s / 60)} min`;
  else if (s < 86400) text = `${Math.round(s / 3600)} h`;
  else if (s < 86400 * 45) text = `${Math.round(s / 86400)} days`;
  else if (s < 86400 * 365) text = `${Math.round(s / (86400 * 30.4))} months`;
  else text = `${(s / (86400 * 365.25)).toFixed(1)} years`;
  if (text === 'just now') return text;
  return future ? `in ${text}` : `${text} ago`;
}

export const STATUS_LABEL: Record<LaunchStatus, string> = {
  go: 'Go for launch',
  tbc: 'Date to be confirmed',
  tbd: 'Date not set',
  hold: 'On hold',
  inflight: 'In flight',
  success: 'Success',
  partial: 'Partial failure',
  failure: 'Failure',
};

export function statusChipClass(status: LaunchStatus): string {
  if (status === 'go') return 'chip chip--go';
  if (status === 'inflight') return 'chip chip--live';
  return 'chip chip--planned';
}

export function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}
