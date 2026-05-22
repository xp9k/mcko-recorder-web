export const API_BASE = window.location.origin;

export async function api(url, opts = {}) {
  try {
    const res = await fetch(`${API_BASE}${url}`, {
      headers: { 'Content-Type': 'application/json' },
      ...opts,
      body: opts.body ? JSON.stringify(opts.body) : undefined,
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.detail || `Ошибка ${res.status}`);
    }
    const method = (opts.method || 'GET').toUpperCase();
    if (method !== 'GET' && method !== 'HEAD') {
      const { invalidateCache } = await import('./app-data.js');
      invalidateCache();
    }
    return res.status === 204 ? null : await res.json();
  } catch (e) {
    console.error('API error:', url, e);
    showToast(e.message, 'error');
    throw e;
  }
}

export function showToast(message, type = 'info') {
  const container = document.getElementById('toast-container');
  const icons = {
    success: 'check-circle',
    error: 'exclamation-circle',
    warning: 'exclamation-triangle',
    info: 'info-circle',
  };
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.innerHTML = `<i class="fas fa-${icons[type]}"></i><span>${escapeHtml(message)}</span>`;
  container.appendChild(toast);
  setTimeout(() => {
    toast.classList.add('removing');
    setTimeout(() => toast.remove(), 300);
  }, 4000);
}

export function escapeHtml(text) {
  if (!text) return '';
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

export function renderEmpty(title, desc) {
  return `<div class="empty-state" style="grid-column:1/-1"><i class="fas fa-video-slash"></i><h3>${escapeHtml(title)}</h3><p>${escapeHtml(desc)}</p></div>`;
}

export function renderSkeletonCards(n) {
  return Array(n).fill(0).map(() => `
    <div class="camera-card" style="padding:24px">
      <div class="skeleton" style="height:24px;width:60%;margin-bottom:12px"></div>
      <div class="skeleton" style="height:14px;width:90%;margin-bottom:16px"></div>
      <div class="skeleton" style="height:40px;width:100%;margin-bottom:16px"></div>
      <div style="display:flex;gap:8px">
        <div class="skeleton" style="height:32px;width:32px;border-radius:50%"></div>
        <div class="skeleton" style="height:32px;width:32px;border-radius:50%"></div>
      </div>
    </div>`).join('');
}

export function formatBytes(bytes) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}


