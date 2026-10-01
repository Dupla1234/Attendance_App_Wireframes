window.ATTENDANCE_SUPABASE_CONFIG = {
  url: '',
  anonKey: ''
};

const supabaseConfig = window.ATTENDANCE_SUPABASE_CONFIG;
window.attendanceSupabaseClient = supabaseConfig.url && supabaseConfig.anonKey && window.supabase
  ? window.supabase.createClient(supabaseConfig.url, supabaseConfig.anonKey)
  : null;
