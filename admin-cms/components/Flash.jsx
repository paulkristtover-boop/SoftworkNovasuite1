'use client';

import { useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';

export function Flash() {
  const sp = useSearchParams();
  const ok = sp.get('ok');
  const err = sp.get('err');
  const [visible, setVisible] = useState(Boolean(ok || err));

  useEffect(() => {
    setVisible(Boolean(ok || err));
    if (!ok && !err) return;
    const t = setTimeout(() => setVisible(false), 6000);
    return () => clearTimeout(t);
  }, [ok, err]);

  if (!visible || (!ok && !err)) return null;

  return (
    <div className={`flash ${err ? 'flash-err' : 'flash-ok'}`} role="status">
      {err ? `⚠️ ${err}` : `✅ ${ok}`}
      <button type="button" className="flash-close" onClick={() => setVisible(false)} aria-label="Dismiss">
        ×
      </button>
    </div>
  );
}
