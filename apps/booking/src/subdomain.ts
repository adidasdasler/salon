/**
 * Resolve the tenant subdomain for the public booking widget.
 * - On `{salon}.salon.ru` → first host label
 * - In dev (`localhost:5175#/b/demo`) → route param
 */
export function resolveSubdomain(): string {
  const hash = window.location.hash || '';
  const m = hash.match(/^#\/b\/([a-z0-9-]+)/i);
  if (m) return m[1].toLowerCase();

  const host = window.location.hostname;
  const parts = host.split('.');
  // *.salon.ru or *.salon.local style wildcard subdomains
  if (parts.length >= 3 && !['localhost', '127'].includes(parts[parts.length - 1])) {
    const sub = parts[0].toLowerCase();
    if (!['app', 'api', 'www'].includes(sub)) return sub;
  }
  return 'demo';
}
