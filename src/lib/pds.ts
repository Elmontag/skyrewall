import { isIP } from 'node:net';
import { lookup } from 'node:dns/promises';

const ALLOWED_PDS_PORTS = new Set(['', '443']);

function isPrivateIpv4(ip: string): boolean {
  const parts = ip.split('.').map((part) => Number(part));
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) {
    return true;
  }

  const [a, b] = parts;
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    a >= 224
  );
}

function isPrivateIpv6(ip: string): boolean {
  const normalized = ip.toLowerCase();
  if (normalized.startsWith('::ffff:')) {
    return isPrivateIpv4(normalized.slice('::ffff:'.length));
  }
  return (
    normalized === '::' ||
    normalized === '::1' ||
    normalized.startsWith('fc') ||
    normalized.startsWith('fd') ||
    normalized.startsWith('fe80:')
  );
}

export function isUnsafeHost(hostname: string): boolean {
  const normalized = hostname.toLowerCase().replace(/\.$/, '');
  if (!normalized || normalized === 'localhost' || normalized.endsWith('.localhost')) return true;

  const ipVersion = isIP(normalized);
  if (ipVersion === 4) return isPrivateIpv4(normalized);
  if (ipVersion === 6) return isPrivateIpv6(normalized);

  return false;
}

export function validatePdsServiceEndpoint(endpoint: string): string {
  let url: URL;
  try {
    url = new URL(endpoint);
  } catch {
    throw new Error('PDS service endpoint is not a valid URL');
  }

  if (url.protocol !== 'https:') {
    throw new Error('PDS service endpoint must use HTTPS');
  }
  if (url.username || url.password) {
    throw new Error('PDS service endpoint must not include credentials');
  }
  if (!ALLOWED_PDS_PORTS.has(url.port)) {
    throw new Error('PDS service endpoint uses an unsupported port');
  }
  if (isUnsafeHost(url.hostname)) {
    throw new Error('PDS service endpoint host is not allowed');
  }

  url.hash = '';
  url.search = '';
  url.pathname = url.pathname.replace(/\/+$/, '');
  return url.toString().replace(/\/$/, '');
}

export async function assertPublicPdsHostname(endpoint: string): Promise<void> {
  const { hostname } = new URL(endpoint);
  if (isIP(hostname)) return;

  const addresses = await lookup(hostname, { all: true, verbatim: true });
  if (addresses.length === 0 || addresses.some(({ address }) => isUnsafeHost(address))) {
    throw new Error('PDS service endpoint resolves to a non-public address');
  }
}

export function didWebToDocumentUrl(did: string): string {
  if (!did.startsWith('did:web:')) {
    throw new Error('DID is not did:web');
  }

  const id = did.slice('did:web:'.length);
  const parts = id.split(':').map((part) => decodeURIComponent(part));
  const [hostPart, ...pathParts] = parts;
  if (!hostPart) {
    throw new Error('did:web host is not allowed');
  }

  const base = new URL(`https://${hostPart}`);
  if (base.username || base.password || !ALLOWED_PDS_PORTS.has(base.port) || isUnsafeHost(base.hostname)) {
    throw new Error('did:web host is not allowed');
  }

  if (pathParts.length === 0) {
    base.pathname = '/.well-known/did.json';
  } else {
    base.pathname = `/${pathParts.map(encodeURIComponent).join('/')}/did.json`;
  }
  return base.toString();
}
