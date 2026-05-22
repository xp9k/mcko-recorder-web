let openDropdown = null;

function closeAllDropdowns() {
  if (openDropdown) {
    openDropdown.classList.remove('open');
    openDropdown = null;
  }
}

document.addEventListener('click', (e) => {
  if (openDropdown && !openDropdown.contains(e.target)) {
    closeAllDropdowns();
  }
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') closeAllDropdowns();
});

function wrapSelect(nativeSelect) {
  if (nativeSelect._customWrapped) return;
  nativeSelect._customWrapped = true;

  const wrapper = document.createElement('div');
  wrapper.className = 'custom-select';
  if (nativeSelect.disabled) wrapper.classList.add('disabled');

  const trigger = document.createElement('div');
  trigger.className = 'custom-select__trigger';
  trigger.setAttribute('tabindex', '0');
  trigger.setAttribute('role', 'combobox');
  trigger.setAttribute('aria-haspopup', 'listbox');

  const valueSpan = document.createElement('span');
  valueSpan.className = 'custom-select__value';
  trigger.appendChild(valueSpan);

  const arrow = document.createElement('span');
  arrow.className = 'custom-select__arrow';
  arrow.innerHTML = '<i class="fas fa-chevron-down"></i>';
  trigger.appendChild(arrow);

  const dropdown = document.createElement('div');
  dropdown.className = 'custom-select__dropdown';
  dropdown.setAttribute('role', 'listbox');

  const list = document.createElement('div');
  list.className = 'custom-select__list';
  dropdown.appendChild(list);

  wrapper.appendChild(trigger);
  wrapper.appendChild(dropdown);

  if (nativeSelect.parentNode) {
    nativeSelect.parentNode.insertBefore(wrapper, nativeSelect);
  }
  wrapper.appendChild(nativeSelect);
  nativeSelect.style.display = 'none';

  function updateValue() {
    const selected = nativeSelect.options[nativeSelect.selectedIndex];
    if (selected) {
      valueSpan.textContent = selected.text;
      valueSpan.title = selected.text;
    }
    trigger.setAttribute('aria-expanded', wrapper.classList.contains('open') ? 'true' : 'false');
  }

  function buildOptions() {
    list.innerHTML = '';
    Array.from(nativeSelect.options).forEach((opt, idx) => {
      if (opt.disabled && !opt.value) return;
      const item = document.createElement('div');
      item.className = 'custom-select__option' + (opt.selected ? ' selected' : '');
      item.textContent = opt.text;
      item.setAttribute('role', 'option');
      item.setAttribute('data-value', opt.value);
      if (opt.selected) item.setAttribute('aria-selected', 'true');

      item.addEventListener('click', (e) => {
        e.stopPropagation();
        nativeSelect.selectedIndex = idx;
        nativeSelect.dispatchEvent(new Event('change', { bubbles: true }));
        updateValue();
        buildOptions();
        closeAllDropdowns();
      });

      list.appendChild(item);
    });
  }

  trigger.addEventListener('click', (e) => {
    e.stopPropagation();
    if (wrapper.classList.contains('disabled')) return;
    if (openDropdown === wrapper) {
      closeAllDropdowns();
      return;
    }
    closeAllDropdowns();
    wrapper.classList.add('open');
    openDropdown = wrapper;
    updateValue();
    const selected = list.querySelector('.selected');
    if (selected) selected.scrollIntoView({ block: 'nearest' });
  });

  trigger.addEventListener('keydown', (e) => {
    if (['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(e.key)) {
      e.preventDefault();
      if (!wrapper.classList.contains('open')) {
        closeAllDropdowns();
        wrapper.classList.add('open');
        openDropdown = wrapper;
        updateValue();
        return;
      }
    }

    const options = Array.from(nativeSelect.options).filter(o => !o.disabled || o.value);
    let idx = options.findIndex(o => o.value === nativeSelect.value);

    if (e.key === 'ArrowDown' && idx < options.length - 1) {
      nativeSelect.value = options[idx + 1].value;
      nativeSelect.dispatchEvent(new Event('change', { bubbles: true }));
      updateValue();
      buildOptions();
    } else if (e.key === 'ArrowUp' && idx > 0) {
      nativeSelect.value = options[idx - 1].value;
      nativeSelect.dispatchEvent(new Event('change', { bubbles: true }));
      updateValue();
      buildOptions();
    } else if (e.key === 'Enter' || e.key === ' ') {
      closeAllDropdowns();
    }
  });

  const observer = new MutationObserver(() => {
    if (nativeSelect.disabled) wrapper.classList.add('disabled');
    else wrapper.classList.remove('disabled');
    updateValue();
    buildOptions();
  });
  observer.observe(nativeSelect, { childList: true, subtree: true, attributes: true });

  wrapper.refresh = () => {
    updateValue();
    buildOptions();
  };

  updateValue();
  buildOptions();
}

export function initCustomSelects(container = document) {
  if (!container) return;
  container.querySelectorAll('select').forEach(sel => {
    if (sel.closest('.custom-select')) return;
    wrapSelect(sel);
  });
}