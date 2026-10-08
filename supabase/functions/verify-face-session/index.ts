import { CompareFacesCommand, GetFaceLivenessSessionResultsCommand } from 'npm:@aws-sdk/client-rekognition@3.1147.0';
import { getProfile, handleOptions, jsonResponse, rekognition, requireUser, supabaseAdmin } from '../_shared/face.ts';

Deno.serve(async (request: Request) => {
  const options = handleOptions(request);
  if (options) return options;
  if (request.method !== 'POST') return jsonResponse({ error: 'METHOD_NOT_ALLOWED' }, 405);

  try {
    const user = await requireUser(request);
    const profile = await getProfile(user.id);
    const { sessionId } = await request.json();
    if (typeof sessionId !== 'string') return jsonResponse({ error: 'SESSION_ID_REQUIRED' }, 400);
    if (!profile.face_reference_path) return jsonResponse({ error: 'FACE_ENROLLMENT_REQUIRED' }, 403);

    const { data: session, error: sessionError } = await supabaseAdmin
      .from('face_verification_sessions')
      .select('id, status, expires_at')
      .eq('aws_session_id', sessionId)
      .eq('user_id', user.id)
      .single();
    if (sessionError || !session) return jsonResponse({ error: 'FACE_SESSION_NOT_FOUND' }, 404);
    if (session.status !== 'pending' || new Date(session.expires_at).getTime() <= Date.now()) {
      return jsonResponse({ error: 'FACE_SESSION_EXPIRED_OR_USED' }, 409);
    }

    const liveness = await rekognition.send(new GetFaceLivenessSessionResultsCommand({ SessionId: sessionId }));
    if (liveness.Status === 'IN_PROGRESS') return jsonResponse({ status: 'processing' }, 202);

    const livenessThreshold = Number(Deno.env.get('FACE_LIVENESS_CONFIDENCE_THRESHOLD') || '90');
    const matchThreshold = Number(Deno.env.get('FACE_MATCH_SIMILARITY_THRESHOLD') || '90');
    const livenessScore = liveness.Confidence || 0;
    const referenceBytes = liveness.ReferenceImage?.Bytes;
    if (liveness.Status !== 'SUCCEEDED' || livenessScore < livenessThreshold || !referenceBytes) {
      await supabaseAdmin.from('face_verification_sessions').update({ status: 'failed', liveness_confidence: livenessScore }).eq('id', session.id);
      return jsonResponse({ verified: false, error: 'LIVENESS_CHECK_FAILED', confidence: livenessScore }, 403);
    }

    const { data: referencePhoto, error: photoError } = await supabaseAdmin.storage
      .from('face-references')
      .download(profile.face_reference_path);
    if (photoError || !referencePhoto) throw new Error('PRIVATE_FACE_REFERENCE_UNAVAILABLE');

    const targetBytes = new Uint8Array(await referencePhoto.arrayBuffer());
    const comparison = await rekognition.send(new CompareFacesCommand({
      SourceImage: { Bytes: referenceBytes },
      TargetImage: { Bytes: targetBytes },
      SimilarityThreshold: matchThreshold
    }));
    const faceMatchScore = comparison.FaceMatches?.[0]?.Similarity || 0;
    const verified = faceMatchScore >= matchThreshold;
    const { error: updateError } = await supabaseAdmin.from('face_verification_sessions').update({
      status: verified ? 'verified' : 'failed',
      liveness_confidence: livenessScore,
      face_match_similarity: faceMatchScore,
      verified_at: verified ? new Date().toISOString() : null
    }).eq('id', session.id).eq('status', 'pending');
    if (updateError) throw new Error('FACE_RESULT_SAVE_FAILED');

    return jsonResponse({
      verified,
      verificationId: verified ? session.id : null,
      livenessConfidence: livenessScore,
      faceMatchSimilarity: faceMatchScore
    }, verified ? 200 : 403);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'FACE_VERIFICATION_FAILED';
    const status = message === 'AUTHENTICATION_REQUIRED' ? 401 : 400;
    return jsonResponse({ error: message }, status);
  }
});
