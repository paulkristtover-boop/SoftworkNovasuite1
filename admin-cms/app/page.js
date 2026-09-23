import { redirect } from 'next/navigation';
import { isAuthenticated } from '../lib/auth';

export default async function Home() {
  if (await isAuthenticated()) {
    redirect('/dashboard');
  }
  redirect('/login');
}
