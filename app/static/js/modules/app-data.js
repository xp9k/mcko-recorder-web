import { api } from './api.js';

export const DAYS = ['Пн','Вт','Ср','Чт','Пт','Сб','Вс'];

const _cache = {};

async function cachedFetch(key, url) {
  if (!_cache[key]) {
    _cache[key] = api(url).catch(() => []);
  }
  return _cache[key];
}

export function invalidateCache() {
  Object.keys(_cache).forEach(k => delete _cache[k]);
}

export async function getAddresses() {
  return cachedFetch('addresses', '/addresses');
}

export async function getRooms() {
  return cachedFetch('rooms', '/rooms');
}

export async function getCameras() {
  return cachedFetch('cameras', '/cameras');
}

export async function getTemplates() {
  return cachedFetch('templates', '/schedule_templates');
}

export async function getProfiles() {
  return cachedFetch('profiles', '/profiles');
}

export async function loadCascadeData() {
  const [addresses, rooms, cameras] = await Promise.all([getAddresses(), getRooms(), getCameras()]);
  return { addresses, rooms, cameras };
}