import { api, escapeHtml, renderEmpty, showToast } from './api.js';
import { cascadeSelects, attachCascade, resetSelect, populateSelect } from './app-selects.js';
import { loadCascadeData, getTemplates, DAYS } from './app-data.js';
import { getCameras, loadCameras } from './cameras.js';
import { showConfirm } from './confirm.js';

let bindings = [];

async function getBindingCascadeOpts() {
  const data = await loadCascadeData();
  return {
    data,
    placeholders: { address: 'Все адреса', room: 'Все кабинеты', camera: 'Все камеры' },
    onAddrChange: renderBindings,
    onRoomChange: renderBindings,
    onCamChange: renderBindings,
  };
}

export async function loadBindings() {
  const list = document.getElementById('bindings-list');
  if (!list) return;
  list.innerHTML = `<div class="skeleton" style="height:40px;margin-bottom:8px"></div><div class="skeleton" style="height:40px;margin-bottom:8px"></div>`;

  await Promise.all([loadCameras(), getTemplates()]);

  try {
    bindings = await api('/schedule_bindings');
    renderBindings();
  } catch {
    list.innerHTML = renderEmpty('Ошибка', 'Не удалось загрузить привязки');
  }
}

function getFilteredBindings() {
  let result = [...bindings];
  const addrFilter = document.getElementById('binding-address-filter')?.value;
  const roomFilter = document.getElementById('binding-room-filter')?.value;
  const camFilter = document.getElementById('binding-camera-filter')?.value;
  const cams = getCameras();
  if (addrFilter) result = result.filter(b => {
    const cam = cams.find(c => c.id === b.camera_id);
    return cam && (cam.room?.address?.id == addrFilter || cam.room?.address_id == addrFilter);
  });
  if (roomFilter) result = result.filter(b => {
    const cam = cams.find(c => c.id === b.camera_id);
    return cam && cam.room_id == roomFilter;
  });
  if (camFilter) result = result.filter(b => b.camera_id == camFilter);
  return result;
}

export async function renderBindings() {
  const list = document.getElementById('bindings-list');
  if (!list) return;

  await updateBindingFilters();

  const filtered = getFilteredBindings();
  const templates = await getTemplates();
  const cams = getCameras();

  if (!filtered.length) {
    list.innerHTML = renderEmpty('Нет привязок', 'Добавьте привязки шаблонов к камерам');
    return;
  }

  const rows = {};
  for (const b of filtered) {
    const tpl = templates.find(t => t.id === b.template_id);
    if (!tpl) continue;
    const key = `${tpl.start_time?.slice(0,5)} - ${tpl.end_time?.slice(0,5)}`;
    if (!rows[key]) rows[key] = { start: tpl.start_time?.slice(0,5), end: tpl.end_time?.slice(0,5), slots: {} };
    if (!rows[key].slots[tpl.day_of_week]) rows[key].slots[tpl.day_of_week] = [];
    rows[key].slots[tpl.day_of_week].push(b);
  }
  const sorted = Object.values(rows).sort((a, b) => a.start.localeCompare(b.start));

  let html = `<div style="overflow-x:auto"><table class="bindings-table template-table">
    <thead><tr><th class="time-col">Время</th>` + DAYS.map(d => `<th>${d}</th>`).join('') + `</tr></thead><tbody>`;

  for (const row of sorted) {
    const rowKey = row.start + '-' + row.end;
    html += `<tr class="binding-group-row collapsed" data-row="${rowKey}">
    <td class="time-cell toggle-cell">
      <div class="toggle-wrap" onclick="window.toggleBindingRow('${rowKey}')">
        <span class="toggle-icon"><i class="fas fa-chevron-right"></i></span>
        <div class="time-range">${row.start} <span>→</span> ${row.end}</div></div></td>`;
    for (let dow = 0; dow < 7; dow++) {
      const bList = row.slots[dow] || [];
      html += `<td class="day-cell">`;
      if (bList.length) {
        html += `<div class="day-count"><span class="badge badge-info">Камер: ${bList.length}</span></div><div class="binding-pile">`;
        for (const b of bList) {
          const cam = cams.find(c => c.id === b.camera_id);
          const tpl = templates.find(t => t.id === b.template_id);
          html += `<div class="binding-cell ${!tpl?.is_active ? 'inactive' : ''}">
              <div class="binding-cam-name">${escapeHtml(cam?.name || 'Камера #' + b.camera_id)}</div>
              <div class="binding-cam-path">${escapeHtml(cam?.room?.address?.name || '')} → ${escapeHtml(cam?.room?.name || '')}</div>
              <button class="btn btn-icon btn-sm btn-danger" onclick="event.stopPropagation(); window.deleteBinding(${b.id})" title="Удалить"><i class="fas fa-unlink"></i></button>
            </div>`;
        }
        html += `</div>`;
      } else {
        html += `<div class="day-count empty">—</div><div class="binding-pile"></div>`;
      }
      html += `</td>`;
    }
    html += `</tr>`;
  }
  html += `</tbody></table></div>`;
  list.innerHTML = html;
}

window.toggleBindingRow = function(key) {
  const row = document.querySelector(`.binding-group-row[data-row="${key}"]`);
  if (!row) return;
  row.classList.toggle('collapsed');
  const icon = row.querySelector('.toggle-icon i');
  if (icon) icon.className = row.classList.contains('collapsed') ? 'fas fa-chevron-right' : 'fas fa-chevron-down';
};

export async function updateBindingFilters() {
  const opts = await getBindingCascadeOpts();
  cascadeSelects('binding-address-filter', 'binding-room-filter', 'binding-camera-filter', opts);
  attachCascade('binding-address-filter', 'binding-room-filter', 'binding-camera-filter', opts);
}

export async function renderBindingForm(data = {}) {
  const cams = getCameras();
  const data_all = await loadCascadeData();

  const groups = {};
  for (const cam of cams) {
    const addr = cam.room?.address || data_all.addresses.find(a => a.id === cam.room?.address_id);
    const room = cam.room || data_all.rooms.find(r => r.id === cam.room_id);
    const addrName = addr?.name || 'Без адреса';
    const addrId   = addr?.id   || 0;
    const roomName = room?.name || 'Без кабинета';
    const roomId   = room?.id   || 0;
    if (!groups[addrId]) groups[addrId] = { name: addrName, rooms: {} };
    if (!groups[addrId].rooms[roomId]) groups[addrId].rooms[roomId] = { name: roomName, cameras: [] };
    groups[addrId].rooms[roomId].cameras.push(cam);
  }

  let checkboxes = '';
  for (const addr of Object.values(groups).sort((a,b) => a.name.localeCompare(b.name))) {
    checkboxes += `<div style="margin-top:12px;font-weight:600;color:var(--text-secondary);font-size:13px;border-bottom:1px solid rgba(255,255,255,0.05);padding-bottom:4px">${escapeHtml(addr.name)}</div>`;
    for (const room of Object.values(addr.rooms).sort((a,b) => a.name.localeCompare(b.name))) {
      checkboxes += `<div style="margin:8px 0 4px 8px;font-size:13px;color:var(--text-muted)">${escapeHtml(room.name)}</div>`;
      for (const cam of room.cameras) {
        checkboxes += `<label class="camera-checkbox-label"><input type="checkbox" class="bind-camera-cb" value="${cam.id}"><span>${escapeHtml(cam.name)}</span></label>`;
      }
    }
  }

  const templates = await getTemplates();

  return `
    <div class="form-group"><label>Шаблон расписания</label><select id="bind-template"><option value="">Выберите шаблон</option>
      ${templates.map(t => {
        const label = `${escapeHtml(t.name)}  —  ${DAYS[t.day_of_week]}  ${t.start_time?.slice(0,5)}-${t.end_time?.slice(0,5)}`;
        return `<option value="${t.id}" ${data.template_id==t.id?'selected':''}>${label}</option>`;
      }).join('')}
    </select></div>
    <div class="form-group"><label>Камеры для привязки</label>
      <div style="max-height:300px;overflow-y:auto;padding:8px;background:var(--bg-primary);border-radius:8px;border:1px solid rgba(255,255,255,0.1)">
        ${checkboxes}
      </div></div>`;
}

export async function deleteBinding(id) {
  showConfirm('Удалить привязку?', async () => {
    await api(`/schedule_bindings/${id}`, { method: 'DELETE' });
    showToast('Привязка удалена', 'success');
    loadBindings();
  });
}

window.deleteBinding = deleteBinding;