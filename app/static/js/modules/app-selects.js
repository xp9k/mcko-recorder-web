import { escapeHtml } from './api.js';

function refreshCustomSelect(selectEl) {
  const wrapper = selectEl?.closest('.custom-select');
  if (wrapper && wrapper.refresh) wrapper.refresh();
}

export function populateSelect(selectEl, items, selectedId, placeholder = 'Выберите...', valueField = 'id', labelField = 'name') {
  if (!selectEl) return;
  const targetValue = (selectedId !== null && selectedId !== undefined && selectedId !== '') ? String(selectedId) : '';
  selectEl.innerHTML = `<option value="">${escapeHtml(placeholder)}</option>` + items.map(item =>
    `<option value="${item[valueField]}" ${String(item[valueField]) === targetValue ? 'selected' : ''}>${escapeHtml(item[labelField])}</option>`
  ).join('');
  refreshCustomSelect(selectEl);
}

export function resetSelect(selectEl, placeholder) {
  if (selectEl) {
    selectEl.innerHTML = `<option value="">${escapeHtml(placeholder)}</option>`;
    selectEl.disabled = true;
    refreshCustomSelect(selectEl);
  }
}

/*
  Universal cascade: address → room → camera
  
  opts.data: { addresses, rooms, cameras } — required
  opts.activeOnly: filter cameras by is_active
  opts.placeholders: { address, room, camera }
  opts.init: { address, room, camera } — initial selected values
  opts.onAddrChange, opts.onRoomChange, opts.onCamChange: callbacks
  
  Rules:
  - No address → rooms disabled, cameras disabled
  - Address selected → rooms filled & enabled, cameras disabled
  - Room selected → cameras filled & enabled
*/
function applyCascade(addrSel, roomSel, camSel, opts) {
  const data = opts.data;
  const addresses = data ? data.addresses : [];
  const rooms = data ? data.rooms : [];
  const cameras = data ? data.cameras : [];

  const phAddr = opts.placeholders?.address || 'Все адреса';
  const phRoom = opts.placeholders?.room || 'Все кабинеты';
  const phCam  = opts.placeholders?.camera || 'Все камеры';

  const addrVal = opts.init?.address || (addrSel ? String(addrSel.value) : '');
  const roomVal = opts.init?.room || (roomSel ? String(roomSel.value) : '');
  const camVal  = opts.init?.camera || (camSel ? String(camSel.value) : '');

  delete opts.init;

  if (addrSel) {
    populateSelect(addrSel, addresses, addrVal, phAddr);
    addrSel.disabled = false;
  }

  if (roomSel) {
    if (addrVal) {
      const filtered = rooms.filter(r => r.address_id == addrVal);
      populateSelect(roomSel, filtered, roomVal, phRoom);
      roomSel.disabled = false;
    } else {
      resetSelect(roomSel, phRoom);
    }
  }

  if (camSel) {
    if (addrVal && roomVal) {
      let filtered = opts.activeOnly ? cameras.filter(c => c.is_active) : [...cameras];
      filtered = filtered.filter(c => c.room_id == roomVal && (c.room?.address?.id == addrVal || c.room?.address_id == addrVal));
      populateSelect(camSel, filtered, camVal, phCam);
      camSel.disabled = false;
    } else if (addrVal && !roomVal) {
      resetSelect(camSel, phCam);
    } else {
      resetSelect(camSel, phCam);
    }
  }
}

export function cascadeSelects(addrSel, roomSel, camSel, opts = {}) {
  const addrEl = typeof addrSel === 'string' ? document.getElementById(addrSel) : addrSel;
  const roomEl = typeof roomSel === 'string' ? document.getElementById(roomSel) : roomSel;
  const camEl  = typeof camSel === 'string' ? document.getElementById(camSel) : camSel;
  applyCascade(addrEl, roomEl, camEl, opts);
}

export function attachCascade(addrId, roomId, camId, opts = {}) {
  const addrSel = document.getElementById(addrId);
  const roomSel = document.getElementById(roomId);
  const camSel = camId ? document.getElementById(camId) : null;

  const onAddrChange = opts.onAddrChange || null;
  const onRoomChange = opts.onRoomChange || null;
  const onCamChange = opts.onCamChange || null;

  if (addrSel) {
    addrSel.addEventListener('change', () => {
      if (roomSel) { roomSel.value = ''; }
      if (camSel)  { camSel.value = ''; }
      applyCascade(addrSel, roomSel, camSel, opts);
      if (onAddrChange) onAddrChange();
    });
  }
  if (roomSel) {
    roomSel.addEventListener('change', () => {
      if (camSel) { camSel.value = ''; }
      applyCascade(addrSel, roomSel, camSel, opts);
      if (onRoomChange) onRoomChange();
    });
  }
  if (camSel && onCamChange) {
    camSel.addEventListener('change', () => {
      onCamChange();
    });
  }

  applyCascade(addrSel, roomSel, camSel, opts);
}