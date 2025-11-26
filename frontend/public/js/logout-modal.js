// Logout Confirmation Modal
function showLogoutModal(event) {
  event.preventDefault();

  // Create modal HTML
  const modal = document.createElement('div');
  modal.id = 'logoutModal';
  modal.className = 'logout-modal-overlay';
  modal.innerHTML = `
    <div class="logout-modal">
      <div class="logout-modal-header">
        <h3>Confirm Logout</h3>
      </div>
      <div class="logout-modal-body">
        <p>Are you sure you want to logout?</p>
      </div>
      <div class="logout-modal-footer">
        <button class="btn-cancel" onclick="closeLogoutModal()">Cancel</button>
        <button class="btn-confirm" onclick="confirmLogout()">Logout</button>
      </div>
    </div>
  `;

  document.body.appendChild(modal);

  // Animate in
  setTimeout(() => {
    modal.classList.add('active');
  }, 10);
}

function closeLogoutModal() {
  const modal = document.getElementById('logoutModal');
  if (modal) {
    modal.classList.remove('active');
    setTimeout(() => {
      modal.remove();
    }, 300);
  }
}

function confirmLogout() {
  // Find the logout form and submit it
  const logoutForm = document.querySelector('form[action="/logout"]');
  if (logoutForm) {
    logoutForm.submit();
  }
}

// Close modal on overlay click
document.addEventListener('click', function(e) {
  if (e.target.classList.contains('logout-modal-overlay')) {
    closeLogoutModal();
  }
});

// Close modal on Escape key
document.addEventListener('keydown', function(e) {
  if (e.key === 'Escape') {
    closeLogoutModal();
  }
});
