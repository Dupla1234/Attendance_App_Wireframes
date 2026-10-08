import { getProfile, handleOptions, jsonResponse, requireUser, supabaseAdmin } from '../_shared/face.ts';

Deno.serve(async (request: Request) => {
  const options = handleOptions(request);
  if (options) return options;
  if (request.method !== 'POST') return jsonResponse({ error: 'METHOD_NOT_ALLOWED' }, 405);

  try {
    const admin = await requireUser(request);
    const adminProfile = await getProfile(admin.id);
    if (adminProfile.role !== 'admin') return jsonResponse({ error: 'ADMIN_ACCOUNT_REQUIRED' }, 403);

    const form = await request.formData();
    const employeeId = String(form.get('employeeId') || '').trim().toUpperCase();
    const photo = form.get('photo');
    if (!employeeId || !(photo instanceof File)) return jsonResponse({ error: 'EMPLOYEE_AND_PHOTO_REQUIRED' }, 400);
    if (!['image/jpeg', 'image/png'].includes(photo.type) || photo.size > 5 * 1024 * 1024) {
      return jsonResponse({ error: 'UPLOAD_JPEG_OR_PNG_UP_TO_5MB' }, 400);
    }

    const { data: employee, error: employeeError } = await supabaseAdmin
      .from('employee_profiles')
      .select('user_id, employee_id, face_reference_path')
      .eq('employee_id', employeeId)
      .eq('role', 'employee')
      .single();
    if (employeeError || !employee) return jsonResponse({ error: 'EMPLOYEE_NOT_FOUND' }, 404);

    const extension = photo.type === 'image/png' ? 'png' : 'jpg';
    const objectPath = `${employee.user_id}/approved-reference.${extension}`;
    const { error: uploadError } = await supabaseAdmin.storage
      .from('face-references')
      .upload(objectPath, photo, { contentType: photo.type, upsert: true });
    if (uploadError) throw new Error('PRIVATE_FACE_PHOTO_UPLOAD_FAILED');

    const { error: profileError } = await supabaseAdmin.from('employee_profiles').update({
      face_reference_path: objectPath,
      face_enrolled_at: new Date().toISOString()
    }).eq('user_id', employee.user_id);
    if (profileError) throw new Error('EMPLOYEE_FACE_ENROLLMENT_FAILED');

    return jsonResponse({ success: true, employeeId: employee.employee_id });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'FACE_ENROLLMENT_FAILED';
    const status = message === 'AUTHENTICATION_REQUIRED' ? 401 : 400;
    return jsonResponse({ error: message }, status);
  }
});
