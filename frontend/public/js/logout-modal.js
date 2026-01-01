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
        <div class="logout-modal-icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
            <polyline points="16 17 21 12 16 7"/>
            <line x1="21" y1="12" x2="9" y2="12"/>
          </svg>
        </div>
        <h3>Sign Out</h3>
        <p>You're about to leave your session</p>
      </div>
      <div class="logout-modal-body">
        <p>Are you sure you want to sign out of your account? You'll need to log in again to access your dashboard.</p>
        <div class="logout-info">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="12" r="10"/>
            <line x1="12" y1="16" x2="12" y2="12"/>
            <line x1="12" y1="8" x2="12.01" y2="8"/>
          </svg>
          Your saved data will remain secure
        </div>
      </div>
      <div class="logout-modal-footer">
        <button class="btn-cancel" onclick="closeLogoutModal()">Cancel</button>
        <button class="btn-confirm" onclick="confirmLogout()">Sign Out</button>
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
