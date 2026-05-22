import { API_BASE, api, escapeHtml, renderEmpty, renderSkeletonCards, showToast, formatBytes } from './api.js';
import { showConfirm } from './confirm.js';

let recordings = [];
let recordingsPath = [];

export async function loadRecordings() {
  const grid = document.getElementById('recordings-grid');
  if (!grid) return;
  grid.innerHTML = renderSkeletonCards(2);
  try {
    recordings = await api('/recordings');
    renderRecordings();
  } catch {
    grid.innerHTML = renderEmpty('Ошибка', 'Не удалось загрузить записи');
  }
}

function getCurrentDirFiles() {
  const entries = {};
  const files = [];
  recordings.forEach(r => {
    const parts = r.filename.split('/');
    let match = true;
    for (let i = 0; i < recordingsPath.length; i++) {
      if (parts[i] !== recordingsPath[i]) {
        match = false;
        break;
      }
    }
    if (!match) return;

    if (parts.length === recordingsPath.length + 1) {
      files.push(r);
    } else if (parts.length > recordingsPath.length + 1) {
      const subDir = parts[recordingsPath.length];
      if (!entries[subDir]) {
        const folderPath = recordingsPath.length ? recordingsPath.join('/') + '/' + subDir : subDir;
        entries[subDir] = { type: 'folder', name: subDir, count: 0, path: folderPath };
      }
      entries[subDir].count++;
    }
  });
  return { folders: Object.values(entries), files };
}

function renderBreadcrumb() {
  const parts = [`<i class="fas fa-folder" style="color:var(--accent-primary)"></i> Записи`, ...recordingsPath];
  let html = `<div class="breadcrumb-row">`;
  if (recordingsPath.length > 0) {
    html += `<button class="btn btn-sm btn-secondary breadcrumb-back" onclick="window.navRecordingsBack()" title="Назад">
      <i class="fas fa-arrow-left"></i> Назад
    </button>`;
  }
  html += `<div class="breadcrumb-path">${parts.map((p, i) => {
    if (i === 0) return `<a href="#" onclick="window.navRecordingsRoot(); return false;">${p}</a>`;
    return ` / <a href="#" onclick="window.navRecordingsTo(${i - 1}); return false;">${escapeHtml(p)}</a>`;
  }).join('')}</div></div>`;
  return html;
}

function renderFolderCard(folder) {
  return `
    <div class="camera-card">
      <div class="camera-card-header">
        <div style="display:flex;align-items:center;gap:16px;flex:1;min-width:0;cursor:pointer" onclick="window.openRecordingFolder('${escapeHtml(folder.name)}')">
          <div class="folder-icon" style="width:48px;height:48px;border-radius:var(--radius-sm);background:rgba(59,130,246,0.15);color:var(--accent-primary);display:flex;align-items:center;justify-content:center;flex-shrink:0">
            <i class="fas fa-folder" style="font-size:20px"></i>
          </div>
          <div class="camera-info" style="flex:1;min-width:0">
            <h3>${escapeHtml(folder.name)}</h3>
            <p>${folder.count} записей</p>
          </div>
        </div>
        <div style="display:flex;align-items:center;gap:4px;margin-left:auto">
          <button class="btn btn-icon btn-sm btn-danger" onclick="event.stopPropagation(); window.deleteRecordingFolder('${encodeURIComponent(folder.path)}')" title="Удалить папку"><i class="fas fa-trash"></i></button>
        </div>
      </div>
    </div>`;
}

function renderFileCard(file) {
  const parts = file.filename.split('/');
  const name = parts[parts.length - 1];
  return `
    <div class="camera-card">
      <div class="camera-card-header">
        <div style="display:flex;align-items:center;gap:14px;flex:1;min-width:0;cursor:pointer" onclick="window.playRecording('${encodeURIComponent(file.filename)}')">
          <div style="width:48px;height:48px;border-radius:var(--radius-sm);background:rgba(34,197,94,0.15);color:var(--success);display:flex;align-items:center;justify-content:center;flex-shrink:0">
            <i class="fas fa-play-circle" style="font-size:20px"></i>
          </div>
          <div class="camera-info" style="flex:1;min-width:0">
            <h3 style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${escapeHtml(name)}</h3>
            <p>${formatRecordingDate(file.created_at)} · ${formatBytes(file.size)}</p>
          </div>
        </div>
        <div style="display:flex;align-items:center;gap:4px;margin-left:auto">
          ${file.camera_id ? `<span class="badge badge-info">Камера #${file.camera_id}</span>` : ''}
          <button class="btn btn-icon btn-sm" onclick="event.stopPropagation(); window.downloadRecording('${encodeURIComponent(file.filename)}')" title="Скачать"><i class="fas fa-download"></i></button>
          <button class="btn btn-icon btn-sm btn-danger" onclick="event.stopPropagation(); window.deleteRecording('${encodeURIComponent(file.filename)}')" title="Удалить"><i class="fas fa-trash"></i></button>
        </div>
      </div>
    </div>`;
}

export function renderRecordings() {
  const breadcrumbEl = document.getElementById('recordings-breadcrumb');
  const grid = document.getElementById('recordings-grid');
  if (!grid) return;
  const { folders, files } = getCurrentDirFiles();

  if (breadcrumbEl) breadcrumbEl.innerHTML = renderBreadcrumb();

  if (!folders.length && !files.length) {
    grid.innerHTML = renderEmpty('Нет записей', recordingsPath.length ? 'Эта папка пуста' : 'Архив записей пуст');
    return;
  }

  let html = '';
  html += folders.map(f => renderFolderCard(f)).join('');
  html += files.map(f => renderFileCard(f)).join('');
  grid.innerHTML = html;
}

window.navRecordingsBack = () => { recordingsPath.pop(); renderRecordings(); };
window.navRecordingsRoot = () => { recordingsPath = []; renderRecordings(); };
window.navRecordingsTo = (index) => { recordingsPath = recordingsPath.slice(0, index + 1); renderRecordings(); };
window.openRecordingFolder = (name) => { recordingsPath.push(name); renderRecordings(); };
window.downloadRecording = (filename) => {
  const a = document.createElement('a');
  a.href = `${API_BASE}/recordings/${filename}`;
  a.download = decodeURIComponent(filename).split('/').pop();
  document.body.appendChild(a);
  a.click();
  a.remove();
};
window.playRecording = (filename) => {
  const modal = document.getElementById('video-modal');
  const video = document.getElementById('video-player');
  const title = document.getElementById('video-modal-title');
  if (!modal || !video) return;
  title.textContent = decodeURIComponent(filename).split('/').pop();
  video.src = `${API_BASE}/recordings/${filename}`;
  modal.classList.add('active');
  video.play().catch(() => {});
};
window.closeVideoModal = () => {
  const modal = document.getElementById('video-modal');
  const video = document.getElementById('video-player');
  if (video) { video.pause(); video.src = ''; }
  if (modal) modal.classList.remove('active');
};
window.deleteRecording = (filename) => {
  const decoded = decodeURIComponent(filename);
  const name = decoded.split('/').pop();
  showConfirm(`Удалить запись "${name}"?`, async () => {
    try {
      await api(`/recordings/${decoded}`, { method: 'DELETE' });
      showToast('Запись удалена', 'success');
      loadRecordings();
    } catch {
      showToast('Ошибка удаления', 'error');
    }
  });
};
window.deleteRecordingFolder = (folderPath) => {
  const decoded = decodeURIComponent(folderPath);
  const name = decoded.split('/').pop();
  showConfirm(`Удалить папку "${name}" и все записи в ней?`, async () => {
    try {
      await api(`/recordings/folder/${decoded}`, { method: 'DELETE' });
      showToast('Папка удалена', 'success');
      loadRecordings();
    } catch (e) {
      const detail = e?.detail || 'Ошибка удаления папки';
      showToast(detail, 'error');
    }
  });
};

function formatRecordingDate(ts) {
  const d = new Date(ts * 1000);
  return d.toLocaleString('ru-RU', {
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}