import { createClient, type User } from 'npm:@supabase/supabase-js@2';
import { RekognitionClient } from 'npm:@aws-sdk/client-rekognition@3.1147.0';

export const corsHeaders = {
  'Access-Control-Allow-Origin': Deno.env.get('APP_ORIGIN') || '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};

export const jsonResponse = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { ...corsHeaders, 'Content-Type': 'application/json' }
});

export const supabaseAdmin = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

export const rekognition = new RekognitionClient({
  region: Deno.env.get('AWS_REGION')!,
  credentials: {
    accessKeyId: Deno.env.get('AWS_ACCESS_KEY_ID')!,
    secretAccessKey: Deno.env.get('AWS_SECRET_ACCESS_KEY')!
  }
});

export async function requireUser(request: Request): Promise<User> {
  const authorization = request.headers.get('Authorization');
  if (!authorization?.startsWith('Bearer ')) throw new Error('AUTHENTICATION_REQUIRED');

  const supabaseAuth = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: authorization } }, auth: { autoRefreshToken: false, persistSession: false } }
  );
  const { data, error } = await supabaseAuth.auth.getUser();
  if (error || !data.user) throw new Error('AUTHENTICATION_REQUIRED');
  return data.user;
}

export async function getProfile(userId: string) {
  const { data, error } = await supabaseAdmin
    .from('employee_profiles')
    .select('user_id, employee_id, full_name, department, branch, role, face_reference_path')
    .eq('user_id', userId)
    .single();
  if (error) throw new Error('EMPLOYEE_PROFILE_NOT_FOUND');
  return data;
}

export function handleOptions(request: Request) {
  return request.method === 'OPTIONS' ? new Response('ok', { headers: corsHeaders }) : null;
}
