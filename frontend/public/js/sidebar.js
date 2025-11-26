// Sidebar Toggle Functionality
function toggleSidebar() {
  const sidebar = document.getElementById('sidebar');
  const overlay = document.getElementById('sidebarOverlay');

  // On desktop, toggle closed class (mini/icon mode)
  if (window.innerWidth > 1024) {
    sidebar.classList.toggle('closed');
  } else {
    // On mobile, toggle active class (slide in/out)
    sidebar.classList.toggle('active');
    overlay.classList.toggle('active');
  }
}

// Initialize on page load
document.addEventListener('DOMContentLoaded', function() {
  const sidebar = document.getElementById('sidebar');
  const overlay = document.getElementById('sidebarOverlay');

  // Set active link based on current path
  const currentPath = window.location.pathname;
  const navLinks = document.querySelectorAll('.nav-link');

  navLinks.forEach(link => {
    if (link.getAttribute('href') === currentPath) {
      link.classList.add('active');
    }
  });

  // Handle window resize
  window.addEventListener('resize', function() {
    if (window.innerWidth > 1024) {
      // Desktop: remove mobile classes
      overlay.classList.remove('active');
      sidebar.classList.remove('active');
    } else {
      // Mobile: remove desktop closed class, hide sidebar by default
      sidebar.classList.remove('closed');
      sidebar.classList.remove('active');
      overlay.classList.remove('active');
    }
  });
});

// Notification dropdown (placeholder for future functionality)
document.addEventListener('DOMContentLoaded', function() {
  const notificationBtn = document.querySelector('.notification-btn');

  if (notificationBtn) {
    notificationBtn.addEventListener('click', function(e) {
      e.stopPropagation();
      // Add notification dropdown functionality here
      console.log('Notifications clicked');
    });
  }
});
