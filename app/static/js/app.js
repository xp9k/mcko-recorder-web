import { api, showToast } from './modules/api.js';
import { setTab, setEditingItem, tabsConfig, getCurrentTab, getEditingItem } from './modules/state.js';
import { initCustomSelects } from './modules/custom-select.js';
import { attachCascade } from './modules/app-selects.js';
import { loadCascadeData, getProfiles } from './modules/app-data.js';

import { loadAddresses, renderAddresses } from './modules/addresses.js';
import { loadRooms } from './modules/rooms.js';
import { loadProfiles, renderProfiles } from './modules/profiles.js';
import { loadCameras, renderCameraForm } from './modules/cameras.js';
import { loadTemplates, renderTemplateForm } from './modules/schedule_templates.js';
import { loadBindings } from './modules/schedule_bindings.js';
import { loadRecordings } from './modules/recordings.js';
import { initRouter, navigateTo } from './router.js';

window.tabsConfig = tabsConfig;
window.navigateTo = navigateTo;
window.refreshCurrentTab = refreshCurrentTab;
window.openModal = openModal;
window.closeModal = closeModal;
window.saveModal = saveModal;
window.toggleSidebar = () => {
  const sb = document.querySelector('.sidebar');
  if (sb) sb.classList.toggle('open');
};

function refreshCurrentTab() {
  const btn = document.querySelector('.btn-refresh');
  btn.classList.add('spinning');
  const tab = getCurrentTab();
  if (tab === 'cameras') loadCameras();
  else if (tab === 'addresses') loadAddresses().then(renderAddresses);
  else if (tab === 'rooms') loadRooms();
  else if (tab === 'profiles') loadProfiles().then(renderProfiles);
  else if (tab === 'templates') loadTemplates();
  else if (tab === 'bindings') loadBindings();
  else if (tab === 'recordings') loadRecordings();
  setTimeout(() => btn.classList.remove('spinning'), 1000);
}

async function openModal(type = null) {
  const tab = type || getCurrentTab();
  setEditingItem(null);
  const modal = document.getElementById('modal');
  const title = document.getElementById('modal-title');
  const body = document.getElementById('modal-body');

  if (tab === 'cameras') {
    title.textContent = 'Добавить камеру';
    body.innerHTML = renderCameraForm();
    const profiles = await getProfiles();
    const profileSel = document.getElementById('cam-profile');
    if (profileSel) {
      profileSel.innerHTML = '<option value="">Без профиля</option>' + profiles.map(p =>
        `<option value="${p.id}">${p.name} (${p.username})</option>`
      ).join('');
    }
  } else if (tab === 'addresses') {
    title.textContent = 'Добавить адрес';
    body.innerHTML = (await import('./modules/addresses.js')).renderAddressForm();
  } else if (tab === 'rooms') {
    title.textContent = 'Добавить кабинет';
    const { renderRoomForm } = await import('./modules/rooms.js');
    body.innerHTML = await renderRoomForm();
  } else if (tab === 'profiles') {
    title.textContent = 'Добавить профиль';
    body.innerHTML = (await import('./modules/profiles.js')).renderProfileForm();
  } else if (tab === 'templates') {
    title.textContent = 'Добавить шаблон';
    body.innerHTML = renderTemplateForm();
  } else if (tab === 'bindings') {
    title.textContent = 'Добавить привязки';
    body.innerHTML = await (await import('./modules/schedule_bindings.js')).renderBindingForm();
  }
  initCustomSelects(body);
  if (tab === 'cameras') {
    const cascadeData = await loadCascadeData();
    attachCascade('cam-address', 'cam-room', null, {
      data: cascadeData,
      placeholders: { address: 'Выберите адрес', room: 'Выберите кабинет' }
    });
  }
  modal.classList.add('active');
}

function closeModal() {
  document.getElementById('modal').classList.remove('active');
  setEditingItem(null);
}

async function saveModal() {
  const editingItem = getEditingItem();
  const tab = getCurrentTab();

  if (tab === 'cameras') {
    const body = {
      name: document.getElementById('cam-name').value.trim(),
      ip_address: document.getElementById('cam-ip').value.trim(),
      port: parseInt(document.getElementById('cam-port').value) || 554,
      stream_path: document.getElementById('cam-path').value.trim() || '/',
      description: document.getElementById('cam-desc').value.trim(),
      is_active: document.getElementById('cam-active').checked,
      profile_id: parseInt(document.getElementById('cam-profile').value) || null,
      room_id: parseInt(document.getElementById('cam-room').value) || null
    };
    if (!body.name || !body.ip_address) return showToast('Заполните обязательные поля', 'warning');
    if (!body.room_id) return showToast('Выберите адрес и кабинет', 'warning');
    if (editingItem) {
      await api(`/cameras/${editingItem.id}`, { method: 'PATCH', body });
      showToast('Камера обновлена', 'success');
    } else {
      await api('/cameras', { method: 'POST', body });
      showToast('Камера добавлена', 'success');
    }
    closeModal(); loadCameras();
  } else if (tab === 'addresses') {
    const formData = { name: document.getElementById('addr-name').value.trim() };
    if (!formData.name) return showToast('Введите название адреса', 'warning');
    if (editingItem) {
      await api(`/addresses/${editingItem.id}`, { method: 'PATCH', body: formData });
      showToast('Адрес обновлен', 'success');
    } else {
      await api('/addresses', { method: 'POST', body: formData });
      showToast('Адрес добавлен', 'success');
    }
    closeModal(); navigateTo('addresses');
  } else if (tab === 'rooms') {
    const formData = {
      address_id: parseInt(document.getElementById('room-address').value),
      name: document.getElementById('room-name').value.trim()
    };
    if (!formData.address_id || !formData.name) return showToast('Заполните все поля', 'warning');
    if (editingItem) {
      await api(`/rooms/${editingItem.id}`, { method: 'PATCH', body: formData });
      showToast('Кабинет обновлен', 'success');
    } else {
      await api('/rooms', { method: 'POST', body: formData });
      showToast('Кабинет добавлен', 'success');
    }
    closeModal(); navigateTo('rooms');
  } else if (tab === 'profiles') {
    const formData = {
      name: document.getElementById('prof-name').value.trim(),
      username: document.getElementById('prof-user').value.trim(),
      password: document.getElementById('prof-pass').value
    };
    if (!formData.name || !formData.username || !formData.password) return showToast('Заполните все поля', 'warning');
    if (editingItem) {
      await api(`/profiles/${editingItem.id}`, { method: 'PATCH', body: formData });
      showToast('Профиль обновлен', 'success');
    } else {
      await api('/profiles', { method: 'POST', body: formData });
      showToast('Профиль добавлен', 'success');
    }
    closeModal(); navigateTo('profiles');
  } else if (tab === 'templates') {
    const formData = {
      name: document.getElementById('tpl-name').value.trim(),
      day_of_week: parseInt(document.getElementById('tpl-day').value),
      start_time: document.getElementById('tpl-start').value + ':00',
      end_time: document.getElementById('tpl-end').value + ':00',
      is_active: document.getElementById('tpl-active').checked
    };
    if (!formData.name) return showToast('Введите название шаблона', 'warning');
    if (formData.start_time >= formData.end_time) return showToast('Время начала должно быть раньше окончания', 'warning');
    if (editingItem) {
      await api(`/schedule_templates/${editingItem.id}`, { method: 'PATCH', body: formData });
      showToast('Шаблон обновлен', 'success');
    } else {
      await api('/schedule_templates', { method: 'POST', body: formData });
      showToast('Шаблон добавлен', 'success');
    }
    closeModal(); loadTemplates();
  } else if (tab === 'bindings') {
    const templateId = parseInt(document.getElementById('bind-template').value);
    if (!templateId) return showToast('Выберите шаблон', 'warning');

    const checkedBoxes = document.querySelectorAll('.bind-camera-cb:checked');
    const cameraIds = Array.from(checkedBoxes).map(cb => parseInt(cb.value));
    if (!cameraIds.length) return showToast('Выберите хотя бы одну камеру', 'warning');

    let created = 0;
    for (const cameraId of cameraIds) {
      try {
        await api('/schedule_bindings', { method: 'POST', body: { template_id: templateId, camera_id: cameraId } });
        created++;
      } catch (e) {
        // probably duplicate binding, skip
      }
    }
    showToast(`${created} привязок добавлено`, 'success');
    closeModal(); loadBindings();
  }
}

document.getElementById('modal').addEventListener('click', (e) => {
  if (e.target.id === 'modal') closeModal();
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') closeModal();
});

document.addEventListener('DOMContentLoaded', () => {
  initRouter();
});