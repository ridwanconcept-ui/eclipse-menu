import { useEffect, useState } from 'react';
import { useLocation, useNavigate, Link } from 'react-router-dom';
import { ArrowLeft, LockKeyhole } from 'lucide-react';
import { useAuth } from '../../lib/auth';
import { ApiError } from '../../lib/api';
import { BrandMark, Field, Spinner } from '../../components/ui';

export default function LoginPage() {
  const { signIn, user, loading } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    document.title = 'Sign in — Eclipse Admin';
  }, []);

  useEffect(() => {
    if (!loading && user) {
      const from = (location.state as { from?: string } | null)?.from;
      navigate(from && from.startsWith('/admin') ? from : '/admin', { replace: true });
    }
  }, [user, loading, navigate, location.state]);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await signIn(email.trim(), password);
      navigate('/admin', { replace: true });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Sign in failed. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-dvh items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm">
        <Link to="/" className="mb-6 inline-flex items-center gap-1.5 text-[11px] uppercase tracking-[0.16em] text-smoke hover:text-gold-200">
          <ArrowLeft size={12} /> Back to menu
        </Link>

        <div className="card p-6 shadow-gold">
          <div className="flex flex-col items-center gap-2 text-center">
            <BrandMark size={46} />
            <h1 className="mt-1 font-display text-2xl text-cream">Eclipse Admin</h1>
            <p className="text-[12px] leading-relaxed text-smoke">Sign in to manage the menu, promotions and QR codes.</p>
          </div>

          <form onSubmit={onSubmit} className="mt-6 space-y-3.5">
            <Field label="Email" htmlFor="email" required>
              <input
                id="email"
                type="email"
                autoComplete="username"
                required
                className="input"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@venue.com"
              />
            </Field>
            <Field label="Password" htmlFor="password" required>
              <input
                id="password"
                type="password"
                autoComplete="current-password"
                required
                minLength={8}
                className="input"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
              />
            </Field>

            {error && <p className="rounded-lg bg-red-950/50 px-3 py-2 text-[12px] text-red-200">{error}</p>}

            <button className="btn-gold w-full !py-3" type="submit" disabled={busy}>
              {busy ? <Spinner /> : <LockKeyhole size={15} />}
              {busy ? 'Signing in…' : 'Sign in'}
            </button>
          </form>

          <p className="mt-4 text-center text-[11px] leading-relaxed text-smoke/60">
            Authorised staff only. Access attempts are rate-limited and recorded.
          </p>
        </div>
      </div>
    </div>
  );
}
