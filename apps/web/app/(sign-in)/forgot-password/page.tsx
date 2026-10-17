import type { Metadata } from 'next';
import { ForgotPasswordForm } from '@/components/auth/ForgotPasswordForm';
import { SignInFrame } from '@/components/auth/SignInFrame';

export const metadata: Metadata = { title: 'Reset your password' };

export default function ForgotPasswordPage() {
  return (
    <SignInFrame lead="Get back to">
      <ForgotPasswordForm />
    </SignInFrame>
  );
}
