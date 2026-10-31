export type ResolutionDecision = 'review' | 'refund' | 'settle' | 'reject';

export interface ResolutionDraft {
  decision: ResolutionDecision | '';
  note: string;
  refundMode: 'full' | 'partial';
  amount: string;
}

export const emptyResolution = (): ResolutionDraft => ({ decision: '', note: '', refundMode: 'full', amount: '' });

/** Display only: never convert authoritative API money to floating point. */
export function formatVirtualAmount(value: string | undefined): string {
  const [whole, fraction = '00'] = (value ?? '0.00').split('.');
  return `${whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}.${fraction}`;
}

export function exactMinor(value: string): bigint | null {
  if (!/^\d{1,12}(\.\d{1,2})?$/.test(value)) return null;
  const [whole, fraction = ''] = value.split('.');
  return BigInt(whole) * BigInt(100) + BigInt(fraction.padEnd(2, '0'));
}

/** Guidance only. Express rechecks amounts, authorization and eligibility. */
export function validateResolution(draft: ResolutionDraft, held: string): string | null {
  if (!['review', 'refund', 'settle', 'reject'].includes(draft.decision)) return 'Choose a resolution decision to continue.';
  if (draft.note.trim().length < 10) return 'Add a resolution note of at least 10 characters.';
  if (draft.note.length > 4000) return 'Keep the resolution note within 4,000 characters.';
  if (draft.decision === 'refund') {
    const remaining = exactMinor(held);
    if (remaining === null || remaining <= BigInt(0)) return 'There are no eligible held funds to refund.';
    if (draft.refundMode === 'partial') {
      const requested = exactMinor(draft.amount.trim());
      if (requested === null || requested <= BigInt(0)) return 'Enter a positive refund amount with no more than two decimal places.';
      if (requested > remaining) return 'The refund cannot exceed the allocation’s remaining held funds.';
    }
  }
  return null;
}
