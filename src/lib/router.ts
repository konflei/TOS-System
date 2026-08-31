import { useEffect, useState, useCallback } from 'react';

export type Route =
  | { name: 'dashboard' }
  | { name: 'customers' }
  | { name: 'customer'; id: string }
  | { name: 'queue' }
  | { name: 'tos-rules' }
  | { name: 'damages' };

function parseHash(): Route {
  const hash = window.location.hash.replace(/^#/, '');
  const parts = hash.split('/').filter(Boolean);
  if (parts.length === 0) return { name: 'dashboard' };
  if (parts[0] === 'customers' && parts[1]) return { name: 'customer', id: parts[1] };
  if (parts[0] === 'customers') return { name: 'customers' };
  if (parts[0] === 'queue') return { name: 'queue' };
  if (parts[0] === 'tos-rules') return { name: 'tos-rules' };
  if (parts[0] === 'damages') return { name: 'damages' };
  return { name: 'dashboard' };
}

export function routeToHash(r: Route): string {
  switch (r.name) {
    case 'dashboard': return '#/';
    case 'customers': return '#/customers';
    case 'customer': return `#/customers/${r.id}`;
    case 'queue': return '#/queue';
    case 'tos-rules': return '#/tos-rules';
    case 'damages': return '#/damages';
  }
}

export function useRouter() {
  const [route, setRoute] = useState<Route>(parseHash());

  useEffect(() => {
    const onHash = () => setRoute(parseHash());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  const navigate = useCallback((r: Route) => {
    window.location.hash = routeToHash(r);
  }, []);

  return { route, navigate };
}
