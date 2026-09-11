document.addEventListener('DOMContentLoaded', () => {
  const pendingCheckInKey = 'attendancePro.pendingCheckIn';
  const attendanceHistoryKey = 'attendancePro.attendanceHistory';
  const currentRoleKey = 'attendancePro.currentRole';
  const currentUserKey = 'attendancePro.currentUser';
  const usersKey = 'attendancePro.users';
  const lastLocationAttemptKey = 'attendancePro.lastLocationAttempt';
  const branchLocationKey = 'attendancePro.branchLocation';
  const defaultBranchLocation = { latitude: -25.8603, longitude: 28.1871, radiusMeters: 100 };
  const savedBranchLocation = JSON.parse(localStorage.getItem(branchLocationKey) || 'null');
  const branchLocation = savedBranchLocation || defaultBranchLocation;
  if (branchLocation.radiusMeters === 50) {
    branchLocation.radiusMeters = 100;
    localStorage.setItem(branchLocationKey, JSON.stringify(branchLocation));
  }
  const defaultUsers = [
    { name: 'Demo Employee', id: 'EMP-1001', password: 'Employee@123', email: 'employee@demo.com', branch: 'HQ - Centurion', role: 'employee', rights: ['dashboard', 'history', 'profile'] },
    { name: 'Demo Administrator', id: 'ADMIN-0001', password: 'Admin@123', email: 'admin@demo.com', branch: 'All branches', role: 'admin', rights: ['dashboard', 'history', 'profile', 'reports', 'employees'] }
  ];

  const readHistory = () => JSON.parse(localStorage.getItem(attendanceHistoryKey) || '[]');
  const saveHistory = (history) => localStorage.setItem(attendanceHistoryKey, JSON.stringify(history));
  const readUsers = () => JSON.parse(localStorage.getItem(usersKey) || '[]');
  const saveUsers = (users) => localStorage.setItem(usersKey, JSON.stringify(users));

  const calculateDistance = (latitude, longitude) => {
    const earthRadius = 6371000;
    const toRadians = (value) => value * Math.PI / 180;
    const latitudeDelta = toRadians(latitude - branchLocation.latitude);
    const longitudeDelta = toRadians(longitude - branchLocation.longitude);
    const latitudeOne = toRadians(branchLocation.latitude);
    const latitudeTwo = toRadians(latitude);
    const haversine = Math.sin(latitudeDelta / 2) ** 2
      + Math.cos(latitudeOne) * Math.cos(latitudeTwo) * Math.sin(longitudeDelta / 2) ** 2;
    return Math.round(earthRadius * 2 * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine)));
  };

  const pinLocationButton = document.querySelector('[data-pin-current-location]');
  const pinLocationFeedback = document.querySelector('[data-pin-location-feedback]');
  if (pinLocationButton && pinLocationFeedback) {
    pinLocationButton.addEventListener('click', () => {
      if (!navigator.geolocation) {
        pinLocationFeedback.textContent = 'This browser does not support GPS location.';
        return;
      }

      pinLocationButton.disabled = true;
      pinLocationButton.textContent = 'Reading current location...';
      navigator.geolocation.getCurrentPosition((position) => {
        const savedLocation = {
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          radiusMeters: 100,
          updatedAt: new Date().toISOString()
        };
        localStorage.setItem(branchLocationKey, JSON.stringify(savedLocation));
        pinLocationButton.disabled = false;
        pinLocationButton.textContent = 'Use current location as HQ pin';
        pinLocationFeedback.textContent = `HQ pin saved at ${savedLocation.latitude.toFixed(5)}, ${savedLocation.longitude.toFixed(5)}. Future checks use this location.`;
      }, () => {
        pinLocationButton.disabled = false;
        pinLocationButton.textContent = 'Use current location as HQ pin';
        pinLocationFeedback.textContent = 'Location permission was unavailable. Allow GPS access and try again.';
      }, { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 });
    });
  }

  const path = window.location.pathname.toLowerCase();
  const isAdminPage = path.includes('admin-');
  const isEmployeePage = /dashboard|attendance-history|profile|offline|out-of-bounds/.test(path);
  const currentRole = localStorage.getItem(currentRoleKey);

  if (isAdminPage && currentRole !== 'admin') {
    window.location.replace('login.html');
    return;
  }

  if (isEmployeePage && currentRole === 'admin') {
    window.location.replace('admin-monitoring.html');
    return;
  }

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
      const employeeId = document.getElementById('employee-id').value.trim().toUpperCase();
      const password = document.getElementById('password').value;
      const loginFeedback = document.getElementById('login-feedback');
      const account = defaultUsers.find((user) => user.id === employeeId && user.password === password);

      if (!account) {
        if (loginFeedback) loginFeedback.textContent = 'Invalid demo credentials. Check the ID and password and try again.';
        return;
      }

      const role = account.role;
      localStorage.setItem(currentRoleKey, role);
      localStorage.setItem(currentUserKey, JSON.stringify({ name: account.name, id: account.id, email: account.email, role: account.role }));
      window.location.href = role === 'admin' ? 'admin-monitoring.html' : 'dashboard.html';
    });
  }

  document.querySelectorAll('[data-logout]').forEach((logoutLink) => {
    logoutLink.addEventListener('click', () => {
      localStorage.removeItem(currentRoleKey);
      localStorage.removeItem(currentUserKey);
    });
  });

  const clockButton = document.getElementById('clock-button');
  if (clockButton) {
    const radiusStatus = document.getElementById('radius-status');
    const distanceReadout = document.getElementById('distance-readout');
    const gpsStatus = document.getElementById('gps-status');
    const clockFeedback = document.getElementById('clock-feedback');
    clockButton.addEventListener('click', async () => {
      if (localStorage.getItem(pendingCheckInKey)) {
        window.location.href = 'offline.html';
        return;
      }

      const capturedAt = new Date().toISOString();
      const pendingCheckIn = {
        capturedAt,
        latitude: null,
        longitude: null,
        accuracy: null,
        distanceMeters: null,
        inBounds: null,
        status: navigator.onLine ? 'captured-online' : 'queued-offline'
      };

      if (navigator.geolocation) {
        try {
          const position = await new Promise((resolve, reject) => {
            navigator.geolocation.getCurrentPosition(resolve, reject, {
              enableHighAccuracy: true,
              timeout: 8000,
              maximumAge: 0
            });
          });
          pendingCheckIn.latitude = position.coords.latitude;
          pendingCheckIn.longitude = position.coords.longitude;
          pendingCheckIn.accuracy = position.coords.accuracy;
          pendingCheckIn.distanceMeters = calculateDistance(position.coords.latitude, position.coords.longitude);
          pendingCheckIn.inBounds = pendingCheckIn.distanceMeters <= branchLocation.radiusMeters;
          if (distanceReadout) distanceReadout.textContent = `${pendingCheckIn.distanceMeters}m from pinned office (GPS accuracy ±${Math.round(pendingCheckIn.accuracy)}m)`;
          if (radiusStatus) radiusStatus.textContent = pendingCheckIn.inBounds ? 'In-Bounds' : 'Out of Bounds';
          if (gpsStatus) {
            gpsStatus.className = `status-pill ${pendingCheckIn.inBounds ? 'success' : 'danger'}`;
            gpsStatus.innerHTML = `<span class="status-dot"></span> ${pendingCheckIn.inBounds ? 'GPS verified' : 'Outside radius'}`;
          }
        } catch {
          pendingCheckIn.status = 'queued-without-location';
          if (clockFeedback) clockFeedback.textContent = 'Location permission is required before clock-in can be verified.';
          return;
        }
      } else {
        pendingCheckIn.status = 'queued-without-location';
        if (clockFeedback) clockFeedback.textContent = 'This browser does not support location services.';
        return;
      }

      localStorage.setItem(lastLocationAttemptKey, JSON.stringify(pendingCheckIn));

      if (!pendingCheckIn.inBounds) {
        window.location.href = 'out-of-bounds.html';
        return;
      }

      if (!navigator.onLine) {
        localStorage.setItem(pendingCheckInKey, JSON.stringify(pendingCheckIn));
        window.location.href = 'offline.html';
        return;
      }

      const history = readHistory();
      history.unshift({ ...pendingCheckIn, status: 'Present' });
      saveHistory(history);

      const isClocked = clockButton.classList.toggle('clocked');
      const label = clockButton.querySelector('.label');
      if (label) {
        label.textContent = isClocked ? 'CLOCKED IN' : 'CLOCK IN';
      }
      const sub = clockButton.querySelector('.sub');
      if (sub) {
        sub.textContent = isClocked ? 'Shift active' : 'Tap to record your start time';
      }
      if (clockFeedback) clockFeedback.textContent = `Clock-in recorded ${pendingCheckIn.distanceMeters}m from the pinned office.`;
    });
  }

  const navItems = document.querySelectorAll('.nav-item');
  navItems.forEach((item) => {
    item.addEventListener('click', () => {
      navItems.forEach((n) => n.classList.remove('active'));
      item.classList.add('active');
    });
  });
  
    const connectionButton = document.querySelector('[data-confirm-checkin]');
    const connectionFeedback = document.querySelector('[data-connection-feedback]');
    if (connectionButton && connectionFeedback) {
      const recordTime = document.querySelector('[data-record-time]');
      const recordLocation = document.querySelector('[data-record-location]');
      const recordDistance = document.querySelector('[data-record-distance]');
      const recordVerification = document.querySelector('[data-record-verification]');
      const queueStatus = document.querySelector('[data-queue-status]');
      const pendingCheckIn = JSON.parse(localStorage.getItem(pendingCheckInKey) || 'null');

      if (pendingCheckIn) {
        if (recordTime) recordTime.textContent = new Date(pendingCheckIn.capturedAt).toLocaleString();
        if (recordLocation) {
          recordLocation.textContent = pendingCheckIn.latitude === null
            ? 'Unavailable at capture'
            : `${pendingCheckIn.latitude.toFixed(5)}, ${pendingCheckIn.longitude.toFixed(5)} (±${Math.round(pendingCheckIn.accuracy)}m)`;
        }
        if (recordDistance) recordDistance.textContent = pendingCheckIn.distanceMeters === null ? 'Not measured' : `${pendingCheckIn.distanceMeters}m`;
      }

      connectionButton.addEventListener('click', () => {
        if (!navigator.onLine) {
          connectionFeedback.textContent = 'Still offline. The captured time and location remain safely queued.';
          return;
        }

        if (!pendingCheckIn) {
          connectionFeedback.textContent = 'There is no queued check-in to confirm.';
          return;
        }

        if (queueStatus) queueStatus.textContent = 'Confirmed';
        if (queueStatus) queueStatus.className = 'badge success';
        if (recordVerification) recordVerification.textContent = 'Confirmed and added to attendance history';
        saveHistory([{ ...pendingCheckIn, status: 'Present' }, ...readHistory()]);
        localStorage.removeItem(pendingCheckInKey);
        connectionButton.disabled = true;
        connectionButton.textContent = 'Check-in confirmed';
        connectionFeedback.textContent = 'Connection restored. The queued check-in is now recorded in attendance history.';
      });
    }

    window.addEventListener('online', () => {
      if (connectionFeedback && localStorage.getItem(pendingCheckInKey)) {
        connectionFeedback.textContent = 'Connection restored. Review the captured details, then confirm this check-in.';
      }
    });
  
    const locationButton = document.querySelector('[data-refresh-location]');
    const locationFeedback = document.querySelector('[data-location-feedback]');
    if (locationButton && locationFeedback) {
      locationButton.addEventListener('click', () => {
        if (!navigator.geolocation) {
          locationFeedback.textContent = 'This browser does not support GPS location.';
          return;
        }

        locationButton.disabled = true;
        locationButton.textContent = 'Reading location...';
        navigator.geolocation.getCurrentPosition((position) => {
          const distanceMeters = calculateDistance(position.coords.latitude, position.coords.longitude);
          const inBounds = distanceMeters <= branchLocation.radiusMeters;
          localStorage.setItem(lastLocationAttemptKey, JSON.stringify({
            capturedAt: new Date().toISOString(),
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
            accuracy: position.coords.accuracy,
            distanceMeters,
            inBounds
          }));
          locationButton.disabled = false;
          locationButton.textContent = 'Refresh location';
          locationFeedback.textContent = `${distanceMeters}m from the pinned office. Allowed radius: ${branchLocation.radiusMeters}m. ${inBounds ? 'You are now in bounds.' : 'An admin must update the office pin if this is the correct location.'}`;
          if (outOfBoundsDistance) outOfBoundsDistance.textContent = `${distanceMeters}m from pinned office`;
        }, () => {
          locationButton.disabled = false;
          locationButton.textContent = 'Refresh location';
          locationFeedback.textContent = 'Location permission was unavailable. Allow GPS access and try again.';
        }, { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 });
      });
    }

  const outOfBoundsDistance = document.querySelector('[data-out-of-bounds-distance]');
  if (outOfBoundsDistance) {
    const attempt = JSON.parse(localStorage.getItem(lastLocationAttemptKey) || 'null');
    if (attempt && attempt.distanceMeters !== null) outOfBoundsDistance.textContent = `${attempt.distanceMeters}m from pinned office`;
  }

  const exportButton = document.querySelector('[data-export-history]');
  const historyFeedback = document.querySelector('[data-history-feedback]');
  const historyTable = document.getElementById('attendance-records');
  if (historyTable) {
    readHistory().forEach((record) => {
      const row = document.createElement('tr');
      const capturedDate = new Date(record.capturedAt);
      row.innerHTML = `<td>${capturedDate.toLocaleDateString()}</td><td>${capturedDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</td><td>--</td><td><span class="badge success">${record.status}</span></td>`;
      historyTable.prepend(row);
    });
  }

  if (exportButton && historyFeedback) {
    exportButton.addEventListener('click', () => {
      const rows = readHistory().map((record) => `${new Date(record.capturedAt).toISOString()},${record.status}`).join('\n');
      const csv = `timestamp,status\n${rows}`;
      const link = document.createElement('a');
      link.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
      link.download = 'attendance-history.csv';
      link.click();
      URL.revokeObjectURL(link.href);
      historyFeedback.textContent = 'Attendance history exported.';
    });
  }

  const saveProfileButton = document.querySelector('[data-save-profile]');
  const profileFeedback = document.querySelector('[data-profile-feedback]');
  if (saveProfileButton && profileFeedback) {
    const profile = JSON.parse(localStorage.getItem('attendancePro.profile') || 'null');
    if (profile) {
      document.getElementById('full-name').value = profile.name;
      document.getElementById('employee-number').value = profile.employeeId;
      document.getElementById('branch').value = profile.branch;
    }

    saveProfileButton.addEventListener('click', () => {
      localStorage.setItem('attendancePro.profile', JSON.stringify({
        name: document.getElementById('full-name').value,
        employeeId: document.getElementById('employee-number').value,
        branch: document.getElementById('branch').value
      }));
      profileFeedback.textContent = 'Profile changes saved on this device.';
    });
  }

  const createUserForm = document.getElementById('create-user-form');
  const userRecords = document.getElementById('user-records');
  const userFormFeedback = document.getElementById('user-form-feedback');
  if (createUserForm && userRecords && userFormFeedback) {
    const renderUsers = () => {
      readUsers().forEach((user) => {
        const row = document.createElement('tr');
        row.dataset.userId = user.id;
        row.innerHTML = `<td>${user.name}</td><td>${user.id}</td><td>${user.branch}</td><td><span class="badge ${user.role === 'admin' ? 'warning' : 'success'}">${user.role}</span></td><td>${user.rights.join(', ') || 'No rights assigned'}</td><td><button class="ghost-btn" type="button" data-remove-user="${user.id}">Remove</button></td>`;
        userRecords.appendChild(row);
      });
    };

    renderUsers();
    createUserForm.addEventListener('submit', (event) => {
      event.preventDefault();
      const user = {
        name: document.getElementById('user-name').value.trim(),
        id: document.getElementById('user-id').value.trim().toUpperCase(),
        email: document.getElementById('user-email').value.trim(),
        password: document.getElementById('user-password').value,
        branch: document.getElementById('user-branch').value,
        role: document.getElementById('user-role').value,
        rights: [...document.querySelectorAll('input[name="rights"]:checked')].map((right) => right.value)
      };
      const users = readUsers();
      if (users.some((existingUser) => existingUser.id === user.id)) {
        userFormFeedback.textContent = 'That employee ID already exists.';
        return;
      }
      saveUsers([...users, user]);
      const row = document.createElement('tr');
      row.dataset.userId = user.id;
      row.innerHTML = `<td>${user.name}</td><td>${user.id}</td><td>${user.branch}</td><td><span class="badge ${user.role === 'admin' ? 'warning' : 'success'}">${user.role}</span></td><td>${user.rights.join(', ') || 'No rights assigned'}</td><td><button class="ghost-btn" type="button" data-remove-user="${user.id}">Remove</button></td>`;
      userRecords.appendChild(row);
      createUserForm.reset();
      userFormFeedback.textContent = `${user.name} was created with ${user.rights.length} access right(s).`;
    });

    userRecords.addEventListener('click', (event) => {
      const removeButton = event.target.closest('[data-remove-user]');
      if (!removeButton) return;
      const id = removeButton.dataset.removeUser;
      saveUsers(readUsers().filter((user) => user.id !== id));
      removeButton.closest('tr').remove();
      userFormFeedback.textContent = `${id} was removed.`;
    });
  }
});
