import { AnimatePresence, motion } from 'framer-motion';
import type { ReactNode } from 'react';
import { createPortal } from 'react-dom';

export function Sheet({
  open,
  onClose,
  children,
  title,
  lead,
}: {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  title?: string;
  lead?: string;
}) {
  if (typeof document === 'undefined') return null;

  return createPortal(
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            className="sheet-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={onClose}
          />
          <motion.div
            className="sheet"
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', stiffness: 380, damping: 34 }}
            drag="y"
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={{ top: 0, bottom: 0.4 }}
            onDragEnd={(_, info) => {
              if (info.offset.y > 90) onClose();
            }}
          >
            <div className="grabber" />
            {title && <h2>{title}</h2>}
            {lead && <div className="lead">{lead}</div>}
            {children}
          </motion.div>
        </>
      )}
    </AnimatePresence>
    ,
    document.body,
  );
}

export function Confirm({
  open,
  title,
  body,
  confirmText = '确认',
  danger,
  onConfirm,
  onClose,
}: {
  open: boolean;
  title: string;
  body: ReactNode;
  confirmText?: string;
  danger?: boolean;
  onConfirm: () => void;
  onClose: () => void;
}) {
  if (typeof document === 'undefined') return null;
  return createPortal(
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            className="alert-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={onClose}
          />
          <div className="alert-wrap">
            <motion.div
              className="alert"
              initial={{ opacity: 0, scale: 0.94 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.96 }}
              transition={{ type: 'spring', stiffness: 420, damping: 32 }}
              role="alertdialog"
            >
              <div className="alert-body">
                <h3>{title}</h3>
                <p style={{ whiteSpace: 'pre-line' }}>{body}</p>
              </div>
              <div className="alert-actions">
                <button onClick={onClose}>取消</button>
                <button className={danger ? 'danger' : 'primary'} onClick={onConfirm}>
                  {confirmText}
                </button>
              </div>
            </motion.div>
          </div>
        </>
      )}
    </AnimatePresence>,
    document.body,
  );
}

export function Dialog({
  open,
  onClose,
  children,
  dismissable = true,
}: {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  dismissable?: boolean;
}) {
  if (typeof document === 'undefined') return null;
  return createPortal(
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            className="alert-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={() => dismissable && onClose()}
          />
          <div className="alert-wrap">
            <motion.div
              className="dialog"
              initial={{ opacity: 0, scale: 0.95, y: 8 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.97 }}
              transition={{ type: 'spring', stiffness: 380, damping: 30 }}
            >
              {children}
            </motion.div>
          </div>
        </>
      )}
    </AnimatePresence>,
    document.body,
  );
}
