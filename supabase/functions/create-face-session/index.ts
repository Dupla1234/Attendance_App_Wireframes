import { CreateFaceLivenessSessionCommand } from 'npm:@aws-sdk/client-rekognition@3.1147.0';
import { getProfile, handleOptions, jsonResponse, rekognition, requireUser, supabaseAdmin } from '../_shared/face.ts';

Deno.serve(async (request: Request) => {
  const options = handleOptions(request);
  if (options) return options;
  if (request.method !== 'POST') return jsonResponse({ error: 'METHOD_NOT_ALLOWED' }, 405);

  try {
    const user = await requireUser(request);
    const profile = await getProfile(user.id);
    if (profile.role !== 'employee') return jsonResponse({ error: 'EMPLOYEE_ACCOUNT_REQUIRED' }, 403);
    if (!profile.face_reference_path) return jsonResponse({ error: 'FACE_ENROLLMENT_REQUIRED' }, 403);

    const response = await rekognition.send(new CreateFaceLivenessSessionCommand({
      ClientRequestToken: crypto.randomUUID(),
      Settings: {
        AuditImagesLimit: 0,
        ChallengePreferences: [{ Type: 'FaceMovementAndLightChallenge' }]
      }
    }));
    if (!response.SessionId) throw new Error('FACE_SESSION_CREATION_FAILED');

    const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString();
    const { error } = await supabaseAdmin.from('face_verification_sessions').insert({
      user_id: user.id,
      aws_session_id: response.SessionId,
      expires_at: expiresAt
    });
    if (error) throw new Error('FACE_SESSION_STORAGE_FAILED');

    return jsonResponse({ sessionId: response.SessionId, region: Deno.env.get('AWS_REGION') });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'FACE_SESSION_CREATION_FAILED';
    const status = message === 'AUTHENTICATION_REQUIRED' ? 401 : 400;
    return jsonResponse({ error: message }, status);
  }
});
