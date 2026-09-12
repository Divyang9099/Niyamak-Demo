import axiosInstance from '../api/axios';

/**
 * Pull the original filename out of a Content-Disposition header.
 * Prefers RFC 5987 `filename*=UTF-8''...` then falls back to `filename="..."`.
 */
function filenameFromDisposition(disposition) {
  if (!disposition) return null;
  const star = /filename\*=(?:UTF-8'')?([^;]+)/i.exec(disposition);
  if (star && star[1]) {
    try { return decodeURIComponent(star[1].replace(/["']/g, '').trim()); } catch { /* ignore */ }
  }
  const plain = /filename="?([^"]+?)"?(?:;|$)/i.exec(disposition);
  if (plain && plain[1]) return plain[1].trim();
  return null;
}

/**
 * Download a file in its ORIGINAL form. The saved name + extension and the blob's
 * MIME type both come from the server response (Content-Disposition / Content-Type),
 * so files arrive exactly as uploaded. The passed `filename` is only a fallback.
 */
export const downloadFile = async (endpoint, filename) => {
  try {
    const response = await axiosInstance.get(endpoint, { responseType: 'blob' });

    const serverName = filenameFromDisposition(response.headers?.['content-disposition']);
    const type = response.headers?.['content-type'] || response.data?.type || 'application/octet-stream';

    const blob = new Blob([response.data], { type });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', serverName || filename || 'download');
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.URL.revokeObjectURL(url);
  } catch (err) {
    console.error('Download failed:', err);
    throw err;
  }
};
