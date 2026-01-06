



// Toggle mobile menu
function toggleMenu() {
  const menu = document.getElementById('navbarMenu');
  menu.classList.toggle('active');
}

// Close menu when clicking outside
document.addEventListener('click', function(event) {
  const menu = document.getElementById('navbarMenu');
  const toggle = document.querySelector('.menu-toggle');
  
  if (menu && toggle && !menu.contains(event.target) && !toggle.contains(event.target)) {
    menu.classList.remove('active');
  }
});

// Highlight active page
document.addEventListener('DOMContentLoaded', function() {
  const currentPath = window.location.pathname;
  const links = document.querySelectorAll('.navbar-menu a:not(.logout-btn)');
  
  links.forEach(link => {
    if (link.getAttribute('href') === currentPath) {
      link.classList.add('active');
    }
  });
});