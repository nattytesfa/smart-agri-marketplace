'use client';

import { useEffect, useRef } from 'react';
import Icon from './Icon';

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: 'danger' | 'default';
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export default function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  variant = 'default',
  busy = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const confirmRef = useRef<HTMLButtonElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        if (!busy) onCancel();
      }
      if (event.key === 'Tab') {
        const buttons = panelRef.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)');
        if (!buttons?.length) { event.preventDefault(); panelRef.current?.focus(); return; }
        const first = buttons[0], last = buttons[buttons.length - 1];
        if (event.shiftKey && (document.activeElement === first || !panelRef.current?.contains(document.activeElement))) {
          event.preventDefault(); last.focus();
        } else if (!event.shiftKey && (document.activeElement === last || !panelRef.current?.contains(document.activeElement))) {
          event.preventDefault(); first.focus();
        }
      }
    };

    document.addEventListener('keydown', onKeyDown);
    document.body.style.overflow = 'hidden';
    // Start on the safe action rather than accidentally accepting a financial decision.
    if (busy) panelRef.current?.focus();
    else cancelRef.current?.focus();

    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = previousOverflow;
      if (previousFocus?.isConnected) previousFocus.focus();
    };
  }, [open, onCancel, busy]);

  if (!open) return null;

  return (
    <div className="dialog" role="presentation">
      <div className="dialog__overlay" onClick={busy ? undefined : onCancel} aria-hidden="true" />
      <div
        className="dialog__panel"
        ref={panelRef}
        tabIndex={-1}
        role="alertdialog"
        aria-modal="true"
        aria-busy={busy}
        aria-labelledby="confirm-dialog-title"
        aria-describedby="confirm-dialog-message"
      >
        <div className={`dialog__icon dialog__icon--${variant}`}>
          <Icon name={variant === 'danger' ? 'alert-triangle' : 'info'} size={22} />
        </div>
        <h2 className="dialog__title" id="confirm-dialog-title">
          {title}
        </h2>
        <p className="dialog__message" id="confirm-dialog-message">
          {message}
        </p>
        <div className="dialog__actions">
          <button
            type="button"
            ref={cancelRef}
            className="btn btn--secondary"
            onClick={onCancel}
            disabled={busy}
          >
            {cancelLabel}
          </button>
          <button
            ref={confirmRef}
            type="button"
            className={`btn ${variant === 'danger' ? 'btn--danger' : 'btn--primary'}`}
            onClick={onConfirm}
            disabled={busy}
          >
            {busy ? <span className="spinner" aria-hidden="true" /> : null}
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
