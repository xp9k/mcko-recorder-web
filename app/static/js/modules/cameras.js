import { api, escapeHtml, renderEmpty, renderSkeletonCards, showToast } from './api.js';
import { setEditingItem } from './state.js';
import { showConfirm } from './confirm.js';
import { loadCascadeData, getProfiles } from './app-data.js';
import { cascadeSelects, attachCascade } from './app-selects.js';
import { initCustomSelects } from './custom-select.js';

let cameras = [];
let activeRecordings = new Set();

export function getCameras() { return cameras; }

export function getFilteredCameras() {
  let result = [...cameras];
  const addrFilter = document.getElementById('camera-address-filter')?.value;
  const roomFilter = document.getElementById('camera-room-filter')?.value;
  if (addrFilter) result = result.filter(c => c.room?.address?.id == addrFilter || c.room?.address_id == addrFilter);
  if (roomFilter) result = result.filter(c => c.room_id == roomFilter);
  return result;
}

async function getCascadeData() {
  return await loadCascadeData();
}

export async function updateCameraFilters() {
  const data = await getCascadeData();
  const opts = {
    data,
    placeholders: { address: 'Все адреса', room: 'Все кабинеты' },
    onAddrChange: loadCameras,
    onRoomChange: loadCameras,
  };
  cascadeSelects(document.getElementById('camera-address-filter'), document.getElementById('camera-room-filter'), null, opts);
  attachCascade('camera-address-filter', 'camera-room-filter', null, opts);
}

export async function loadCameras() {
  const grid = document.getElementById('cameras-grid');
  if (grid) grid.innerHTML = renderSkeletonCards(3);
  try {
    const [cams, active] = await Promise.all([
      api('/cameras'),
      api('/api/recordings/active').catch(() => []),
    ]);
    cameras = cams;
    activeRecordings = new Set((active || []).map(r => r.camera_id));

    if (!grid) return;
    await updateCameraFilters();
    const filtered = getFilteredCameras();
    if (!filtered.length) {
      grid.innerHTML = renderEmpty('Нет камер', 'Добавьте первую камеру или измените фильтр');
    } else {
      grid.innerHTML = filtered.map(renderCameraCard).join('');
    }
    checkCronAnomalies();
  } catch (e) {
    console.error('loadCameras error:', e);
    if (grid) grid.innerHTML = renderEmpty('Ошибка загрузки', 'Не удалось загрузить список камер');
  }
}

export function renderCameraCard(cam) {
  const profileName = cam.profile ? escapeHtml(cam.profile.name) : '<span style="color:var(--text-muted)">Без профиля</span>';
  const roomPath = cam.room ? `${escapeHtml(cam.room.address?.name || '')} → ${escapeHtml(cam.room.name)}` : '<span style="color:var(--text-muted)">Не назначен</span>';
  const maskedUrl = escapeHtml(cam.stream_url || '');
  const isRecording = activeRecordings.has(cam.id);

  return `
  <div class="camera-card ${!cam.is_active ? 'inactive' : ''}">
    <div class="camera-card-header">
      <div class="camera-info"><h3>${escapeHtml(cam.name)}</h3><p>${escapeHtml(cam.description || 'Нет описания')}</p></div>
      <div style="display:flex;align-items:center;gap:8px;margin-left:auto">
        ${isRecording
          ? `<span class="recording-indicator" title="Идет запись"><span class="dot"></span><span>Идёт запись</span></span>`
          : `<span class="badge ${cam.is_active ? 'badge-success' : 'badge-danger'}">
              ${cam.is_active ? '<i class="fas fa-circle" style="font-size:6px"></i> Активна' : 'Неактивна'}
            </span>`}
      </div>
    </div>
    <div class="camera-stream-info">${escapeHtml(maskedUrl)}</div>
    <div style="margin-bottom:8px;font-size:13px;color:var(--text-secondary)"><i class="fas fa-map-marker-alt" style="margin-right:6px"></i>${roomPath}</div>
    <div style="margin-bottom:12px;font-size:13px;color:var(--text-secondary)"><i class="fas fa-id-card" style="margin-right:6px"></i>Профиль: ${profileName}</div>
    <div class="camera-card-footer">
      <button class="btn btn-icon btn-sm" onclick="window.editCamera(${cam.id})" title="Редактировать"><i class="fas fa-edit"></i></button>
      <button class="btn btn-icon btn-sm btn-danger" onclick="window.deleteCamera(${cam.id})" title="Удалить"><i class="fas fa-trash"></i></button>
      <div style="margin-left:auto;display:flex;gap:4px">
        ${isRecording
          ? `<button class="btn btn-icon btn-sm btn-danger" onclick="event.stopPropagation(); window.stopRecording(${cam.id})" title="Остановить запись"><i class="fas fa-stop"></i></button>`
          : `<button class="btn btn-icon btn-sm btn-record" onclick="event.stopPropagation(); window.startRecording(${cam.id})" title="Начать запись"><i class="fas fa-circle"></i></button>`}
        <button class="btn btn-icon btn-sm btn-success" onclick="event.stopPropagation(); window.watchCamera(${cam.id})" title="Смотреть"><i class="fas fa-play"></i></button></div>
    </div>
  </div>`;
}

export function renderCameraForm(data = {}) {
  return `
    <div class="form-group"><label>Название</label>
    <input type="text" id="cam-name" value="${escapeHtml(data.name || '')}" placeholder="Камера у входа"></div>
    <div class="form-row">
      <div class="form-group"><label>IP-адрес</label>
      <input type="text" id="cam-ip" value="${escapeHtml(data.ip_address || '')}" placeholder="192.168.1.100"></div>
      <div class="form-group"><label>Порт</label>
      <input type="number" id="cam-port" value="${data.port ?? 554}"></div>
    </div>
    <div class="form-group"><label>Путь потока</label>
    <input type="text" id="cam-path" value="${escapeHtml(data.stream_path ?? '')}" placeholder="/stream"></div>
    <div class="form-group"><label>Описание</label>
    <input type="text" id="cam-desc" value="${escapeHtml(data.description || '')}" placeholder="Необязательно"></div>
    <div class="form-row">
      <div class="form-group"><label>Адрес</label><select id="cam-address"><option value="">Выберите адрес</option></select></div>
      <div class="form-group"><label>Кабинет</label><select id="cam-room" disabled><option value="">Выберите кабинет</option></select></div>
    </div>
    <div class="form-group"><label>Профиль доступа</label><select id="cam-profile"><option value="">Без профиля</option></select></div>
    <div class="form-group checkbox-wrapper"><input type="checkbox" id="cam-active" ${data.is_active !== false ? 'checked' : ''}><label for="cam-active">Камера активна</label></div>`;
}

export async function editCamera(id) {
  const cam = cameras.find(c => c.id === id);
  if (!cam) return;
  setEditingItem(cam);
  document.getElementById('modal-title').textContent = 'Редактировать камеру';
  const body = document.getElementById('modal-body');
  body.innerHTML = renderCameraForm(cam);

  const profiles = await getProfiles();
  const profileSel = document.getElementById('cam-profile');
  profileSel.innerHTML = '<option value="">Без профиля</option>' + profiles.map(p =>
    `<option value="${p.id}" ${p.id === cam.profile_id ? 'selected' : ''}>${escapeHtml(p.name)} (${escapeHtml(p.username)})</option>`
  ).join('');

  const cascadeData = await getCascadeData();
  const addrId = cam.room?.address_id || cam.room?.address?.id || '';
  const roomId = cam.room_id || '';

  initCustomSelects(body);

  attachCascade('cam-address', 'cam-room', null, {
    data: cascadeData,
    placeholders: { address: 'Выберите адрес', room: 'Выберите кабинет' },
    init: { address: addrId, room: roomId }
  });

  document.getElementById('modal').classList.add('active');
}

export async function deleteCamera(id) {
  showConfirm('Удалить камеру?', async () => {
    await api(`/cameras/${id}`, { method: 'DELETE' });
    showToast('Камера удалена', 'success');
    loadCameras();
  });
}

export async function startRecording(cameraId) {
  try {
    await api(`/cameras/${cameraId}/record`, { method: 'POST' });
    showToast('Запись запущена', 'success');
    loadCameras();
  } catch (e) {
    showToast('Ошибка запуска записи', 'error');
  }
}

export async function stopRecording(cameraId) {
  try {
    await api(`/cameras/${cameraId}/stop`, { method: 'POST' });
    showToast('Запись остановлена', 'success');
    loadCameras();
  } catch (e) {
    showToast('Ошибка остановки записи', 'error');
  }
}

export async function checkCronAnomalies() {
  try {
    const { anomalies } = await api('/cron_anomalies');
    const container = document.getElementById('cron-anomalies');
    if (!container) return;
    if (anomalies && anomalies.length) {
      container.innerHTML = `<div class="toast toast-warning" style="margin-bottom:12px">
        <i class="fas fa-exclamation-triangle"></i>
        <div><strong>Аномалии cron:</strong><ul style="margin:4px 0 0 16px;padding:0">
          ${anomalies.map(a => `<li>${escapeHtml(a)}</li>`).join('')}
        </ul></div>
      </div>`;
      container.style.display = 'block';
    } else {
      container.innerHTML = '';
      container.style.display = 'none';
    }
  } catch (e) {}
}

window.editCamera = editCamera;
window.deleteCamera = deleteCamera;
window.startRecording = startRecording;
window.stopRecording = stopRecording;
window.watchCamera = (id) => {
  const modal = document.getElementById('live-modal');
  const img = document.getElementById('live-modal-img');
  const title = document.getElementById('live-modal-title');
  if (!modal || !img) return;
  const cam = cameras.find(c => c.id === id);
  if (cam) {
    const addr = cam.room?.address?.name || '';
    const room = cam.room?.name || '';
    title.textContent = [addr, room, cam.name].filter(Boolean).join(' → ');
  } else {
    title.textContent = `Камера #${id}`;
  }
  img.src = '';
  img.style.display = 'none';
  const placeholder = document.getElementById('live-modal-placeholder');
  if (placeholder) placeholder.style.display = 'none';
  img.onerror = () => {
    img.style.display = 'none';
    let ph = document.getElementById('live-modal-placeholder');
    if (!ph) {
      ph = document.createElement('div');
      ph.id = 'live-modal-placeholder';
      ph.className = 'no-stream';
      ph.style.cssText = 'display:flex;flex-direction:column;align-items:center;justify-content:center;height:100%;width:100%';
      img.parentElement.appendChild(ph);
    }
    ph.innerHTML = '<i class="fas fa-exclamation-triangle" style="font-size:48px;color:var(--warning);margin-bottom:16px"></i><p>Трансляция недоступна.<br>На Windows запустите с параметром <code>--loop asyncio</code></p>';
    ph.style.display = 'flex';
  };
  img.onload = () => {
    img.style.display = '';
    const ph = document.getElementById('live-modal-placeholder');
    if (ph) ph.style.display = 'none';
  };
  img.src = `${window.location.origin}/streaming/${id}/live`;
  modal.classList.add('active');
};
window.closeLiveModal = () => {
  const modal = document.getElementById('live-modal');
  const img = document.getElementById('live-modal-img');
  if (img) img.src = '';
  if (modal) modal.classList.remove('active');
};