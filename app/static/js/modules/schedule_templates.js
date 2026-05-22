import { api, escapeHtml, renderEmpty, showToast } from './api.js';
import { setEditingItem } from './state.js';
import { showConfirm } from './confirm.js';
import { DAYS } from './app-data.js';

let templates = [];

export function renderTemplateTable(tpls) {
  const rows = {};
  for (const tpl of tpls) {
    const key = `${tpl.start_time?.slice(0,5)} - ${tpl.end_time?.slice(0,5)}`;
    if (!rows[key]) rows[key] = { start: tpl.start_time?.slice(0,5), end: tpl.end_time?.slice(0,5), slots: {} };
    rows[key].slots[tpl.day_of_week] = tpl;
  }
  const sorted = Object.values(rows).sort((a, b) => a.start.localeCompare(b.start));

  let html = `<table class="template-table">
    <thead>
      <tr><th class="time-col">Время</th>` + DAYS.map(d => `<th>${d}</th>`).join('') + `</tr>
    </thead>
    <tbody>`;

  for (const row of sorted) {
    html += `
      <tr>
        <td class="time-cell"><div class="time-range">${row.start} <span>→</span> ${row.end}</div></td>`;
    for (let dow = 0; dow < 7; dow++) {
      const tpl = row.slots[dow];
      if (tpl) {
        html += `
          <td class="day-cell">
            <div class="tpl-cell ${!tpl.is_active ? 'inactive' : ''}">
              <div class="tpl-name">${escapeHtml(tpl.name)}</div>
              <span class="badge ${tpl.is_active ? 'badge-success' : 'badge-danger'}">${tpl.is_active ? 'Активен' : 'Выкл'}</span>
              <div class="tpl-actions">
                <button class="btn btn-icon btn-sm" onclick="window.editTemplate(${tpl.id})" title="Редактировать"><i class="fas fa-edit"></i></button>
                <button class="btn btn-icon btn-sm btn-danger" onclick="window.deleteTemplate(${tpl.id})" title="Удалить"><i class="fas fa-trash"></i></button>
              </div>
            </div>
          </td>`;
      } else {
        html += `<td class="day-cell empty"></td>`;
      }
    }
    html += `</tr>`;
  }

  html += `</tbody></table>`;
  return html;
}

export async function loadTemplates() {
  try { templates = await api('/schedule_templates'); } catch { templates = []; }

  const list = document.getElementById('templates-list');
  if (!list) return;
  if (!templates.length) {
    list.innerHTML = renderEmpty('Нет шаблонов', 'Добавьте первый шаблон расписания');
  } else {
    list.innerHTML = renderTemplateTable(templates);
  }
}

export function renderTemplateForm(data = {}) {
  return `
    <div class="form-group"><label>Название шаблона</label>
    <input type="text" id="tpl-name" value="${escapeHtml(data.name || '')}" placeholder="Утреннее расписание"></div>
    <div class="form-group"><label>День недели</label>
    <select id="tpl-day">
      <option value="0" ${data.day_of_week===0?'selected':''}>Понедельник</option>
      <option value="1" ${data.day_of_week===1?'selected':''}>Вторник</option>
      <option value="2" ${data.day_of_week===2?'selected':''}>Среда</option>
      <option value="3" ${data.day_of_week===3?'selected':''}>Четверг</option>
      <option value="4" ${data.day_of_week===4?'selected':''}>Пятница</option>
      <option value="5" ${data.day_of_week===5?'selected':''}>Суббота</option>
      <option value="6" ${data.day_of_week===6?'selected':''}>Воскресенье</option>
    </select></div>
    <div class="form-row">
      <div class="form-group"><label>Время начала</label><input type="time" id="tpl-start" value="${data.start_time?.slice(0,5) || '09:00'}"></div>
      <div class="form-group"><label>Время окончания</label><input type="time" id="tpl-end" value="${data.end_time?.slice(0,5) || '18:00'}"></div>
    </div>
    <div class="form-group checkbox-wrapper"><input type="checkbox" id="tpl-active" ${data.is_active !== false ? 'checked' : ''}><label for="tpl-active">Шаблон активен</label></div>`;
}

export async function editTemplate(id) {
  const tpl = templates.find(t => t.id === id);
  if (!tpl) return;
  setEditingItem(tpl);
  document.getElementById('modal-title').textContent = 'Редактировать шаблон';
  const body = document.getElementById('modal-body');
  body.innerHTML = renderTemplateForm(tpl);
  const { initCustomSelects } = await import('./custom-select.js');
  initCustomSelects(body);
  document.getElementById('modal').classList.add('active');
}

export async function deleteTemplate(id) {
  showConfirm('Удалить шаблон? Все привязки к камерам будут удалены.', async () => {
    await api(`/schedule_templates/${id}`, { method: 'DELETE' });
    showToast('Шаблон удален', 'success');
    loadTemplates();
  });
}

window.editTemplate = editTemplate;
window.deleteTemplate = deleteTemplate;