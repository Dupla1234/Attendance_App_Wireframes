document.addEventListener('DOMContentLoaded', () => {
  const timeEl = document.getElementById('current-time');
  const headerTimeEl = document.getElementById('header-time');

  const updateClock = () => {
    const now = new Date();
    const label = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    if (timeEl) timeEl.textContent = label;
    if (headerTimeEl) headerTimeEl.textContent = label;
  };

  updateClock();
  setInterval(updateClock, 30000);

  const loginForm = document.getElementById('login-form');
  if (loginForm) {
    loginForm.addEventListener('submit', (event) => {
      event.preventDefault();
      window.location.href = 'dashboard.html';
    });
  }

  const clockButton = document.getElementById('clock-button');
  if (clockButton) {
    clockButton.addEventListener('click', () => {
      const isClocked = clockButton.classList.toggle('clocked');
      const label = clockButton.querySelector('.label');
      if (label) {
        label.textContent = isClocked ? 'CLOCKED IN' : 'CLOCK IN';
      }
      const sub = clockButton.querySelector('.sub');
      if (sub) {
        sub.textContent = isClocked ? 'Shift active' : 'Tap to record your start time';
      }
    });
  }

  const navItems = document.querySelectorAll('.nav-item');
  navItems.forEach((item) => {
    item.addEventListener('click', () => {
      navItems.forEach((n) => n.classList.remove('active'));
      item.classList.add('active');
    });
  });
});
