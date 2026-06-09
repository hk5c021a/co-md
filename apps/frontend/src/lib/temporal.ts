import { Temporal as _Temporal } from '@js-temporal/polyfill';

const _impl: typeof _Temporal = globalThis.Temporal ?? _Temporal;

/** Runtime value — polyfill with global fallback */
export const Temporal = _impl;

/** Type namespace merged with the const — enables `Temporal.Instant` in type position */
export namespace Temporal {
  export type Instant = _Temporal.Instant;
}
