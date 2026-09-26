import type { Metadata } from 'next';
import { AuditLog } from '@/components/app/screens/AuditLog';

export const metadata: Metadata = { title: 'Audit log' };

export default function Page() {
  return <AuditLog />;
}
