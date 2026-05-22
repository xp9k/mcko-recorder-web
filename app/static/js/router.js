import { setTab } from './modules/state.js';
import { initCustomSelects } from './modules/custom-select.js';
import { loadCameras } from './modules/cameras.js';
import { renderAddresses, loadAddresses } from './modules/addresses.js';
import { loadRooms } from './modules/rooms.js';
import { renderProfiles, loadProfiles } from './modules/profiles.js';
import { loadTemplates } from './modules/schedule_templates.js';
import { loadBindings } from './modules/schedule_bindings.js';
import { loadRecordings } from './modules/recordings.js';

const PAGE_MAP = {
  cameras: '/static/pages/cameras.html',
  addresses: '/static/pages/addresses.html',
  rooms: '/static/pages/rooms.html',
  profiles: '/static/pages/profiles.html',
  templates: '/static/pages/templates.html',
  bindings: '/static/pages/bindings.html',
  recordings: '/static/pages/recordings.html',
};

async function loadPageHTML(tab) {
  const url = PAGE_MAP[tab];
  if (!url) return '';
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Failed to load ${tab}`);
    return await res.text();
  } catch (e) {
    console.error(`Error loading page ${tab}:`, e);
    return '';
  }
}

export async function navigateTo(tab) {
  setTab(tab);

  const html = await loadPageHTML(tab);
  if (!html) return;

  document.querySelectorAll('.custom-select.open').forEach(el => el.classList.remove('open'));

  const wrapper = document.getElementById('page-content');
  wrapper.innerHTML = html;

  document.querySelectorAll('.menu-item').forEach(i => i.classList.remove('active'));
  const navItem = document.querySelector(`[data-tab="${tab}"]`);
  if (navItem) navItem.classList.add('active');

  const config = window.tabsConfig ? window.tabsConfig[tab] : null;
  const titleEl = document.getElementById('page-title');
  const subtitleEl = document.querySelector('.subtitle');
  const addBtn = document.getElementById('add-btn');
  if (config) {
    if (titleEl) titleEl.textContent = config.title;
    if (subtitleEl) subtitleEl.textContent = config.subtitle;
    if (addBtn) addBtn.style.display = config.addBtn ? 'flex' : 'none';
  }

  window.history.replaceState(null, '', `#${tab}`);

  await activateTab(tab);
}

async function activateTab(tab) {
  initCustomSelects(document.getElementById('page-content'));

  if (tab === 'cameras') loadCameras();
  else if (tab === 'addresses') { await loadAddresses(); renderAddresses(); }
  else if (tab === 'rooms') loadRooms();
  else if (tab === 'profiles') { await loadProfiles(); renderProfiles(); }
  else if (tab === 'templates') loadTemplates();
  else if (tab === 'bindings') loadBindings();
  else if (tab === 'recordings') loadRecordings();
}

export function initRouter() {
  document.querySelectorAll('.menu-item').forEach(item => {
    item.addEventListener('click', (e) => {
      e.preventDefault();
      navigateTo(item.dataset.tab);
      const sb = document.querySelector('.sidebar');
      if (sb && sb.classList.contains('open')) sb.classList.remove('open');
    });
  });

  const hash = window.location.hash.replace('#', '') || 'cameras';
  navigateTo(hash);
}