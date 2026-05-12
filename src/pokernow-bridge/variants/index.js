// Variant registry. All variants are implemented (Phase 5 done).
// Keys match the normalized variant ID the DOM reader emits.

import nlhe from './nlhe';
import plo from './plo';
import plo5 from './plo5';
import ploHiLo from './plo-hi-lo';
import plo5HiLo from './plo5-hi-lo';

export const VARIANTS = {
  nlhe,
  plo,
  'plo-hi-lo': ploHiLo,
  plo5,
  'plo5-hi-lo': plo5HiLo,
};

export const DEFAULT_VARIANT_ID = 'nlhe';

export const getVariant = (id) => VARIANTS[id] || null;
