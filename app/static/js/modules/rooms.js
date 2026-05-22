import { api, escapeHtml, renderEmpty, showToast } from './api.js';
import { setEditingItem } from './state.js';
import { showConfirm } from './confirm.js';
import { populateSelect } from './app-selects.js';
import { getAddresses } from './app-data.js';
import { navigateTo } from '../router.js';

import { initCustomSelects } from './custom-select.js';

let rooms = [];

export async function loadRooms() {
  try { rooms = await api('/rooms'); } catch { rooms = []; }
  const filterSelect = document.getElementById('room-address-filter');
  if (filterSelect) {
    const addresses = await getAddresses();
    populateSelect(filterSelect, addresses, filterSelect.value, 'Все адреса');
    filterSelect.onchange = () => renderRooms();
  }
  renderRooms();
}

export function renderRooms() {
  const grid = document.getElementById('rooms-grid');
  if (!grid) return;
  const filterSelect = document.getElementById('room-address-filter');
  const addrFilter = filterSelect ? filterSelect.value : '';
  const filtered = addrFilter ? rooms.filter(r => r.address_id == addrFilter) : rooms;
  if (!filtered.length) {
    grid.innerHTML = renderEmpty('Нет кабинетов', 'Добавьте кабинеты к адресу');
    return;
  }
  grid.innerHTML = filtered.map(r => `
    <div class="camera-card">
      <div class="camera-card-header">
        <div class="camera-info">
          <h3>${escapeHtml(r.name)}</h3>
          <p>${escapeHtml(r.address?.name || 'Адрес #' + r.address_id)}</p>
        </div>
        <div style="display:flex;flex-direction:column;gap:4px;align-items:flex-end"><span class="badge badge-info">Камер: ${r.cameras?.length || 0}</span></div>
      </div>
      <div class="camera-card-footer">
        <button class="btn btn-icon btn-sm" onclick="window.editRoom(${r.id})" title="Редактировать"><i class="fas fa-edit"></i></button>
        <button class="btn btn-icon btn-sm btn-danger" onclick="window.deleteRoom(${r.id})" title="Удалить"><i class="fas fa-trash"></i></button>
      </div>
    </div>
  `).join('');
}

export async function renderRoomForm(data = {}) {
  const addresses = await getAddresses();
  return `
    <div class="form-group">
      <label>Адрес</label>
      <select id="room-address">${addresses.map(a =>
        `<option value="${a.id}" ${a.id === data.address_id ? 'selected' : ''}>${escapeHtml(a.name)}</option>`
      ).join('')}</select>
    </div>
    <div class="form-group"><label>Название кабинета</label>
    <input type="text" id="room-name" value="${escapeHtml(data.name || '')}" placeholder="Кабинет 101"></div>`;
}

export async function editRoom(id) {
  const r = rooms.find(x => x.id === id);
  if (!r) return;
  setEditingItem(r);
  document.getElementById('modal-title').textContent = 'Редактировать кабинет';
  const body = document.getElementById('modal-body');
  body.innerHTML = await renderRoomForm(r);
  initCustomSelects(body);
  document.getElementById('modal').classList.add('active');
}

export async function deleteRoom(id) {
  showConfirm('Удалить кабинет? Камеры в нем будут удалены!', async () => {
    await api(`/rooms/${id}`, { method: 'DELETE' });
    showToast('Кабинет удален', 'success');
    navigateTo('rooms');
  });
}

window.editRoom = editRoom;
window.deleteRoom = deleteRoom;