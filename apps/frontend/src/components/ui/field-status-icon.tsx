import { MdCheck, MdClose, MdAutorenew, MdWarning } from 'react-icons/md';

interface FieldStatusIconProps {
  status: 'checking' | 'error' | 'success' | 'warning' | '';
}

export function FieldStatusIcon({ status }: FieldStatusIconProps) {
  if (status === 'checking') return <MdAutorenew className="h-4 w-4 text-primary animate-spin" />;
  if (status === 'error') return <MdClose className="h-4 w-4 text-error" />;
  if (status === 'success') return <MdCheck className="h-4 w-4 text-success" />;
  if (status === 'warning') return <MdWarning className="h-4 w-4 text-warning" />;
  return null;
}
