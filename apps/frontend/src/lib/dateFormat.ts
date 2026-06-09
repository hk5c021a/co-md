import { Temporal } from './temporal';

export function formatDate(dateOrStr: Date | string): string {
  const d =
    typeof dateOrStr === 'string'
      ? Temporal.Instant.from(dateOrStr).toZonedDateTimeISO(Temporal.Now.timeZoneId())
      : Temporal.Instant.fromEpochMilliseconds(dateOrStr.getTime()).toZonedDateTimeISO(
          Temporal.Now.timeZoneId()
        );

  const y = d.year;
  const mo = String(d.month).padStart(2, '0');
  const day = String(d.day).padStart(2, '0');
  const h = String(d.hour).padStart(2, '0');
  const mi = String(d.minute).padStart(2, '0');
  return `${y}-${mo}-${day} ${h}:${mi}`;
}

export function formatDateShort(dateOrStr: Date | string): string {
  const d =
    typeof dateOrStr === 'string'
      ? Temporal.Instant.from(dateOrStr).toZonedDateTimeISO(Temporal.Now.timeZoneId())
      : Temporal.Instant.fromEpochMilliseconds(dateOrStr.getTime()).toZonedDateTimeISO(
          Temporal.Now.timeZoneId()
        );

  const mo = String(d.month).padStart(2, '0');
  const day = String(d.day).padStart(2, '0');
  const h = String(d.hour).padStart(2, '0');
  const mi = String(d.minute).padStart(2, '0');
  // Use locale-neutral ISO ordering to avoid US-centric MM-DD ambiguity
  return `${mo}-${day} ${h}:${mi}`;
}

export function compareTimestamps(a: Date | string, b: Date | string): number {
  const ia =
    typeof a === 'string'
      ? Temporal.Instant.from(a)
      : Temporal.Instant.fromEpochMilliseconds(a.getTime());
  const ib =
    typeof b === 'string'
      ? Temporal.Instant.from(b)
      : Temporal.Instant.fromEpochMilliseconds(b.getTime());
  return Temporal.Instant.compare(ia, ib);
}
