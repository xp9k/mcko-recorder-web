import { api, escapeHtml, renderEmpty, showToast } from './api.js';
import { setEditingItem } from './state.js';
import { showConfirm } from './confirm.js';
import { navigateTo } from '../router.js';

let addresses = [];

export async function loadAddresses() {
  try { addresses = await api('/addresses'); } catch { addresses = []; }
}

export function renderAddresses() {
  const grid = document.getElementById('addresses-grid');
  if (!grid) return;
  if (!addresses.length) {
    grid.innerHTML = renderEmpty('Нет адресов', 'Добавьте адрес для кабинетов');
    return;
  }
  grid.innerHTML = addresses.map(a => {
    const roomCount = a.rooms?.length || 0;
    const camCount = (a.rooms || []).reduce((sum, r) => sum + (r.cameras?.length || 0), 0);
    return `
    <div class="camera-card">
      <div class="camera-card-header">
          <div class="camera-info"><h3>${escapeHtml(a.name)}</h3></div>
          <div style="display:flex;flex-direction:column;gap:4px;align-items:flex-end">
            <span class="badge badge-info">Кабинетов: ${roomCount}</span>
            <span class="badge badge-info">Камер: ${camCount}</span>
          </div>
      </div>
      <div class="camera-card-footer">
        <button class="btn btn-icon btn-sm" onclick="window.editAddress(${a.id})" title="Редактировать"><i class="fas fa-edit"></i></button>
        <button class="btn btn-icon btn-sm btn-danger" onclick="window.deleteAddress(${a.id})" title="Удалить"><i class="fas fa-trash"></i></button>
      </div>
    </div>`;
  }).join('');
}

export function renderAddressForm(data = {}) {
  return `
    <div class="form-group"><label>Название адреса</label>
    <input type="text" id="addr-name" value="${escapeHtml(data.name || '')}" placeholder="Например: г. Москва, ул. Ленина 1"></div>`;
}

export async function editAddress(id) {
  const a = addresses.find(x => x.id === id);
  if (!a) return;
  setEditingItem(a);
  document.getElementById('modal-title').textContent = 'Редактировать адрес';
  const body = document.getElementById('modal-body');
  body.innerHTML = renderAddressForm(a);
  const { initCustomSelects } = await import('./custom-select.js');
  initCustomSelects(body);
  document.getElementById('modal').classList.add('active');
}

export async function deleteAddress(id) {
  showConfirm('Удалить адрес? Все кабинеты и камеры в них будут удалены!', async () => {
    await api(`/addresses/${id}`, { method: 'DELETE' });
    showToast('Адрес удален', 'success');
    navigateTo('addresses');
  });
}

window.editAddress = editAddress;
window.deleteAddress = deleteAddress;