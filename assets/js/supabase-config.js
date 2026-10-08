window.ATTENDANCE_SUPABASE_CONFIG = {
  url: 'https://YOUR_PROJECT_REF.supabase.co',
  anonKey: 'YOUR_SUPABASE_ANON_KEY',
  faceLiveness: {
    awsRegion: 'YOUR_AWS_REGION',
    identityPoolId: 'YOUR_COGNITO_IDENTITY_POOL_ID'
  }
};

const supabaseConfig = window.ATTENDANCE_SUPABASE_CONFIG;
window.attendanceSupabaseClient = supabaseConfig.url && supabaseConfig.anonKey && window.supabase
  ? window.supabase.createClient(supabaseConfig.url, supabaseConfig.anonKey)
  : null;
