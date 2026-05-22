export let currentTab = 'cameras';
export let editingItem = null;

export const tabsConfig = {
  cameras: { title: 'Камеры', subtitle: 'Управление RTSP-камерами', addBtn: true },
  addresses: { title: 'Адреса', subtitle: 'Управление адресами', addBtn: true },
  rooms: { title: 'Кабинеты', subtitle: 'Управление кабинетами в адресах', addBtn: true },
  profiles: { title: 'Профили доступа', subtitle: 'Управление учетными данными камер', addBtn: true },
  templates: { title: 'Шаблоны расписаний', subtitle: 'Создание и управление шаблонами времени', addBtn: true },
  bindings: { title: 'Привязки', subtitle: 'Назначение шаблонов на камеры', addBtn: true },
  recordings: { title: 'Записи', subtitle: 'Управление архивом записей', addBtn: false }
};

export function setTab(tab) { currentTab = tab; }
export function setEditingItem(item) { editingItem = item; }
export function getCurrentTab() { return currentTab; }
export function getEditingItem() { return editingItem; }