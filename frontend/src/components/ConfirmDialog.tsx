import React from 'react';
import { Check, X, AlertTriangle, Trash2 } from 'lucide-react';

interface ConfirmDialogProps {
  isOpen: boolean;
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  type?: 'delete' | 'warning' | 'info';
  onConfirm: () => void;
  onCancel: () => void;
}

const ConfirmDialog: React.FC<ConfirmDialogProps> = ({
  isOpen,
  title,
  message,
  confirmText = '确认',
  cancelText = '取消',
  type = 'delete',
  onConfirm,
  onCancel,
}) => {
  if (!isOpen) return null;

  const getIcon = () => {
    switch (type) {
      case 'delete':
        return <Trash2 size={32} className="confirm-icon delete" />;
      case 'warning':
        return <AlertTriangle size={32} className="confirm-icon warning" />;
      default:
        return <AlertTriangle size={32} className="confirm-icon info" />;
    }
  };

  return (
    <div className="confirm-dialog-overlay" onClick={onCancel}>
      <div className="confirm-dialog" onClick={e => e.stopPropagation()}>
        <div className="confirm-dialog-content">
          <div className="confirm-icon-wrapper">
            {getIcon()}
          </div>
          <h3 className="confirm-title">{title}</h3>
          <p className="confirm-message">{message}</p>
        </div>
        <div className="confirm-dialog-actions">
          <button className="confirm-btn cancel" onClick={onCancel}>
            <X size={16} />
            {cancelText}
          </button>
          <button className="confirm-btn confirm" onClick={onConfirm}>
            <Check size={16} />
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ConfirmDialog;
