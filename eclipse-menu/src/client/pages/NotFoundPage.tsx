import { Link } from 'react-router-dom';
import { Martini } from 'lucide-react';
import { BrandMark } from '../components/ui';

export default function NotFoundPage() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-4 px-6 text-center">
      <BrandMark size={52} />
      <p className="eyebrow">404</p>
      <h1 className="font-display text-3xl text-cream">This page has left the bar</h1>
      <p className="max-w-sm text-sm leading-relaxed text-smoke">
        The page you're looking for doesn't exist. The menu, however, is right where you left it.
      </p>
      <Link to="/" className="btn-gold mt-2">
        <Martini size={15} /> Back to the menu
      </Link>
    </div>
  );
}
