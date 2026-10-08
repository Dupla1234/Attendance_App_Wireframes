import React, { useCallback, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Amplify } from 'aws-amplify';
import { FaceLivenessDetector } from '@aws-amplify/ui-react-liveness';
import '@aws-amplify/ui-react/styles.css';

function FaceLiveness({ supabaseClient, awsRegion, identityPoolId, onVerified, onCancel }) {
  const [sessionId, setSessionId] = useState('');
  const [message, setMessage] = useState('Preparing secure face check...');
  const [error, setError] = useState('');
  const [isVerifying, setIsVerifying] = useState(false);
  const [hasConsented, setHasConsented] = useState(false);

  useEffect(() => {
    Amplify.configure({
      Auth: {
        Cognito: {
          identityPoolId,
          allowGuestAccess: true
        }
      }
    });
  }, [identityPoolId]);

  const createSession = useCallback(async () => {
    setError('');
    setSessionId('');
    setMessage('Preparing secure face check...');
    const { data, error: sessionError } = await supabaseClient.functions.invoke('create-face-session', { body: {} });
    if (sessionError || !data?.sessionId) throw new Error(sessionError?.message || data?.error || 'Could not create a face-check session.');
    setSessionId(data.sessionId);
    setMessage('');
  }, [supabaseClient]);

  const handleAnalysisComplete = async () => {
    setIsVerifying(true);
    setError('');
    setMessage('Checking liveness and matching your approved profile photo...');
    try {
      let result;
      for (let attempt = 0; attempt < 8; attempt += 1) {
        const response = await supabaseClient.functions.invoke('verify-face-session', { body: { sessionId } });
        if (response.error && response.data?.error !== 'processing') throw new Error(response.data?.error || response.error.message);
        result = response.data;
        if (result?.status !== 'processing') break;
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
      if (!result?.verified || !result.verificationId) throw new Error(result?.error || 'Face verification did not pass. Please try again.');
      onVerified(result.verificationId);
    } catch (verificationError) {
      setError(verificationError.message);
      setMessage('Verification failed. A new check is required to retry.');
    } finally {
      setIsVerifying(false);
    }
  };

  const retry = () => {
    createSession().catch((sessionError) => {
      setError(sessionError.message);
      setMessage('Face verification is not ready.');
    });
  };

  return (
    <div className="face-liveness-content">
      <p className="face-liveness-message" aria-live="polite">{message}</p>
      {error && <p className="face-liveness-error" role="alert">{error}</p>}
      {!sessionId && !isVerifying && (
        <div className="face-liveness-consent">
          <p>Your live camera check is processed by AWS Rekognition and compared with the approved staff photo held in private storage. This app does not store the liveness video.</p>
          <label><input type="checkbox" checked={hasConsented} onChange={(event) => setHasConsented(event.target.checked)} /> I consent to this face/liveness check for this clock-in.</label>
          <button className="primary-btn" type="button" disabled={!hasConsented} onClick={() => createSession().catch((sessionError) => setError(sessionError.message))}>Start face check</button>
        </div>
      )}
      {sessionId && !isVerifying && (
        <FaceLivenessDetector
          key={sessionId}
          sessionId={sessionId}
          region={awsRegion}
          onAnalysisComplete={handleAnalysisComplete}
          onError={(event) => {
            setError(event.error?.message || 'Camera verification failed. Allow camera access and try again.');
            setMessage('This liveness session cannot be reused. Start a new check to retry.');
          }}
          onUserCancel={onCancel}
        />
      )}
      {isVerifying && <div className="face-liveness-progress" role="status">{message}</div>}
      {error && <div className="face-liveness-actions"><button className="secondary-btn" type="button" onClick={retry}>Try again</button><button className="ghost-btn" type="button" onClick={onCancel}>Cancel</button></div>}
    </div>
  );
}

window.AttendanceFaceLiveness = {
  mount(element, options) {
    const root = createRoot(element);
    root.render(<FaceLiveness {...options} />);
    return () => root.unmount();
  }
};
