// Recommendations page functionality

document.addEventListener('DOMContentLoaded', function() {
  
  // Tab switching
  const tabs = document.querySelectorAll('.tab-btn');
  const scholarshipCards = document.querySelectorAll('.scholarship-card');

  tabs.forEach(tab => {
    tab.addEventListener('click', function() {
      const category = this.dataset.category;
      
      // Update active tab
      tabs.forEach(t => t.classList.remove('active'));
      this.classList.add('active');
      
      // Filter cards
      filterCards(category);
    });
  });

  function filterCards(category) {
    scholarshipCards.forEach(card => {
      if (category === 'all') {
        card.style.display = 'block';
      } else {
        const cardCategory = card.dataset.category;
        card.style.display = cardCategory === category ? 'block' : 'none';
      }
    });
  }

  // Sort functionality
  const sortSelect = document.getElementById('sortBy');
  if (sortSelect) {
    sortSelect.addEventListener('change', function() {
      const sortValue = this.value;
      sortScholarships(sortValue);
    });
  }

  function sortScholarships(sortBy) {
    const grid = document.querySelector('.scholarships-grid');
    const cards = Array.from(grid.querySelectorAll('.scholarship-card'));

    cards.sort((a, b) => {
      switch(sortBy) {
        case 'match':
          return parseFloat(b.dataset.match) - parseFloat(a.dataset.match);
        case 'deadline':
          return new Date(a.dataset.deadline) - new Date(b.dataset.deadline);
        case 'slots':
          return parseInt(b.dataset.slots) - parseInt(a.dataset.slots);
        default:
          return 0;
      }
    });

    // Re-append cards in new order
    cards.forEach(card => grid.appendChild(card));
  }

  // Apply button handlers
  const applyButtons = document.querySelectorAll('.btn-apply');
  applyButtons.forEach(btn => {
    btn.addEventListener('click', function(e) {
      const scholarshipId = this.dataset.scholarshipId;
      if (confirm('Are you sure you want to apply for this scholarship?')) {
        applyForScholarship(scholarshipId);
      }
    });
  });

  function applyForScholarship(scholarshipId) {
    // You can use fetch API or form submission
    fetch(`/student/apply/${scholarshipId}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      }
    })
    .then(response => response.json())
    .then(data => {
      if (data.success) {
        alert('Application submitted successfully!');
        window.location.href = '/student/my-applications';
      } else {
        alert('Error: ' + data.message);
      }
    })
    .catch(error => {
      console.error('Error:', error);
      alert('An error occurred. Please try again.');
    });
  }

  // Search functionality
  const searchInput = document.getElementById('searchScholarships');
  if (searchInput) {
    searchInput.addEventListener('input', function() {
      const searchTerm = this.value.toLowerCase();
      
      scholarshipCards.forEach(card => {
        const title = card.querySelector('.card-title').textContent.toLowerCase();
        const org = card.querySelector('.card-organization').textContent.toLowerCase();
        
        if (title.includes(searchTerm) || org.includes(searchTerm)) {
          card.style.display = 'block';
        } else {
          card.style.display = 'none';
        }
      });
    });
  }
});