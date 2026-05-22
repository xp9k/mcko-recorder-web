import { api, escapeHtml, renderEmpty, showToast } from './api.js';
import { setEditingItem, getCurrentTab } from './state.js';
import { showConfirm } from './confirm.js';
import { navigateTo } from '../router.js';

let profiles = [];

export async function loadProfiles() {
  try { profiles = await api('/profiles'); } catch { profiles = []; }
}

export function renderProfiles() {
  const grid = document.getElementById('profiles-grid');
  if (!grid) return;
  if (!profiles.length) {
    grid.innerHTML = renderEmpty('Нет профилей', 'Добавьте профиль с учетными данными');
    return;
  }
  grid.innerHTML = profiles.map(p => `
    <div class="camera-card">
      <div class="camera-card-header">
        <div class="camera-info"><h3>${escapeHtml(p.name)}</h3><p>${escapeHtml(p.username)}</p></div>
      </div>
      <div class="camera-stream-info" style="font-family:monospace">${'•'.repeat(Math.min(12, p.username.length))}</div>
      <div class="camera-card-footer">
        <button class="btn btn-icon btn-sm" onclick="window.editProfile(${p.id})" title="Редактировать"><i class="fas fa-edit"></i></button>
        <button class="btn btn-icon btn-sm btn-danger" onclick="window.deleteProfile(${p.id})" title="Удалить"><i class="fas fa-trash"></i></button>
      </div>
    </div>`).join('');
}

export function renderProfileForm(data = {}) {
  return `
    <div class="form-group"><label>Название профиля</label>
    <input type="text" id="prof-name" value="${escapeHtml(data.name || '')}" placeholder="Main Profile"></div>
    <div class="form-row">
      <div class="form-group"><label>Логин</label><input type="text" id="prof-user" value="${escapeHtml(data.username || '')}" placeholder="admin"></div>
      <div class="form-group"><label>Пароль</label><input type="password" id="prof-pass" value="${escapeHtml(data.password || '')}" placeholder="password"></div>
    </div>`;
}

export async function editProfile(id) {
  const p = profiles.find(x => x.id === id);
  if (!p) return;
  setEditingItem(p);
  document.getElementById('modal-title').textContent = 'Редактировать профиль';
  const body = document.getElementById('modal-body');
  body.innerHTML = renderProfileForm(p);
  const { initCustomSelects } = await import('./custom-select.js');
  initCustomSelects(body);
  document.getElementById('modal').classList.add('active');
}

export async function deleteProfile(id) {
  showConfirm('Удалить профиль?', async () => {
    await api(`/profiles/${id}`, { method: 'DELETE' });
    showToast('Профиль удален', 'success');
    navigateTo('profiles');
  });
}

window.editProfile = editProfile;
window.deleteProfile = deleteProfile;