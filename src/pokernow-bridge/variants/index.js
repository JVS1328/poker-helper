// Variant registry. Phase 1 ships NLHE; Phase 5 adds concrete PLO etc.
// Keys match the normalized variant ID the DOM reader emits.

import nlhe from './nlhe';
import { makeStub } from './not-yet-supported';

export const VARIANTS = {
  nlhe,
  plo:         makeStub('plo',         'PLO',          4, false),
  'plo-hi-lo': makeStub('plo-hi-lo',   'PLO Hi/Lo',    4, true),
  plo5:        makeStub('plo5',        'PLO5',         5, false),
  'plo5-hi-lo':makeStub('plo5-hi-lo',  'PLO5 Hi/Lo',   5, true),
};

export const DEFAULT_VARIANT_ID = 'nlhe';

export const getVariant = (id) => VARIANTS[id] || null;
