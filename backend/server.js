const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const dotenv = require('dotenv');

dotenv.config();

const app = express();
const PORT = process.env.PORT || 4000;
const JWT_SECRET = process.env.JWT_SECRET || 'attendance-dev-secret';

app.use(cors({
  origin: true,
  credentials: true,
}));
app.use(express.json());

const employeeUsers = [
  {
    id: 'EMP-0000',
    password: 'password',
    role: 'employee',
    name: 'Jane Smith',
    email: 'jane@company.com',
    branch: 'HQ - Centurion',
    status: 'active',
  },
];

const employerUsers = [
  {
    id: 'ADMIN-100',
    password: 'admin123',
    role: 'employer',
    name: 'Admin User',
    email: 'admin@company.com',
    branch: 'HQ - Centurion',
    status: 'active',
  },
];

const attendanceRecords = [
  {
    id: 1,
    employeeId: 'EMP-0000',
    date: '2026-09-02',
    checkIn: '08:58 AM',
    checkOut: '05:12 PM',
    status: 'Present',
  },
  {
    id: 2,
    employeeId: 'EMP-0000',
    date: '2026-09-01',
    checkIn: '09:13 AM',
    checkOut: '05:02 PM',
    status: 'Late',
  },
];

const dashboardState = {
  branch: 'HQ - Centurion',
  address: '1293 South Street Maxi Building',
  gpsStatus: 'In-Bounds',
  clockedIn: false,
};

const getUserByCredentials = (userId, password) => {
  const user = [...employeeUsers, ...employerUsers].find(
    (entry) => entry.id === userId && entry.password === password,
  );

  return user || null;
};

const createToken = (user) => jwt.sign({ id: user.id, role: user.role }, JWT_SECRET, { expiresIn: '8h' });

const requireAuth = (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing or invalid token' });
  }

  const token = authHeader.replace('Bearer ', '');

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (error) {
    return res.status(401).json({ error: 'Invalid token' });
  }
};

const requireRole = (role) => (req, res, next) => {
  if (req.user.role !== role) {
    return res.status(403).json({ error: 'Access denied for this role' });
  }
  next();
};

app.get('/health', (req, res) => {
  res.json({ ok: true, service: 'attendance-api', time: new Date().toISOString() });
});

app.post('/api/auth/login', (req, res) => {
  const { userId, password } = req.body || {};

  if (!userId || !password) {
    return res.status(400).json({ error: 'userId and password are required' });
  }

  const user = getUserByCredentials(userId, password);

  if (!user) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  const token = createToken(user);

  return res.json({
    token,
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      branch: user.branch,
    },
  });
});

app.get('/api/employee/dashboard', requireAuth, requireRole('employee'), (req, res) => {
  const user = employeeUsers.find((entry) => entry.id === req.user.id);

  if (!user) {
    return res.status(404).json({ error: 'Employee not found' });
  }

  return res.json({
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      branch: user.branch,
    },
    dashboard: {
      branch: dashboardState.branch,
      address: dashboardState.address,
      gpsStatus: dashboardState.gpsStatus,
      clockedIn: dashboardState.clockedIn,
      currentTime: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    },
  });
});

app.post('/api/employee/checkin', requireAuth, requireRole('employee'), (req, res) => {
  dashboardState.clockedIn = !dashboardState.clockedIn;

  res.json({
    success: true,
    clockedIn: dashboardState.clockedIn,
    message: dashboardState.clockedIn ? 'Clock-in recorded' : 'Clock-out recorded',
  });
});

app.get('/api/employee/history', requireAuth, requireRole('employee'), (req, res) => {
  res.json({
    records: attendanceRecords.filter((record) => record.employeeId === req.user.id),
  });
});

app.get('/api/admin/dashboard', requireAuth, requireRole('employer'), (req, res) => {
  res.json({
    metrics: {
      employeesActive: 428,
      presentToday: 356,
      lateArrivals: 18,
      outOfBounds: 7,
    },
    alerts: [
      '3 employees are outside branch radius.',
      '2 devices disconnected from sync service.',
      '1 branch is due for verification.',
    ],
  });
});

app.get('/api/admin/employees', requireAuth, requireRole('employer'), (req, res) => {
  const employees = [
    { name: 'Jane Smith', employeeId: 'EMP-1024', branch: 'HQ - Centurion', status: 'Active' },
    { name: 'David Johnson', employeeId: 'EMP-3052', branch: 'North Ridge', status: 'Late' },
    { name: 'Maria Garcia', employeeId: 'EMP-2081', branch: 'West End', status: 'Out of Bounds' },
  ];

  res.json({ employees });
});

app.get('/api/admin/branches', requireAuth, requireRole('employer'), (req, res) => {
  const branches = [
    { name: 'HQ - Centurion', address: '1293 South Street', radius: '250m', status: 'Active' },
    { name: 'North Ridge', address: '44 Orange Road', radius: '180m', status: 'Review' },
    { name: 'West End', address: '8 Cedar Lane', radius: '220m', status: 'Outdated' },
  ];

  res.json({ branches });
});

app.get('/api/admin/reports', requireAuth, requireRole('employer'), (req, res) => {
  res.json({
    punctuality: '92.5%',
    absenceRate: '4.1%',
    geofencingFailures: 11,
    periods: [
      { period: 'Last 7 Days', onTime: '88%', late: '7%', absent: '5%' },
      { period: 'Last 30 Days', onTime: '91%', late: '6%', absent: '3%' },
      { period: 'Quarter', onTime: '93%', late: '4%', absent: '3%' },
    ],
  });
});

app.listen(PORT, () => {
  console.log(`Attendance API running on http://localhost:${PORT}`);
});
