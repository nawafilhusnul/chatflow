'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/presentation/hooks/useAuth';
import Loading from './Loading';

export default function ProtectedRoute({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!loading && !user && mounted) {
      router.replace('/login');
    }
  }, [user, loading, router, mounted]);

  if (!mounted || loading) {
    return <Loading />;
  }

  return user ? <>{children}</> : null;
}
