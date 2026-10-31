'use client';

import { useCallback, useState } from 'react';
import { adminRequest, useAsyncData } from '../../hooks/useAdminData';
import { ErrorPanel } from '../../components/AppShell';
import ConfirmDialog from '../../components/ConfirmDialog';
import DataTable, { type Column } from '../../components/DataTable';
import EmptyState from '../../components/EmptyState';
import Icon, { type IconName } from '../../components/Icon';
import StatusBadge from '../../components/StatusBadge';
import { formatDateTime, initials, titleCase, type BadgeTone } from '../../lib/format';
import { emptyResolution, exactMinor, formatVirtualAmount as money, validateResolution, type ResolutionDecision, type ResolutionDraft } from './disputeResolution';
import styles from './disputes.module.css';

interface Dispute {
  dispute_id: string; reason: string; description: string; status: string;
  evidence: string[]; resolution_note: string | null; resolved_by: string | null;
  created_at?: string; resolved_at?: string | null; decision?: string | null;
}
interface LedgerEvent { event_id: string; event_type: string; amount: string; created_at: string }
interface Allocation {
  allocation_id: string; farmer_id: string; farmer_name: string; listing_id: string;
  quantity: string; unit: string; unit_price: string; amount: string;
  delivery_status: string; settlement_status: string; dispute_status: string;
  balances: Record<string, string>; disputes: Dispute[];
  traceability: Record<string, string | null>;
  delivery_verifications: { verification_id: string; consumed_at: string | null; expires_at: string; verified_by: string | null; revoked_at?: string | null }[];
  ledger: LedgerEvent[];
}
interface Detail {
  transaction_id: string; buyer_id: string; checkout_status: string; payment_status: string;
  checkout_expires_at: string; reconciliation_reason: string | null;
  allocations: Allocation[]; balances: Record<string, string>;
  history: { audit_id: string; actor_id: string | null; action: string; created_at: string; metadata: object }[];
}
interface Confirmation { dispute: Dispute; allocation: Allocation; draft: ResolutionDraft }

const decisions: { value: ResolutionDecision; label: string; description: string; icon: IconName }[] = [
  { value: 'review', label: 'Mark under review', description: 'Continue the investigation. All funds remain held.', icon: 'search' },
  { value: 'refund', label: 'Refund buyer', description: 'Return eligible held funds to the buyer’s demo wallet.', icon: 'arrow-down-right' },
  { value: 'settle', label: 'Settle to farmer', description: 'Release remaining held funds after verified delivery.', icon: 'check-circle' },
  { value: 'reject', label: 'Reject claim', description: 'Close the claim without moving any held funds.', icon: 'shield-check' },
];
const active = (d: Dispute) => ['open', 'under_review'].includes(d.status);
const decisionLabel = (value: string) => decisions.find(d => d.value === value)?.label ?? titleCase(value);
const tone = (status: string): BadgeTone => {
  if (['open', 'disputed', 'failed'].includes(status)) return 'danger';
  if (['under_review', 'pending', 'held', 'unfunded'].includes(status)) return 'warning';
  if (['resolved', 'settled', 'delivered', 'completed', 'simulated_paid'].includes(status)) return 'success';
  return 'neutral';
};

function Balance({ label, value, icon, accent = false }: { label: string; value?: string; icon: IconName; accent?: boolean }) {
  return <div className={`${styles.balance} ${accent ? styles.balanceAccent : ''}`}><span className={styles.balanceIcon}><Icon name={icon} size={17} /></span><span className={styles.balanceLabel}>{label}</span><strong><small>ETB</small> {money(value)}</strong></div>;
}

export default function SimulationDetails({ id, onClose, onChanged }: { id: string; onClose: () => void; onChanged: () => void }) {
  const { data, error, loading, reload } = useAsyncData<Detail>(() => adminRequest(`/api/admin/transactions/${id}`), [id]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, ResolutionDraft>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null);
  const [busy, setBusy] = useState(false);
  const [success, setSuccess] = useState('');
  const blocked = busy || loading || !!error;
  const selected = data?.allocations.find(a => a.allocation_id === selectedId) ?? data?.allocations.find(a => a.disputes.some(active)) ?? data?.allocations[0];
  const unresolved = data?.allocations.reduce((count, a) => count + a.disputes.filter(active).length, 0) ?? 0;
  const financialState = data?.payment_status === 'simulated_paid' && ['fulfilling', 'partially_completed'].includes(data.checkout_status);
  const cancelConfirmation = useCallback(() => { if (!busy) setConfirmation(null); }, [busy]);

  function updateDraft(disputeId: string, update: Partial<ResolutionDraft>) {
    setDrafts(previous => ({ ...previous, [disputeId]: { ...(previous[disputeId] ?? emptyResolution()), ...update } }));
    setErrors(previous => ({ ...previous, [disputeId]: '' }));
  }

  function reviewDecision(dispute: Dispute, allocation: Allocation) {
    const draft = drafts[dispute.dispute_id] ?? emptyResolution();
    const validation = validateResolution(draft, allocation.balances.held);
    if (validation) { setErrors(previous => ({ ...previous, [dispute.dispute_id]: validation })); return; }
    setConfirmation({ dispute, allocation, draft: { ...draft, note: draft.note.trim(), amount: draft.amount.trim() } });
  }

  async function resolve() {
    if (!confirmation || busy) return;
    const { dispute, draft } = confirmation;
    setBusy(true); setSuccess('');
    setErrors(previous => ({ ...previous, [dispute.dispute_id]: '' }));
    try {
      await adminRequest(`/api/admin/disputes/${dispute.dispute_id}/resolve`, {
        method: 'POST', data: { decision: draft.decision, note: draft.note, ...(draft.decision === 'refund' && draft.refundMode === 'partial' ? { amount: draft.amount } : {}) },
      });
      setDrafts(previous => { const next = { ...previous }; delete next[dispute.dispute_id]; return next; });
      setSuccess(`${decisionLabel(draft.decision)} recorded for case ${dispute.dispute_id.slice(0, 8)}. The decision is saved in the audit trail. No real money moved.`);
      setConfirmation(null);
      await reload(); onChanged();
    } catch (e: unknown) {
      const failure = e as { response?: { data?: { error?: string } }; message?: string };
      setErrors(previous => ({ ...previous, [dispute.dispute_id]: failure.response?.data?.error || failure.message || 'The decision could not be recorded. Refresh the case before retrying.' }));
      setConfirmation(null);
    } finally { setBusy(false); }
  }

  const ledgerColumns: Column<LedgerEvent>[] = [
    { key: 'event_type', header: 'Movement', render: e => <span className={styles.ledgerType}><Icon name={e.event_type === 'hold' ? 'lock' : e.event_type === 'refund' ? 'arrow-down-right' : 'check-circle'} size={15} />{titleCase(e.event_type)}</span> },
    { key: 'amount', header: 'Virtual ETB', align: 'right', render: e => <strong className={styles.numeric}>{money(e.amount)}</strong> },
    { key: 'created_at', header: 'Recorded', render: e => formatDateTime(e.created_at) },
    { key: 'event_id', header: 'Event reference', render: e => <code className={styles.reference}>{e.event_id}</code> },
  ];
  const confirmationAmount = confirmation?.draft.decision === 'refund'
    ? confirmation.draft.refundMode === 'partial' ? confirmation.draft.amount : confirmation.allocation.balances.held
    : confirmation?.allocation.balances.held;
  const confirmationMessage = confirmation ? `${decisionLabel(confirmation.draft.decision)} for ${confirmation.allocation.farmer_name}’s allocation (case ${confirmation.dispute.dispute_id.slice(0, 8)})? ${confirmation.draft.decision === 'refund' ? `Refund ${confirmation.draft.refundMode === 'partial' ? 'ETB ' + money(confirmationAmount) : 'the full remaining held amount (currently ETB ' + money(confirmationAmount) + ')'} to the buyer’s demo wallet. ` : confirmation.draft.decision === 'settle' ? `Settle the remaining held amount (currently ETB ${money(confirmationAmount)}) to the farmer’s demo wallet. ` : 'No funds will move. ' }The backend rechecks eligibility and the final amount. Your note and decision will be audited. This is simulation only; no real payment, refund or payout occurs.` : '';

  return <section className={styles.workspace} aria-labelledby="investigation-title">
    <div className={styles.header}><div className={styles.headerIdentity}><span className={styles.headerIcon}><Icon name="shield-check" size={24} /></span><div><p className={styles.eyebrow}>Case workspace · Simulation only</p><h2 id="investigation-title">Dispute resolution & investigation</h2><code className={styles.headerReference}>{id}</code></div></div><div className={styles.headerActions}><button className="btn btn--secondary btn--sm" disabled={busy || loading} onClick={reload} aria-label="Refresh investigation"><Icon name="refresh" size={15} /> Refresh</button><button className="btn btn--ghost btn--sm" disabled={busy} onClick={onClose}><Icon name="x" size={16} /> Close</button></div></div>
    <div className={styles.demoNotice}><Icon name="info" size={17} /><p><strong>Virtual funds. Real audit trail.</strong> All amounts are simulated ETB. Decisions affect demo wallets and escrow only—never real money.</p></div>
    {error && <ErrorPanel message={error} onRetry={reload} />}
    {success && <div className={styles.success} role="status"><Icon name="check-circle" size={18} /><span>{success}</span></div>}
    {!data && loading && <div className={styles.loading} role="status"><span className="skeleton skeleton--title" /><span className="skeleton skeleton--text" /><div className={styles.balanceGrid}>{[0, 1, 2, 3].map(n => <div className={styles.loadingCard} key={n}><span className="skeleton skeleton--text" /><span className="skeleton skeleton--title" /></div>)}</div><span className="u-visually-hidden">Loading transaction investigation</span></div>}

    {data && <>
      <div className={styles.orderSummary}><div className={styles.summaryTitle}><h3>Order escrow overview</h3><div className={styles.badges}><StatusBadge status={data.payment_status} tone={tone(data.payment_status)} /><StatusBadge status={data.checkout_status} tone={tone(data.checkout_status)} />{unresolved > 0 && <StatusBadge status={`${unresolved} active ${unresolved === 1 ? 'dispute' : 'disputes'}`} tone="danger" />}</div></div><div className={styles.balanceGrid}><Balance label="Originally funded" value={data.balances.paid} icon="wallet" /><Balance label="Currently held" value={data.balances.held} icon="lock" accent /><Balance label="Settled to farmers" value={data.balances.settled} icon="check-circle" /><Balance label="Refunded to buyer" value={data.balances.refunded} icon="arrow-down-right" /></div>
        <details className={styles.references}><summary><Icon name="hash" size={14} /> Order references & checkout details <Icon name="chevron-down" size={14} /></summary><dl><div><dt>Transaction reference</dt><dd><code>{data.transaction_id}</code></dd></div><div><dt>Buyer account</dt><dd><code>{data.buyer_id}</code></dd></div><div><dt>Checkout deadline</dt><dd>{formatDateTime(data.checkout_expires_at)}</dd></div><div><dt>Farmer allocations</dt><dd>{data.allocations.length} allocations · each resolved independently</dd></div></dl></details>
        {data.reconciliation_reason && <div className={styles.warning} role="note"><Icon name="alert-triangle" size={17} /><span>{data.reconciliation_reason}</span></div>}
      </div>

      {data.allocations.length === 0 ? <EmptyState icon="layers" title="No allocation records" message="This transaction has no allocation-level records to investigate. No financial decision is available here." /> : <div className={styles.caseLayout}>
        <aside className={styles.allocationNav} aria-label="Farmer allocations"><div className={styles.navHeading}><span>Farmer allocations</span><span>{data.allocations.length}</span></div><p>Select a contribution to review its delivery, claim and held funds.</p>{data.allocations.map(a => <button type="button" className={`${styles.allocationButton} ${selected?.allocation_id === a.allocation_id ? styles.allocationSelected : ''}`} key={a.allocation_id} aria-pressed={selected?.allocation_id === a.allocation_id} onClick={() => setSelectedId(a.allocation_id)} disabled={busy}><span className={styles.navOwner}><span className={styles.avatar}>{initials(a.farmer_name)}</span><span><strong>{a.farmer_name}</strong><small>{a.traceability.crop_type || 'Produce allocation'}</small></span><Icon name="chevron-right" size={15} /></span><span className={styles.navAmount}>ETB {money(a.amount)}</span><span className={styles.navFooter}><span>{a.quantity} {a.unit}</span><StatusBadge status={a.dispute_status === 'none' ? a.settlement_status : a.dispute_status} tone={tone(a.dispute_status === 'none' ? a.settlement_status : a.dispute_status)} /></span></button>)}</aside>

        {selected && <div className={styles.caseContent}>
          <article className={styles.allocationOverview}><div className={styles.sectionHeader}><div><p className={styles.eyebrow}>Selected farmer contribution</p><h3>{selected.traceability.crop_type || 'Produce'} <span>· {selected.farmer_name}</span></h3><p>{selected.quantity} {selected.unit} × ETB {money(selected.unit_price)} per unit</p></div><div className={styles.badges}><StatusBadge status={selected.delivery_status} tone={tone(selected.delivery_status)} /><StatusBadge status={selected.settlement_status} tone={tone(selected.settlement_status)} /></div></div><div className={styles.allocationBalances}><div><span>Allocated amount</span><strong>ETB {money(selected.amount)}</strong></div><div><span>Remaining held</span><strong>ETB {money(selected.balances.held)}</strong></div><div><span>Settled</span><strong>ETB {money(selected.balances.settled)}</strong></div><div><span>Refunded</span><strong>ETB {money(selected.balances.refunded)}</strong></div></div>
            <details className={styles.references}><summary><Icon name="package" size={14} /> Traceability & delivery verification <Icon name="chevron-down" size={14} /></summary><dl><div><dt>Allocation reference</dt><dd><code>{selected.allocation_id}</code></dd></div><div><dt>Listing reference</dt><dd><code>{selected.listing_id}</code></dd></div><div><dt>Farmer account</dt><dd><code>{selected.farmer_id}</code></dd></div><div><dt>Origin / quality</dt><dd>{selected.traceability.origin || 'Not provided'} · {selected.traceability.quality_grade || 'Not provided'} <small>(farmer-reported)</small></dd></div></dl>{selected.delivery_verifications.length === 0 ? <p className={styles.muted}>No delivery verification has been issued.</p> : <ul className={styles.verifications}>{selected.delivery_verifications.map(v => <li key={v.verification_id}><Icon name={v.consumed_at ? 'check-circle' : 'clock'} size={15} /><div><strong>{v.consumed_at ? 'Delivery verified' : v.revoked_at ? 'QR revoked' : 'QR not consumed'}</strong><span>{v.consumed_at ? formatDateTime(v.consumed_at) : `Expires ${formatDateTime(v.expires_at)}`}</span>{v.verified_by && <code>Verified by {v.verified_by}</code>}</div></li>)}</ul>}</details>
          </article>

          <div className={styles.caseHeading}><div><h3>Dispute cases</h3><p>Evidence, resolution decisions and outcomes for this allocation.</p></div><span>{selected.disputes.length} {selected.disputes.length === 1 ? 'case' : 'cases'}</span></div>
          {selected.disputes.length === 0 && <div className={styles.caseCard}><EmptyState icon="shield-check" title="No dispute on this allocation" message="This farmer contribution has no claim to resolve. Review its delivery and escrow records below." /></div>}
          {selected.disputes.map(d => {
            const draft = drafts[d.dispute_id] ?? emptyResolution();
            const held = exactMinor(selected.balances.held) ?? BigInt(0);
            const refundable = selected.settlement_status === 'held' && held > BigInt(0) && (exactMinor(selected.balances.settled) ?? BigInt(0)) === BigInt(0);
            const settlementReady = selected.delivery_status === 'delivered' && selected.settlement_status === 'held' && held > BigInt(0);
            const canAct = active(d) && financialState;
            const noteId = `resolution-note-${d.dispute_id}`;
            const errorId = `resolution-error-${d.dispute_id}`;
            return <article className={styles.caseCard} key={d.dispute_id} aria-labelledby={`case-title-${d.dispute_id}`}>
              <div className={styles.claimHeader}><span className={`${styles.claimIcon} ${!active(d) ? styles.claimClosed : ''}`}><Icon name={active(d) ? 'alert-triangle' : 'shield-check'} size={21} /></span><div><span className={styles.caseReference}>CASE {d.dispute_id.slice(0, 8)}</span><h4 id={`case-title-${d.dispute_id}`}>{titleCase(d.reason)}</h4>{d.created_at && <span className={styles.muted}>Opened {formatDateTime(d.created_at)}</span>}</div><StatusBadge status={d.status} tone={tone(d.status)} size="md" /></div>
              <div className={styles.claimBody}><span className={styles.fieldLabel}>Buyer’s reported issue</span><p>{d.description}</p><details className={styles.caseReferenceDetails}><summary>Full case reference</summary><code>{d.dispute_id}</code></details><div className={styles.evidenceHeading}><Icon name="external-link" size={14} /><span>Supporting evidence</span></div>{d.evidence.filter(url => /^https:\/\//.test(url)).length > 0 ? <div className={styles.evidenceList}>{d.evidence.filter(url => /^https:\/\//.test(url)).map((url, i) => <a key={`${url}-${i}`} href={url} target="_blank" rel="noopener noreferrer" className={styles.evidenceLink}><Icon name="external-link" size={16} /><span>Evidence {i + 1}<small>External reference · opens in a new tab</small></span><Icon name="arrow-up-right" size={15} /></a>)}</div> : <p className={styles.noEvidence}>No evidence links were attached to this claim.</p>}</div>

              {d.resolution_note && <div className={styles.resolutionRecord}><Icon name="check-circle" size={18} /><div><strong>{d.decision ? decisionLabel(d.decision) : 'Resolution note'}</strong><p>{d.resolution_note}</p>{d.resolved_at && <span>{formatDateTime(d.resolved_at)}</span>}{d.resolved_by && <code>Recorded by admin {d.resolved_by}</code>}</div></div>}
              {active(d) && !financialState && <div className={styles.warning}><Icon name="lock" size={17} /><span>This order is not in an eligible funded state. Refresh and investigate its checkout status before recording a decision.</span></div>}
              {canAct && <form className={styles.resolutionForm} onSubmit={event => { event.preventDefault(); reviewDecision(d, selected); }}>
                <div className={styles.formHeading}><span className={styles.stepNumber}>1</span><div><h5>Choose a resolution</h5><p>Only this farmer’s allocation is affected.</p></div></div>
                <fieldset className={styles.decisionFieldset} disabled={blocked}><legend className="u-visually-hidden">Resolution decision for case {d.dispute_id}</legend><div className={styles.decisions}>{decisions.map(option => {
                  const unavailable = (option.value === 'settle' && !settlementReady) || (option.value === 'refund' && !refundable);
                  return <label key={option.value} className={`${styles.decision} ${draft.decision === option.value ? styles.decisionSelected : ''} ${unavailable ? styles.decisionDisabled : ''}`}><input type="radio" name={`decision-${d.dispute_id}`} value={option.value} checked={draft.decision === option.value} disabled={unavailable} onChange={() => updateDraft(d.dispute_id, { decision: option.value })} /><span className={styles.decisionIcon}><Icon name={option.icon} size={18} /></span><span><strong>{option.label}</strong><small>{unavailable ? option.value === 'settle' ? 'Verified delivery and remaining held funds are required.' : 'No eligible unsettled funds remain to refund.' : option.description}</small></span></label>;
                })}</div></fieldset>

                {draft.decision === 'refund' && <div className={styles.refundPanel}><div className={styles.refundHeading}><Icon name="wallet" size={18} /><div><strong>Refund destination: buyer demo wallet</strong><span>Maximum eligible refund: ETB {money(selected.balances.held)}</span></div></div><fieldset disabled={blocked} className={styles.refundModes}><legend className="u-visually-hidden">Refund amount</legend><label><input type="radio" name={`refund-mode-${d.dispute_id}`} checked={draft.refundMode === 'full'} onChange={() => updateDraft(d.dispute_id, { refundMode: 'full' })} /> Full remaining amount</label><label><input type="radio" name={`refund-mode-${d.dispute_id}`} checked={draft.refundMode === 'partial'} onChange={() => updateDraft(d.dispute_id, { refundMode: 'partial' })} /> Partial refund</label></fieldset>{draft.refundMode === 'partial' && <div className={styles.amountField}><label htmlFor={`refund-amount-${d.dispute_id}`}>Refund amount <span>Virtual ETB</span></label><input className="input" id={`refund-amount-${d.dispute_id}`} inputMode="decimal" placeholder="e.g. 2000.00" autoComplete="off" value={draft.amount} disabled={blocked} onChange={event => updateDraft(d.dispute_id, { amount: event.target.value })} aria-describedby={`refund-help-${d.dispute_id}`} /><small id={`refund-help-${d.dispute_id}`}>Use exact cents, without commas. A partial refund leaves the remaining funds held.</small></div>}</div>}
                {draft.decision === 'settle' && <div className={styles.settlementNote}><Icon name="check-circle" size={17} /><span>Remaining held funds (currently <strong>ETB {money(selected.balances.held)}</strong>) will be released to <strong>{selected.farmer_name}</strong>’s demo wallet after backend verification.</span></div>}

                <div className={styles.formHeading}><span className={styles.stepNumber}>2</span><div><h5>Document your decision</h5><p>This note becomes part of the immutable transaction audit.</p></div></div><label className={styles.noteLabel} htmlFor={noteId}>Resolution note <span>Required</span></label><textarea className="input" id={noteId} value={draft.note} maxLength={4000} rows={4} placeholder="Summarize the evidence reviewed, your findings, and why this outcome is appropriate…" disabled={blocked} onChange={event => updateDraft(d.dispute_id, { note: event.target.value })} aria-invalid={!!errors[d.dispute_id]} aria-describedby={`${noteId}-help${errors[d.dispute_id] ? ` ${errorId}` : ''}`} /><div className={styles.noteHelp} id={`${noteId}-help`}><span>At least 10 characters. Do not include passwords or payment credentials.</span><span>{draft.note.length.toLocaleString()} / 4,000</span></div>
                {errors[d.dispute_id] && <div className={styles.formError} id={errorId} role="alert"><Icon name="alert-circle" size={16} /><span>{errors[d.dispute_id]}</span></div>}
                <div className={styles.formFooter}><span><Icon name="lock" size={14} /> Backend-validated · auditable · simulation only</span><button type="submit" className="btn btn--primary" disabled={blocked || !draft.decision}><Icon name="shield-check" size={16} /> Review decision <Icon name="arrow-up-right" size={15} /></button></div>
              </form>}
            </article>;
          })}

          <details className={styles.ledger}><summary><span><Icon name="database" size={17} /> Immutable simulated escrow ledger</span><span>{selected.ledger.length} events <Icon name="chevron-down" size={14} /></span></summary><DataTable columns={ledgerColumns} data={selected.ledger} keyExtractor={e => e.event_id} emptyTitle="No escrow movements" emptyMessage="Unpaid checkouts do not hold simulated funds." emptyIcon="database" caption="Immutable escrow ledger for the selected farmer allocation" /></details>
        </div>}
      </div>}

      <details className={styles.audit}><summary><span><Icon name="clock" size={18} /> Transaction audit trail</span><span>{data.history.length} recorded actions <Icon name="chevron-down" size={14} /></span></summary>{data.history.length === 0 ? <EmptyState icon="clock" title="No audit events yet" /> : <ol className={styles.timeline}>{data.history.map(e => <li key={e.audit_id}><span className={styles.timelineDot} /><div><div className={styles.auditEventHeader}><strong>{titleCase(e.action)}</strong><time>{formatDateTime(e.created_at)}</time></div><p>Recorded by <code>{e.actor_id || 'system'}</code></p><details><summary>View audit metadata</summary><pre>{JSON.stringify(e.metadata, null, 2)}</pre><code className={styles.reference}>Audit reference: {e.audit_id}</code></details></div></li>)}</ol>}</details>
    </>}
    <ConfirmDialog open={confirmation !== null} title={confirmation ? `Confirm: ${decisionLabel(confirmation.draft.decision).toLowerCase()}` : 'Confirm resolution'} message={confirmationMessage} confirmLabel="Record demo decision" cancelLabel="Back to case" variant={confirmation?.draft.decision === 'refund' || confirmation?.draft.decision === 'reject' ? 'danger' : 'default'} busy={busy} onCancel={cancelConfirmation} onConfirm={resolve} />
  </section>;
}
