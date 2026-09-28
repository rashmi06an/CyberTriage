export function formatDateTime(value?: string | null): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function formatTime(value?: string | null): string {
  if (!value) return '—';
  const time = String(value).split(/[T ]/)[1];
  return time ? time.slice(0, 8) : String(value);
}

export function formatBytes(bytes?: number | null): string {
  if (!bytes || bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const exponent = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
  return `${(bytes / 1024 ** exponent).toFixed(exponent === 0 ? 0 : 1)} ${units[exponent]}`;
}

export function shortHash(hash?: string | null, length = 16): string {
  if (!hash) return '—';
  return hash.length > length ? `${hash.slice(0, length)}…` : hash;
}

export function baseName(filePath?: string | null): string {
  if (!filePath) return '—';
  const parts = filePath.split('/');
  return parts[parts.length - 1] || filePath;
}

export function statusSlug(status?: string): string {
  return (status ?? 'unknown').toLowerCase().replace(/[^a-z]+/g, '-');
}

export function priorityRank(priority?: string): number {
  if (priority === 'HIGH') return 0;
  if (priority === 'MEDIUM') return 1;
  return 2;
}

export function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}
