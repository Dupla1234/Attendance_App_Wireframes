document.addEventListener('DOMContentLoaded', () => {
  if ('serviceWorker' in navigator && window.isSecureContext) {
    navigator.serviceWorker.register('../service-worker.js').catch(() => {});
  }

  const pendingCheckInKey = 'attendancePro.pendingCheckIn';
  const attendanceHistoryKey = 'attendancePro.attendanceHistory';
  const currentRoleKey = 'attendancePro.currentRole';
  const currentUserKey = 'attendancePro.currentUser';
  const deviceAccountKey = 'attendancePro.deviceAccount';
  const browserDeviceIdKey = 'attendancePro.browserDeviceId';
  const pendingClockOutKey = 'attendancePro.pendingClockOut';
  const adminMonitoringSettingsKey = 'attendancePro.adminMonitoringSettings';
  const faceReferenceKey = 'attendancePro.faceReferences';
  const supabaseConfig = window.ATTENDANCE_SUPABASE_CONFIG || {};
  const supabaseConfigured = Boolean(supabaseConfig.url && supabaseConfig.anonKey);
  const supabaseClient = window.attendanceSupabaseClient || null;
  const activeShiftKey = 'attendancePro.activeShift';
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
  const shiftStartHour = 8;
  const shiftStartMinute = 0;
  const gracePeriodMinutes = 5;

  const readHistory = () => JSON.parse(localStorage.getItem(attendanceHistoryKey) || '[]');
  const saveHistory = (history) => localStorage.setItem(attendanceHistoryKey, JSON.stringify(history));
  const readUsers = () => JSON.parse(localStorage.getItem(usersKey) || '[]');
  const saveUsers = (users) => localStorage.setItem(usersKey, JSON.stringify(users));
  const readFaceReferences = () => JSON.parse(localStorage.getItem(faceReferenceKey) || '{}');
  const saveFaceReferences = (references) => localStorage.setItem(faceReferenceKey, JSON.stringify(references));
  const saveAttendanceRemotely = async (record, userId) => {
    if (!supabaseClient || !userId) throw new Error('Your secure session could not be verified. Sign in again.');
    if (!record.faceVerificationId) throw new Error('A successful live face check is required before clock-in.');
    const { data, error } = await supabaseClient.rpc('clock_in_with_face', {
      p_face_verification_id: record.faceVerificationId,
      p_captured_at: record.capturedAt,
      p_latitude: record.latitude,
      p_longitude: record.longitude,
      p_accuracy: record.accuracy,
      p_distance_meters: record.distanceMeters,
      p_in_bounds: record.inBounds,
      p_late: record.late,
      p_late_by_milliseconds: record.lateByMilliseconds
    });

    if (error) throw error;
    return data;
  };
  let faceLivenessAssetsPromise;
  const loadFaceLivenessAssets = () => {
    if (window.AttendanceFaceLiveness) return Promise.resolve();
    if (!faceLivenessAssetsPromise) {
      const scriptPromise = new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = '../assets/js/face-build/face-liveness.iife.js';
        script.onload = resolve;
        script.onerror = () => reject(new Error('Could not load the face-verification interface.'));
        document.head.appendChild(script);
      });
      const stylePromise = new Promise((resolve, reject) => {
        const stylesheet = document.createElement('link');
        stylesheet.rel = 'stylesheet';
        stylesheet.href = '../assets/js/face-build/style.css';
        stylesheet.onload = resolve;
        stylesheet.onerror = () => reject(new Error('Could not load face-verification styles.'));
        document.head.appendChild(stylesheet);
      });
      faceLivenessAssetsPromise = Promise.all([scriptPromise, stylePromise]).catch((error) => {
        faceLivenessAssetsPromise = null;
        throw error;
      });
    }
    return faceLivenessAssetsPromise;
  };
  const openFaceVerification = async () => {
    const dialog = document.querySelector('[data-face-verification-dialog]');
    const mountPoint = document.querySelector('[data-face-liveness-mount]');
    const config = supabaseConfig.faceLiveness || {};
    const employeeFaceReference = currentUser && readFaceReferences()[currentUser.id];
    if (!employeeFaceReference) {
      return { error: 'This employee does not have an approved face reference. Ask HR/admin to enroll the face before clocking in.' };
    }

    if (!dialog || !mountPoint) {
      return { error: 'The face-verification dialog is not available.' };
    }

    if (!supabaseClient || !config.awsRegion || !config.identityPoolId) {
      return new Promise((resolve) => {
        const finish = (result) => {
          dialog.close();
          mountPoint.replaceChildren();
          resolve(result);
        };

        dialog.addEventListener('cancel', (event) => {
          event.preventDefault();
          finish({ error: 'Face verification was cancelled. Clock-in was not recorded.' });
        }, { once: true });
        dialog.querySelector('[data-face-cancel]')?.addEventListener('click', () => {
          finish({ error: 'Face verification was cancelled. Clock-in was not recorded.' });
        }, { once: true });

        const consentText = document.createElement('div');
        consentText.className = 'face-verification-fallback';
        consentText.innerHTML = '<p>Face enrollment is linked to this employee ID. Use the camera to capture a live selfie before clock-in continues.</p>';

        const startButton = document.createElement('button');
        startButton.type = 'button';
        startButton.className = 'primary-btn';
        startButton.textContent = 'Start camera check';

        const statusText = document.createElement('p');
        statusText.className = 'form-feedback';

        mountPoint.replaceChildren(consentText, startButton, statusText);
        dialog.showModal();

        startButton.addEventListener('click', async () => {
          try {
            if (!navigator.mediaDevices?.getUserMedia) {
              throw new Error('This browser does not support camera capture.');
            }
            startButton.disabled = true;
            statusText.textContent = 'Opening camera...';
            const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' }, audio: false });
            const video = document.createElement('video');
            video.srcObject = stream;
            video.autoplay = true;
            video.playsInline = true;
            await video.play();

            const canvas = document.createElement('canvas');
            canvas.width = video.videoWidth || 640;
            canvas.height = video.videoHeight || 480;
            const context = canvas.getContext('2d');
            context.drawImage(video, 0, 0, canvas.width, canvas.height);
            const capturedImage = canvas.toDataURL('image/jpeg', 0.85);
            stream.getTracks().forEach((track) => track.stop());

            if (!capturedImage || capturedImage.length < 100) {
              throw new Error('A usable webcam image could not be captured.');
            }

            statusText.textContent = 'Face ID check captured. Linking to your employee profile...';
            finish({ verificationId: `local-${Date.now()}` });
          } catch (error) {
            statusText.textContent = error.message;
            startButton.disabled = false;
          }
        });
      });
    }

    try {
      await loadFaceLivenessAssets();
    } catch (error) {
      return { error: error.message };
    }

    return new Promise((resolve) => {
      let unmount = null;
      let settled = false;
      const finish = (result) => {
        if (settled) return;
        settled = true;
        dialog.removeEventListener('cancel', handleDialogCancel);
        unmount?.();
        mountPoint.replaceChildren();
        dialog.close();
        resolve(result);
      };
      const handleDialogCancel = (event) => {
        event.preventDefault();
        finish({ error: 'Face verification was cancelled. Clock-in was not recorded.' });
      };
      dialog.querySelector('[data-face-cancel]')?.addEventListener('click', () => {
        finish({ error: 'Face verification was cancelled. Clock-in was not recorded.' });
      }, { once: true });
      dialog.addEventListener('cancel', handleDialogCancel);
      dialog.showModal();
      unmount = window.AttendanceFaceLiveness.mount(mountPoint, {
        supabaseClient,
        awsRegion: config.awsRegion,
        identityPoolId: config.identityPoolId,
        onVerified: (verificationId) => finish({ verificationId }),
        onCancel: () => finish({ error: 'Face verification was cancelled. Clock-in was not recorded.' })
      });
    });
  };
  const syncQueuedClockOut = async () => {
    if (!supabaseConfigured || !supabaseClient || !navigator.onLine) return false;
    const queuedClockOut = JSON.parse(localStorage.getItem(pendingClockOutKey) || 'null');
    if (!queuedClockOut) return false;

    try {
      const { error } = await supabaseClient.from('attendance_records').update({
        clocked_out_at: queuedClockOut.clockedOutAt,
        worked_milliseconds: queuedClockOut.workedMilliseconds,
        status: 'Completed'
      }).eq('id', queuedClockOut.recordId).eq('user_id', queuedClockOut.userId).select('id').single();
      if (error) return false;
      localStorage.removeItem(pendingClockOutKey);
      return true;
    } catch {
      return false;
    }
  };
  syncQueuedClockOut();
  window.addEventListener('online', syncQueuedClockOut);

  const formatDuration = (milliseconds) => {
    const totalMinutes = Math.max(0, Math.floor(milliseconds / 60000));
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    return `${hours}h ${minutes}m`;
  };

  const formatLateDuration = (milliseconds) => {
    const totalSeconds = Math.max(0, Math.floor(milliseconds / 1000));
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    if (hours > 0) return `${hours}h ${minutes}m late`;
    if (minutes > 0) return `${minutes}m ${seconds}s late`;
    return `${seconds}s late`;
  };

  const getGraceDeadline = (date = new Date()) => {
    const deadline = new Date(date);
    deadline.setHours(shiftStartHour, shiftStartMinute + gracePeriodMinutes, 0, 0);
    return deadline;
  };

  const getLateMilliseconds = (date = new Date()) => Math.max(0, date.getTime() - getGraceDeadline(date).getTime());

  const getTodayWorkedMilliseconds = (shiftStart = null) => {
    const now = new Date();
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const endOfDay = new Date(startOfDay);
    endOfDay.setDate(endOfDay.getDate() + 1);

    const todayHistory = readHistory().filter((entry) => {
      if (!entry.clockedOutAt || !entry.capturedAt) return false;
      const startTime = new Date(entry.capturedAt).getTime();
      const endTime = new Date(entry.clockedOutAt).getTime();
      return startTime >= startOfDay.getTime() && endTime <= endOfDay.getTime();
    });

    const completedMilliseconds = todayHistory.reduce((sum, entry) => sum + (Number(entry.workedMilliseconds) || 0), 0);

    if (!shiftStart) {
      return completedMilliseconds;
    }

    const activeStart = new Date(shiftStart).getTime();
    const activeMilliseconds = activeStart >= startOfDay.getTime() && activeStart < endOfDay.getTime()
      ? Math.max(0, Date.now() - activeStart)
      : 0;

    return completedMilliseconds + activeMilliseconds;
  };

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

  const requestFreshLocation = () => new Promise((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(resolve, reject, {
      enableHighAccuracy: true,
      timeout: 30000,
      maximumAge: 0
    });
  });

  const pinLocationButton = document.querySelector('[data-pin-current-location]');
  const pinLocationFeedback = document.querySelector('[data-pin-location-feedback]');
  const renderSavedHqLocation = () => {
    const coordinates = document.querySelector('[data-hq-coordinates]');
    const radius = document.querySelector('[data-hq-radius]');
    const mapLabel = document.querySelector('[data-hq-map-label]');
    if (coordinates) coordinates.textContent = `${branchLocation.latitude.toFixed(6)}, ${branchLocation.longitude.toFixed(6)}`;
    if (radius) radius.textContent = `${branchLocation.radiusMeters}m`;
    if (mapLabel) mapLabel.textContent = `${branchLocation.latitude.toFixed(5)}, ${branchLocation.longitude.toFixed(5)}`;
  };
  renderSavedHqLocation();

  if (pinLocationButton && pinLocationFeedback) {
    pinLocationButton.addEventListener('click', () => {
      if (!navigator.geolocation) {
        pinLocationFeedback.textContent = 'This browser does not support GPS location.';
        return;
      }

      pinLocationButton.disabled = true;
      pinLocationButton.textContent = 'Reading current location...';
      requestFreshLocation().then((position) => {
        const savedLocation = {
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          radiusMeters: 100,
          updatedAt: new Date().toISOString()
        };
        Object.assign(branchLocation, savedLocation);
        localStorage.setItem(branchLocationKey, JSON.stringify(savedLocation));
        pinLocationButton.disabled = false;
        pinLocationButton.textContent = 'Update HQ location';
        pinLocationFeedback.textContent = `HQ pin saved at ${savedLocation.latitude.toFixed(6)}, ${savedLocation.longitude.toFixed(6)}. Future checks use this exact location.`;
        document.querySelector('[data-hq-coordinates]')?.replaceChildren(document.createTextNode(`${savedLocation.latitude.toFixed(6)}, ${savedLocation.longitude.toFixed(6)}`));
        document.querySelector('[data-hq-radius]')?.replaceChildren(document.createTextNode(`${savedLocation.radiusMeters}m`));
        document.querySelector('[data-hq-map-label]')?.replaceChildren(document.createTextNode(`${savedLocation.latitude.toFixed(5)}, ${savedLocation.longitude.toFixed(5)}`));
      }).catch(() => {
        pinLocationButton.disabled = false;
        pinLocationButton.textContent = 'Update HQ location';
        pinLocationFeedback.textContent = 'Location permission was unavailable. Allow GPS access and try again.';
      });
    });
  }

  const path = window.location.pathname.toLowerCase();
  const isAdminPage = path.includes('admin-');
  const isEmployeePage = /dashboard|attendance-history|profile|offline|out-of-bounds/.test(path);
  const currentRole = localStorage.getItem(currentRoleKey);
  const currentUser = JSON.parse(localStorage.getItem(currentUserKey) || 'null');

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
    const employeeIdInput = document.getElementById('employee-id');
    const departmentField = document.getElementById('department-field');
    const departmentInput = document.getElementById('employee-department');
    const loginFeedback = document.getElementById('login-feedback');
    const submitButton = loginForm.querySelector('[type="submit"]');
    const readDeviceBinding = () => JSON.parse(localStorage.getItem(deviceAccountKey) || 'null');
    if (supabaseConfigured) {
      document.querySelector('label[for="employee-id"]').textContent = 'Work email';
      employeeIdInput.type = 'email';
      employeeIdInput.placeholder = 'name@company.com';
      const demoCredentials = document.querySelector('.demo-credentials');
      if (demoCredentials) demoCredentials.style.display = 'none';
      const deviceNote = loginForm.querySelector('.device-binding-note');
      if (deviceNote) deviceNote.textContent = 'Your first successful sign-in registers this browser to one account. Registration is checked online.';
    }

    const updateDepartmentField = () => {
      if (supabaseConfigured) {
        departmentField.hidden = false;
        departmentInput.required = false;
        departmentInput.disabled = false;
        return;
      }

      const employeeId = employeeIdInput.value.trim().toUpperCase();
      const isEmployee = employeeId.startsWith('EMP-');
      const binding = readDeviceBinding();
      const isAlreadyBoundEmployee = binding && binding.accountId === employeeId && binding.role === 'employee';

      departmentField.hidden = !isEmployee;
      departmentInput.required = isEmployee && !isAlreadyBoundEmployee;
      departmentInput.disabled = Boolean(isAlreadyBoundEmployee);
      if (isAlreadyBoundEmployee) departmentInput.value = binding.department || '';
      else if (departmentInput.disabled) departmentInput.disabled = false;
    };

    employeeIdInput.addEventListener('input', updateDepartmentField);
    updateDepartmentField();

    loginForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      const loginId = employeeIdInput.value.trim();
      const password = document.getElementById('password').value;
      if (supabaseConfigured) {
        if (!supabaseClient) {
          loginFeedback.textContent = 'The authentication service did not load. Check your connection and try again.';
          return;
        }

        submitButton.disabled = true;
        submitButton.textContent = 'Signing in...';
        try {
          const { data: authData, error: authError } = await supabaseClient.auth.signInWithPassword({
            email: loginId.toLowerCase(),
            password
          });
          if (authError) throw authError;

          const { data: profile, error: profileError } = await supabaseClient
            .from('employee_profiles')
            .select('employee_id, full_name, department, branch, role')
            .eq('user_id', authData.user.id)
            .single();
          if (profileError) throw profileError;

          const department = profile.department || (profile.role === 'employee' ? departmentInput.value.trim() : null);
          if (profile.role === 'employee' && !department) {
            await supabaseClient.auth.signOut();
            loginFeedback.textContent = 'Select your department to complete first-time registration.';
            return;
          }

          let deviceId = localStorage.getItem(browserDeviceIdKey);
          if (!deviceId) {
            if (!crypto.randomUUID) throw new Error('This browser cannot create a secure device registration. Update the browser and try again.');
            deviceId = crypto.randomUUID();
            localStorage.setItem(browserDeviceIdKey, deviceId);
          }

          const { error: deviceError } = await supabaseClient.rpc('register_current_device', {
            p_device_id: deviceId,
            p_department: department
          });
          if (deviceError) throw deviceError;

          localStorage.setItem(currentRoleKey, profile.role);
          localStorage.setItem(currentUserKey, JSON.stringify({
            name: profile.full_name,
            id: profile.employee_id,
            email: authData.user.email,
            authUserId: authData.user.id,
            role: profile.role,
            department: department || null,
            branch: profile.branch
          }));
          window.location.href = profile.role === 'admin' ? 'admin-monitoring.html' : 'dashboard.html';
        } catch (error) {
          await supabaseClient.auth.signOut();
          loginFeedback.textContent = error.message.includes('DEVICE_REGISTERED_TO_ANOTHER_ACCOUNT')
            ? 'This browser is already registered to another account. Contact your administrator to request a device reset.'
            : `Sign-in failed: ${error.message}`;
        } finally {
          submitButton.disabled = false;
          submitButton.textContent = 'Sign In';
        }
        return;
      }

      const employeeId = loginId.toUpperCase();
      const account = [...defaultUsers, ...readUsers()].find((user) => user.id === employeeId && user.password === password);

      if (!account) {
        if (loginFeedback) loginFeedback.textContent = 'Invalid demo credentials. Check the ID and password and try again.';
        return;
      }

      const deviceBinding = readDeviceBinding();
      if (deviceBinding && deviceBinding.accountId !== account.id) {
        if (loginFeedback) loginFeedback.textContent = `This browser is registered to ${deviceBinding.accountId}. Only that account can sign in on this device.`;
        return;
      }

      const department = account.role === 'employee'
        ? (deviceBinding?.department || departmentInput.value)
        : null;
      if (account.role === 'employee' && !department) {
        if (loginFeedback) loginFeedback.textContent = 'Select your department before registering this browser.';
        return;
      }

      if (!deviceBinding) {
        localStorage.setItem(deviceAccountKey, JSON.stringify({
          accountId: account.id,
          role: account.role,
          department,
          registeredAt: new Date().toISOString()
        }));
      }

      const role = account.role;
      localStorage.setItem(currentRoleKey, role);
      localStorage.setItem(currentUserKey, JSON.stringify({ name: account.name, id: account.id, email: account.email, role: account.role, department }));
      window.location.href = role === 'admin' ? 'admin-monitoring.html' : 'dashboard.html';
    });
  }

  document.querySelectorAll('[data-logout]').forEach((logoutLink) => {
    logoutLink.addEventListener('click', (event) => {
      localStorage.removeItem(currentRoleKey);
      localStorage.removeItem(currentUserKey);
      if (supabaseClient) {
        event.preventDefault();
        supabaseClient.auth.signOut().finally(() => {
          window.location.href = logoutLink.href;
        });
      }
    });
  });

  const clockButton = document.getElementById('clock-button');
  if (clockButton) {
    const radiusStatus = document.getElementById('radius-status');
    const distanceReadout = document.getElementById('distance-readout');
    const gpsStatus = document.getElementById('gps-status');
    const clockFeedback = document.getElementById('clock-feedback');
    const hoursToday = document.getElementById('hours-today');
    const workStatus = document.getElementById('work-status');
    const shiftStatus = document.getElementById('shift-status');
    let activeShift = JSON.parse(localStorage.getItem(activeShiftKey) || 'null');
    let timer;

    const renderShift = () => {
      const todayWorkedMilliseconds = getTodayWorkedMilliseconds(activeShift ? activeShift.startedAt : null);
      const lateMilliseconds = getLateMilliseconds();
      const lateText = lateMilliseconds > 0 ? formatLateDuration(lateMilliseconds) : 'Expected · 5 min grace';

      if (shiftStatus) {
        shiftStatus.className = `status-pill ${lateMilliseconds > 0 ? 'danger' : 'warning'}`;
        const recordedLateBy = activeShift && activeShift.lateByMilliseconds ? activeShift.lateByMilliseconds : lateMilliseconds;
        shiftStatus.innerHTML = `<span class="status-dot"></span> ${activeShift && activeShift.late ? `Clocked in ${formatLateDuration(recordedLateBy)}` : lateText}`;
      }

      if (!activeShift) {
        clockButton.classList.remove('clocked');
        clockButton.querySelector('.label').textContent = 'CLOCK IN';
        clockButton.querySelector('.sub').textContent = 'Tap to record your start time';
        if (hoursToday) hoursToday.textContent = formatDuration(todayWorkedMilliseconds);
        if (workStatus) {
          workStatus.innerHTML = todayWorkedMilliseconds > 0
            ? '<span class="status-dot"></span> Worked today'
            : '<span class="status-dot"></span> Not clocked in';
        }
        return;
      }

      clockButton.classList.add('clocked');
      clockButton.querySelector('.label').textContent = 'CLOCK OUT';
      clockButton.querySelector('.sub').textContent = 'Tap to stop your shift';
      if (workStatus) workStatus.innerHTML = '<span class="status-dot"></span> Shift active';
      if (hoursToday) hoursToday.textContent = formatDuration(todayWorkedMilliseconds);
    };

    renderShift();
    timer = setInterval(renderShift, 1000);

    clockButton.addEventListener('click', async () => {
      if (activeShift) {
        const endedAt = new Date().toISOString();
        const workedMilliseconds = new Date(endedAt).getTime() - new Date(activeShift.startedAt).getTime();
        if (supabaseConfigured && !navigator.onLine && activeShift.supabaseRecordId) {
          localStorage.setItem(pendingClockOutKey, JSON.stringify({
            recordId: activeShift.supabaseRecordId,
            userId: currentUser?.authUserId,
            clockedOutAt: endedAt,
            workedMilliseconds
          }));
        } else if (supabaseConfigured) {
          try {
            const { error } = await supabaseClient.from('attendance_records').update({
              clocked_out_at: endedAt,
              worked_milliseconds: workedMilliseconds,
              status: 'Completed'
            }).eq('id', activeShift.supabaseRecordId).eq('user_id', currentUser.authUserId).select('id').single();
            if (error) throw error;
          } catch (error) {
            if (clockFeedback) clockFeedback.textContent = `Could not sync clock-out: ${error.message}. Your shift remains active; try again when online.`;
            return;
          }
        }

        const history = readHistory();
        history.unshift({
          capturedAt: activeShift.startedAt,
          clockedOutAt: endedAt,
          workedMilliseconds,
          distanceMeters: activeShift.distanceMeters,
          status: 'Completed'
        });
        saveHistory(history);
        activeShift = null;
        localStorage.removeItem(activeShiftKey);
        const totalToday = getTodayWorkedMilliseconds();
        renderShift();
        if (clockFeedback) clockFeedback.textContent = `Shift ended. You worked ${formatDuration(workedMilliseconds)}. Total for today: ${formatDuration(totalToday)}.`;
        return;
      }

      if (localStorage.getItem(pendingCheckInKey)) {
        window.location.href = 'offline.html';
        return;
      }

      const capturedAt = new Date().toISOString();
      const pendingCheckIn = {
        capturedAt,
        employeeId: currentUser?.id || 'EMP-1001',
        employeeName: currentUser?.name || 'Demo Employee',
        branch: currentUser?.branch || 'HQ - Centurion',
        department: currentUser?.department || null,
        latitude: null,
        longitude: null,
        accuracy: null,
        distanceMeters: null,
        inBounds: null,
        late: getLateMilliseconds(new Date(capturedAt)) > 0,
        lateByMilliseconds: getLateMilliseconds(new Date(capturedAt)),
        status: navigator.onLine ? 'captured-online' : 'queued-offline'
      };

      if (navigator.geolocation) {
        try {
          clockButton.disabled = true;
          if (clockFeedback) clockFeedback.textContent = 'Getting a fresh high-accuracy location. Keep this page open...';
          const position = await requestFreshLocation();
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
          clockButton.disabled = false;
          pendingCheckIn.status = 'queued-without-location';
          if (clockFeedback) clockFeedback.textContent = 'Could not get a fresh location. Allow location access, enable device location services, and try again.';
          return;
        }
      } else {
        clockButton.disabled = false;
        pendingCheckIn.status = 'queued-without-location';
        if (clockFeedback) clockFeedback.textContent = 'This browser does not support location services.';
        return;
      }

      clockButton.disabled = false;

      localStorage.setItem(lastLocationAttemptKey, JSON.stringify(pendingCheckIn));

      if (!pendingCheckIn.inBounds) {
        window.location.href = 'out-of-bounds.html';
        return;
      }

      let faceVerificationId = null;
      if (supabaseConfigured) {
        if (!navigator.onLine) {
          if (clockFeedback) clockFeedback.textContent = 'Live face verification needs an internet connection. Clock-in was not recorded.';
          return;
        }

        clockButton.disabled = true;
        if (clockFeedback) clockFeedback.textContent = 'Complete the live face check to confirm your identity.';
        const verification = await openFaceVerification();
        clockButton.disabled = false;
        if (!verification.verificationId) {
          if (clockFeedback) clockFeedback.textContent = verification.error;
          return;
        }
        faceVerificationId = verification.verificationId;
        pendingCheckIn.capturedAt = new Date().toISOString();
        pendingCheckIn.lateByMilliseconds = getLateMilliseconds(new Date(pendingCheckIn.capturedAt));
        pendingCheckIn.late = pendingCheckIn.lateByMilliseconds > 0;
      }

      if (!navigator.onLine) {
        activeShift = { startedAt: pendingCheckIn.capturedAt, distanceMeters: pendingCheckIn.distanceMeters, late: pendingCheckIn.late, lateByMilliseconds: pendingCheckIn.lateByMilliseconds };
        localStorage.setItem(activeShiftKey, JSON.stringify(activeShift));
        localStorage.setItem(pendingCheckInKey, JSON.stringify(pendingCheckIn));
        window.location.href = 'offline.html';
        return;
      }

      let supabaseRecordId = null;
      if (supabaseConfigured) {
        clockButton.disabled = true;
        if (clockFeedback) clockFeedback.textContent = 'Saving your attendance for the admin dashboard...';
        try {
          supabaseRecordId = await saveAttendanceRemotely({ ...pendingCheckIn, faceVerificationId }, currentUser?.authUserId);
        } catch (error) {
          clockButton.disabled = false;
          if (clockFeedback) clockFeedback.textContent = `Clock-in was not recorded: ${error.message}. Check your connection and try again.`;
          return;
        }
        clockButton.disabled = false;
      }

      activeShift = {
        startedAt: pendingCheckIn.capturedAt,
        distanceMeters: pendingCheckIn.distanceMeters,
        late: pendingCheckIn.late,
        lateByMilliseconds: pendingCheckIn.lateByMilliseconds,
        supabaseRecordId
      };
      localStorage.setItem(activeShiftKey, JSON.stringify(activeShift));

      const history = readHistory();
      history.unshift({ ...pendingCheckIn, status: pendingCheckIn.late ? 'Late' : 'Present' });
      saveHistory(history);

      renderShift();
      if (clockFeedback) clockFeedback.textContent = `Clock-in recorded ${pendingCheckIn.distanceMeters}m from the pinned office${supabaseRecordId ? ' and shared with the admin dashboard.' : '.'}`;
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

      connectionButton.addEventListener('click', async () => {
        if (!navigator.onLine) {
          connectionFeedback.textContent = 'Still offline. The captured time and location remain safely queued.';
          return;
        }

        if (!pendingCheckIn) {
          connectionFeedback.textContent = 'There is no queued check-in to confirm.';
          return;
        }

        let supabaseRecordId = null;
        if (supabaseConfigured) {
          try {
            supabaseRecordId = await saveAttendanceRemotely(pendingCheckIn, currentUser?.authUserId);
          } catch (error) {
            connectionFeedback.textContent = `The queued check-in could not sync: ${error.message}. It remains queued.`;
            return;
          }
        }

        if (queueStatus) queueStatus.textContent = 'Confirmed';
        if (queueStatus) queueStatus.className = 'badge success';
        if (recordVerification) recordVerification.textContent = 'Confirmed and added to attendance history';
        saveHistory([{ ...pendingCheckIn, status: pendingCheckIn.late ? 'Late' : 'Present' }, ...readHistory()]);
        const activeShift = JSON.parse(localStorage.getItem(activeShiftKey) || 'null');
        if (activeShift && activeShift.startedAt === pendingCheckIn.capturedAt) {
          activeShift.supabaseRecordId = supabaseRecordId;
          localStorage.setItem(activeShiftKey, JSON.stringify(activeShift));
        }
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
        requestFreshLocation().then((position) => {
          const distanceMeters = calculateDistance(position.coords.latitude, position.coords.longitude);
          const inBounds = distanceMeters <= branchLocation.radiusMeters;
          const locationAttempt = {
            capturedAt: new Date().toISOString(),
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
            accuracy: position.coords.accuracy,
            distanceMeters,
            inBounds
          };
          localStorage.setItem(lastLocationAttemptKey, JSON.stringify(locationAttempt));
          locationButton.disabled = false;
          locationButton.textContent = 'Refresh current location';
          locationFeedback.textContent = `${distanceMeters}m from the pinned office (GPS accuracy ±${Math.round(position.coords.accuracy)}m). ${inBounds ? 'You are in bounds.' : 'You are outside the approved radius.'}`;
          if (outOfBoundsDistance) outOfBoundsDistance.textContent = `${distanceMeters}m from pinned office`;
        }).catch(() => {
          locationButton.disabled = false;
          locationButton.textContent = 'Refresh current location';
          locationFeedback.textContent = 'Could not get a fresh location. Allow location access, enable device location services, and try again.';
        });
      });
    }

    if (locationButton && !locationFeedback) {
      const distanceReadout = document.getElementById('distance-readout');
      const radiusStatus = document.getElementById('radius-status');
      const gpsStatus = document.getElementById('gps-status');

      locationButton.addEventListener('click', () => {
        if (!navigator.geolocation) {
          if (distanceReadout) distanceReadout.textContent = 'This browser does not support location services.';
          return;
        }

        locationButton.disabled = true;
        locationButton.textContent = 'Getting current location...';
        requestFreshLocation().then((position) => {
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
          locationButton.textContent = 'Refresh current location';
          if (distanceReadout) distanceReadout.textContent = `${distanceMeters}m from pinned office (GPS accuracy ±${Math.round(position.coords.accuracy)}m)`;
          if (radiusStatus) radiusStatus.textContent = inBounds ? 'In-Bounds' : 'Out of Bounds';
          if (gpsStatus) {
            gpsStatus.className = `status-pill ${inBounds ? 'success' : 'danger'}`;
            gpsStatus.innerHTML = `<span class="status-dot"></span> ${inBounds ? 'GPS verified' : 'Outside radius'}`;
          }
        }).catch(() => {
          locationButton.disabled = false;
          locationButton.textContent = 'Refresh current location';
          if (distanceReadout) distanceReadout.textContent = 'Could not get a fresh location. Check location permissions and device location services.';
        });
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
  const totalWeekEl = document.getElementById('total-week');
  const totalMonthEl = document.getElementById('total-month');

  const branchSearch = document.querySelector('[data-branch-search]');
  const branchCards = document.querySelectorAll('[data-branch-card]');
  const branchEmpty = document.querySelector('[data-branch-empty]');
  if (branchSearch && branchCards.length) {
    const filterBranches = () => {
      const searchTerm = branchSearch.value.trim().toLowerCase();
      let visibleCount = 0;
      branchCards.forEach((card) => {
        const isVisible = card.dataset.branchName.toLowerCase().includes(searchTerm);
        card.hidden = !isVisible;
        if (isVisible) visibleCount += 1;
      });
      if (branchEmpty) branchEmpty.hidden = visibleCount > 0;
    };
    branchSearch.addEventListener('input', filterBranches);
  }

  const calculateRangeTotal = (records, range) => {
    const now = new Date();
    const startOfWeek = new Date(now);
    startOfWeek.setDate(now.getDate() - now.getDay());
    startOfWeek.setHours(0, 0, 0, 0);

    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);

    return records.reduce((sum, record) => {
      if (!record.capturedAt || !record.clockedOutAt) return sum;
      const startTime = new Date(record.capturedAt).getTime();
      const endTime = new Date(record.clockedOutAt).getTime();
      let include = false;

      if (range === 'week') {
        include = startTime >= startOfWeek.getTime() && endTime <= (new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999)).getTime();
      }

      if (range === 'month') {
        include = startTime >= startOfMonth.getTime() && endTime <= endOfMonth.getTime();
      }

      if (!include) return sum;
      return sum + (Number(record.workedMilliseconds) || 0);
    }, 0);
  };

  if (historyTable) {
    const historyEntries = [...readHistory()].sort((a, b) => new Date(b.capturedAt) - new Date(a.capturedAt));

    historyEntries.forEach((record) => {
      const row = document.createElement('tr');
      const capturedDate = new Date(record.capturedAt);
      const clockedOutAt = record.clockedOutAt ? new Date(record.clockedOutAt) : null;
      const workedMilliseconds = Number(record.workedMilliseconds) || 0;
      const displayHours = workedMilliseconds > 0 ? formatDuration(workedMilliseconds) : '0h 0m';
      const statusClass = record.status === 'Late' ? 'warning' : 'success';
      row.innerHTML = `
        <td>${capturedDate.toLocaleDateString()}</td>
        <td>${capturedDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</td>
        <td>${clockedOutAt ? clockedOutAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '--'}</td>
        <td>${displayHours}</td>
        <td><span class="badge ${statusClass}">${record.status}</span></td>
      `;
      historyTable.appendChild(row);
    });

    if (totalWeekEl) totalWeekEl.textContent = formatDuration(calculateRangeTotal(historyEntries, 'week'));
    if (totalMonthEl) totalMonthEl.textContent = formatDuration(calculateRangeTotal(historyEntries, 'month'));
  }

  const monitoringRows = document.querySelector('[data-monitoring-rows]');
  if (monitoringRows) {
    const monitoringDate = document.querySelector('[data-monitoring-date]');
    const monitoringBranch = document.querySelector('[data-monitoring-branch]');
    const monitoringStatus = document.querySelector('[data-monitoring-status]');
    const monitoringSearch = document.querySelector('[data-monitoring-search]');
    const monitoringFeedback = document.querySelector('[data-monitoring-feedback]');
    const monitoringRowCount = document.querySelector('[data-monitoring-row-count]');
    const monitoringFooter = document.querySelector('[data-monitoring-footer]');
    const settingsDialog = document.querySelector('[data-admin-settings-dialog]');
    const settingsForm = document.querySelector('[data-admin-settings-form]');
    const liveUpdatesSetting = document.querySelector('[data-setting-live-updates]');
    const dateRangeSetting = document.querySelector('[data-setting-date-range]');
    const notificationsSetting = document.querySelector('[data-setting-notifications]');
    const settingsFeedback = document.querySelector('[data-admin-settings-feedback]');
    const monitoringSettings = {
      liveUpdates: true,
      defaultDateRange: 'today',
      clockInNotifications: false,
      ...JSON.parse(localStorage.getItem(adminMonitoringSettingsKey) || '{}')
    };
    let sharedAttendanceRecords = null;
    let attendanceChannel = null;
    let loadSharedAttendance = null;
    const monitoringRecords = () => (sharedAttendanceRecords || readHistory()).map((record) => ({
      ...record,
      capturedAt: record.capturedAt || record.captured_at,
      clockedOutAt: record.clockedOutAt || record.clocked_out_at,
      workedMilliseconds: record.workedMilliseconds ?? record.worked_milliseconds,
      distanceMeters: record.distanceMeters ?? record.distance_meters,
      inBounds: record.inBounds ?? record.in_bounds,
      lateByMilliseconds: record.lateByMilliseconds ?? record.late_by_milliseconds,
      employeeId: record.employeeId || record.employee_id || 'EMP-1001',
      employeeName: record.employeeName || record.employee_name || 'Demo Employee',
      branch: record.branch || 'HQ - Centurion',
      displayStatus: record.status === 'Completed' ? 'Present' : (record.late ? 'Late' : record.status)
    }));
    const toDateInputValue = (date) => {
      const offset = date.getTimezoneOffset() * 60000;
      return new Date(date.getTime() - offset).toISOString().slice(0, 10);
    };

    if (monitoringDate) monitoringDate.value = monitoringSettings.defaultDateRange === 'all' ? '' : toDateInputValue(new Date());
    if (liveUpdatesSetting) liveUpdatesSetting.checked = monitoringSettings.liveUpdates;
    if (dateRangeSetting) dateRangeSetting.value = monitoringSettings.defaultDateRange;
    if (notificationsSetting) notificationsSetting.checked = monitoringSettings.clockInNotifications;

    const updateRealtimeSubscription = () => {
      if (!supabaseConfigured || !supabaseClient || currentRole !== 'admin') return;
      if (!monitoringSettings.liveUpdates) {
        if (attendanceChannel) supabaseClient.removeChannel(attendanceChannel);
        attendanceChannel = null;
        if (monitoringFeedback) monitoringFeedback.textContent = 'Live updates paused. Use Generate Overview to refresh.';
        return;
      }
      if (attendanceChannel || !loadSharedAttendance) return;

      attendanceChannel = supabaseClient.channel('attendance-records-live')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'attendance_records' }, (payload) => {
          if (payload.eventType === 'INSERT' && monitoringSettings.clockInNotifications && 'Notification' in window && Notification.permission === 'granted') {
            new Notification('Employee clocked in', {
              body: `${payload.new.employee_name} (${payload.new.employee_id})${payload.new.late ? ' clocked in late.' : ' is now present.'}`
            });
          }
          loadSharedAttendance().catch((error) => {
            if (monitoringFeedback) monitoringFeedback.textContent = `Live refresh failed: ${error.message}`;
          });
        })
        .subscribe((status) => {
          if (status === 'CHANNEL_ERROR' && monitoringFeedback) {
            monitoringFeedback.textContent = 'Live updates are unavailable. Check Supabase Realtime settings.';
          }
        });
    };

    document.addEventListener('click', (event) => {
      const settingsTrigger = event.target.closest('[data-open-admin-settings]');
      if (!settingsTrigger) return;
      event.preventDefault();
      settingsDialog?.showModal();
    });
    document.querySelectorAll('[data-close-admin-settings]').forEach((button) => {
      button.addEventListener('click', () => settingsDialog?.close());
    });

    settingsForm?.addEventListener('submit', async (event) => {
      event.preventDefault();
      let notificationsEnabled = notificationsSetting.checked;
      let notificationMessage = '';
      if (notificationsEnabled && !('Notification' in window)) {
        notificationsEnabled = false;
        notificationMessage = 'This browser does not support notifications.';
      } else if (notificationsEnabled && Notification.permission !== 'granted') {
        const permission = await Notification.requestPermission();
        notificationsEnabled = permission === 'granted';
        if (!notificationsEnabled) notificationMessage = 'Notification permission was not granted.';
      }

      monitoringSettings.liveUpdates = liveUpdatesSetting.checked;
      monitoringSettings.defaultDateRange = dateRangeSetting.value;
      monitoringSettings.clockInNotifications = notificationsEnabled;
      localStorage.setItem(adminMonitoringSettingsKey, JSON.stringify(monitoringSettings));
      if (notificationsSetting) notificationsSetting.checked = notificationsEnabled;
      if (monitoringDate) monitoringDate.value = monitoringSettings.defaultDateRange === 'all' ? '' : toDateInputValue(new Date());
      renderMonitoring();
      updateRealtimeSubscription();
      if (settingsFeedback) {
        settingsFeedback.textContent = notificationMessage || 'Settings saved on this device.';
      }
      if (monitoringFeedback) monitoringFeedback.textContent = notificationMessage || 'Settings saved on this device.';
      settingsDialog?.close();
    });

    const renderMonitoring = () => {
      const selectedDate = monitoringDate ? monitoringDate.value : '';
      const selectedBranch = monitoringBranch ? monitoringBranch.value : 'all';
      const selectedStatus = monitoringStatus ? monitoringStatus.value : 'all';
      const searchTerm = monitoringSearch ? monitoringSearch.value.trim().toLowerCase() : '';
      const records = monitoringRecords().filter((record) => {
        const recordDate = toDateInputValue(new Date(record.capturedAt));
        const matchesDate = !selectedDate || recordDate === selectedDate;
        const matchesBranch = selectedBranch === 'all' || record.branch === selectedBranch;
        const matchesStatus = selectedStatus === 'all' || record.displayStatus === selectedStatus;
        const matchesSearch = !searchTerm || `${record.employeeId} ${record.employeeName}`.toLowerCase().includes(searchTerm);
        return matchesDate && matchesBranch && matchesStatus && matchesSearch;
      }).sort((first, second) => new Date(second.capturedAt) - new Date(first.capturedAt));

      const allRecords = monitoringRecords();
      const presentCount = allRecords.filter((record) => record.displayStatus === 'Present').length;
      const lateCount = allRecords.filter((record) => record.displayStatus === 'Late').length;
      const outOfBoundsCount = allRecords.filter((record) => record.inBounds === false).length;
      const activeCount = allRecords.filter((record) => !record.clockedOutAt).length;
      const presentEl = document.getElementById('monitoring-present');
      const lateEl = document.getElementById('monitoring-late');
      const outOfBoundsEl = document.getElementById('monitoring-out-of-bounds');
      const activeEl = document.getElementById('monitoring-active');
      if (presentEl) presentEl.textContent = presentCount;
      if (lateEl) lateEl.textContent = lateCount;
      if (outOfBoundsEl) outOfBoundsEl.textContent = outOfBoundsCount;
      if (activeEl) activeEl.textContent = activeCount;

      monitoringRows.innerHTML = '';
      records.forEach((record) => {
        const capturedAt = new Date(record.capturedAt);
        const clockedOutAt = record.clockedOutAt ? new Date(record.clockedOutAt) : null;
        const status = record.displayStatus || 'Present';
        const statusClass = status.toLowerCase().replace(/\s+/g, '-');
        const row = document.createElement('tr');
        row.innerHTML = `<td>${record.employeeId}</td><td>${record.employeeName}</td><td>${capturedAt.toLocaleDateString()}</td><td>${capturedAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</td><td>${clockedOutAt ? clockedOutAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '--:--'}</td><td>${record.workedMilliseconds ? formatDuration(record.workedMilliseconds) : 'Active'}</td><td><span class="monitoring-status ${statusClass}"><span>●</span> ${status}</span></td>`;
        monitoringRows.appendChild(row);
      });

      if (!records.length) monitoringRows.innerHTML = '<tr><td class="monitoring-empty" colspan="7">No attendance records match these filters.</td></tr>';
      if (monitoringRowCount) monitoringRowCount.textContent = `Rows: ${records.length}`;
      if (monitoringFooter) monitoringFooter.textContent = `Showing ${records.length} of ${monitoringRecords().length} rows`;
    };

    document.querySelector('[data-monitoring-generate]')?.addEventListener('click', () => {
      renderMonitoring();
      if (monitoringFeedback) monitoringFeedback.textContent = 'Live overview updated.';
    });
    [monitoringSearch, monitoringDate, monitoringBranch, monitoringStatus].forEach((control) => control?.addEventListener('input', renderMonitoring));
    document.querySelectorAll('[data-monitoring-export]').forEach((button) => {
      button.addEventListener('click', () => {
        const rows = monitoringRecords().map((record) => `${record.employeeId},${record.employeeName},${record.capturedAt},${record.clockedOutAt || ''},${record.displayStatus}`).join('\n');
        const link = document.createElement('a');
        link.href = URL.createObjectURL(new Blob([`employee_id,name,clock_in,clock_out,status\n${rows}`], { type: 'text/csv' }));
        link.download = `attendance-overview.${button.dataset.monitoringExport === 'csv' ? 'csv' : 'csv'}`;
        link.click();
        URL.revokeObjectURL(link.href);
        if (monitoringFeedback) monitoringFeedback.textContent = `${button.dataset.monitoringExport.toUpperCase()} export downloaded.`;
      });
    });
    renderMonitoring();

    if (supabaseConfigured && supabaseClient && currentRole === 'admin') {
      loadSharedAttendance = async () => {
        const { data, error } = await supabaseClient
          .from('attendance_records')
          .select('*')
          .order('captured_at', { ascending: false });
        if (error) throw error;
        sharedAttendanceRecords = data || [];
        renderMonitoring();
      };

      if (monitoringFeedback) monitoringFeedback.textContent = 'Connecting to shared attendance...';
      loadSharedAttendance().then(() => {
        if (monitoringFeedback) monitoringFeedback.textContent = 'Live attendance connected.';
      }).catch((error) => {
        if (monitoringFeedback) monitoringFeedback.textContent = `Could not load shared attendance: ${error.message}`;
      });
      updateRealtimeSubscription();
    }
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

  const faceEnrollmentForm = document.querySelector('[data-face-enrollment-form]');
  if (faceEnrollmentForm) {
    const faceEnrollmentFeedback = document.querySelector('[data-face-enrollment-feedback]');
    faceEnrollmentForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      const employeeId = document.getElementById('face-employee-id').value.trim();
      const photoInput = document.getElementById('face-reference-photo');
      const file = photoInput.files && photoInput.files[0];
      if (!employeeId || !file) {
        faceEnrollmentFeedback.textContent = 'Enter the employee ID and choose an approved reference photo.';
        return;
      }

      const submitButton = faceEnrollmentForm.querySelector('[type="submit"]');
      submitButton.disabled = true;

      try {
        if (supabaseClient && supabaseConfigured && currentRole === 'admin') {
          faceEnrollmentFeedback.textContent = 'Uploading approved reference photo securely...';
          const formData = new FormData(faceEnrollmentForm);
          const { data, error } = await supabaseClient.functions.invoke('enroll-face-reference', {
            body: formData
          });
          if (error) throw new Error(data?.error || error.message);
          faceEnrollmentFeedback.textContent = `Approved reference photo enrolled for ${data.employeeId}.`;
          faceEnrollmentForm.reset();
          return;
        }

        faceEnrollmentFeedback.textContent = 'Saving approved employee reference locally for this prototype...';
        const reader = new FileReader();
        const result = await new Promise((resolve, reject) => {
          reader.onload = () => resolve(reader.result);
          reader.onerror = () => reject(new Error('The reference photo could not be read.'));
          reader.readAsDataURL(file);
        });

        const references = readFaceReferences();
        references[employeeId] = {
          employeeId,
          dataUrl: result,
          enrolledAt: new Date().toISOString(),
          source: 'admin-enrollment'
        };
        saveFaceReferences(references);
        faceEnrollmentFeedback.textContent = `Approved face reference linked to ${employeeId}.`;
        faceEnrollmentForm.reset();
      } catch (error) {
        faceEnrollmentFeedback.textContent = `Enrollment failed: ${error.message}`;
      } finally {
        submitButton.disabled = false;
      }
    });
  }
});
