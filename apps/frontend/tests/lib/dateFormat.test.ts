import { describe, it, expect } from 'vitest';
import { formatDate, formatDateShort, compareTimestamps } from '../../src/lib/dateFormat';

describe('formatDate', () => {
  it('formats a Date object', () => {
    const d = new Date('2025-06-15T10:30:00Z');
    const result = formatDate(d);
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/);
    expect(result).toContain('2025');
    expect(result).toContain('06');
    expect(result).toContain('15');
  });

  it('formats an ISO string', () => {
    const result = formatDate('2025-01-01T12:00:00Z');
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/);
  });
});

describe('formatDateShort', () => {
  it('returns month-day time format', () => {
    const d = new Date('2025-06-15T10:30:00Z');
    const result = formatDateShort(d);
    expect(result).toMatch(/^\d{2}-\d{2} \d{2}:\d{2}$/);
  });

  it('formats an ISO string in short format', () => {
    const result = formatDateShort('2025-01-01T12:00:00Z');
    expect(result).toMatch(/^\d{2}-\d{2} \d{2}:\d{2}$/);
  });
});

describe('compareTimestamps', () => {
  it('returns negative when a < b', () => {
    const a = new Date('2025-01-01T00:00:00Z');
    const b = new Date('2025-06-01T00:00:00Z');
    expect(compareTimestamps(a, b)).toBeLessThan(0);
  });

  it('returns positive when a > b', () => {
    const a = new Date('2025-06-01T00:00:00Z');
    const b = new Date('2025-01-01T00:00:00Z');
    expect(compareTimestamps(a, b)).toBeGreaterThan(0);
  });

  it('returns 0 for equal timestamps', () => {
    const a = new Date('2025-06-01T00:00:00Z');
    const b = new Date('2025-06-01T00:00:00Z');
    expect(compareTimestamps(a, b)).toBe(0);
  });

  it('accepts string timestamps', () => {
    expect(compareTimestamps('2025-01-01T00:00:00Z', '2025-06-01T00:00:00Z')).toBeLessThan(0);
    expect(compareTimestamps('2025-06-01T00:00:00Z', '2025-01-01T00:00:00Z')).toBeGreaterThan(0);
  });
});
