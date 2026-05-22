let currentConfirmCallback = null;

export function showConfirm(message, onConfirm) {
  currentConfirmCallback = onConfirm;
  const body = document.getElementById('confirm-body');
  body.innerHTML = `
    <i class="fas fa-exclamation-triangle"></i>
    <p>${message}</p>`;
  document.getElementById('confirm-modal').classList.add('active');
}

window.closeConfirmModal = () => {
  document.getElementById('confirm-modal').classList.remove('active');
  currentConfirmCallback = null;
};

window.execConfirm = async () => {
  if (currentConfirmCallback) {
    try { await currentConfirmCallback(); } catch (e) {}
  }
  closeConfirmModal();
};
