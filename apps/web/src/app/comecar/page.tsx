import { redirect } from 'next/navigation';
import { finishSignup, loadSignup } from '@/features/signup/service';
import { requireUser } from '@/lib/auth/session';

// Retoma o cadastro de onde parou (CAD-07).
export default async function SignupEntry() {
  const user = await requireUser('/comecar');
  const { next } = await loadSignup(user.id);
  if (next) redirect(next.path);
  await finishSignup(user.id);
  redirect('/app');
}
