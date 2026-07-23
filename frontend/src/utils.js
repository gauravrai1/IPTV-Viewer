export function imgProxy(url) {
  if (!url) return '';
  return `/api/proxy/image?url=${encodeURIComponent(url)}`;
}
