# Supabase setup

The app stays in demo mode while `assets/js/supabase-config.js` has empty values. To enable hosted authentication and server-side browser registration:

1. Create a Supabase project.
2. Run `supabase/setup.sql` in the Supabase SQL Editor.
3. In `assets/js/supabase-config.js`, set `url` to the project URL and `anonKey` to the project's publishable/anon key. These client values are public; never put a service-role key in this file.
4. Create each user in Supabase Authentication with their work email and password. Then insert a matching row into `public.employee_profiles` using that Auth user's UUID, employee ID, name, branch, and role. For example:

	```sql
	insert into public.employee_profiles (user_id, employee_id, full_name, department, branch, role)
	values ('AUTH_USER_UUID', 'EMP-1001', 'Employee Name', null, 'HQ - Centurion', 'employee');
	```

	Replace `AUTH_USER_UUID` with the user's ID shown in Supabase Authentication. The employee's department may be left null; they choose it on their first sign-in. Confirm invited users in Supabase Auth if email confirmation is enabled.
5. In Supabase Authentication URL Configuration, set the production site URL and add the official HTTPS domain to the allowed redirect URLs before publishing.
6. Publish the static app over HTTPS. Browser location access and service workers require HTTPS (localhost is also allowed for testing).

## Test live face verification

Face checks remain unavailable until this section is configured. Production Supabase clock-in fails closed if the face bundle, public AWS identity-pool settings, approved reference, or backend function is missing.

1. Create an AWS account and enable Amazon Rekognition Face Liveness in the AWS region you choose. Use the same region for Rekognition and the Cognito Identity Pool.
2. Create a Cognito Identity Pool that allows guest identities. Give its unauthenticated role only `rekognition:StartFaceLivenessSession` permission. The pool ID and region are public client configuration; AWS access keys are not.
3. Create a dedicated AWS IAM principal for the Supabase Edge Functions with only `rekognition:CreateFaceLivenessSession`, `rekognition:GetFaceLivenessSessionResults`, and `rekognition:CompareFaces` access. Keep those credentials in Supabase Function secrets, never in browser files.
4. Deploy `supabase/setup.sql` in the Supabase SQL Editor. It creates a private `face-references` Storage bucket, session records, row-level security, and a single-use `clock_in_with_face` RPC. Direct client inserts into attendance are intentionally disabled.
5. Deploy the three functions with the Supabase CLI: `supabase functions deploy create-face-session`, `supabase functions deploy verify-face-session`, and `supabase functions deploy enroll-face-reference`.
6. Set Edge Function secrets in your own terminal (do not send AWS secrets in chat):

	```powershell
	supabase secrets set AWS_REGION=YOUR_REGION AWS_ACCESS_KEY_ID=YOUR_IAM_ACCESS_KEY AWS_SECRET_ACCESS_KEY=YOUR_IAM_SECRET APP_ORIGIN=https://your-domain.example FACE_LIVENESS_CONFIDENCE_THRESHOLD=90 FACE_MATCH_SIMILARITY_THRESHOLD=90
	```

	Supabase supplies its project URL, anon key, and service-role key to Edge Functions. Never expose the service-role key or AWS IAM secrets to the browser.
7. Set `faceLiveness.awsRegion` and `faceLiveness.identityPoolId` in `assets/js/supabase-config.js`. Then build the detector assets with `npm install` and `npm run build:face`; publish the generated `assets/js/face-build/` files with the site.
8. Create an employee account and profile in Supabase as described above. An admin signs into the app and enrolls an HR-approved JPEG/PNG photo under **Admin → Employees → Approved Face Reference**. The uploaded reference stays in private storage.
9. Test in the target AWS region and devices before using for real attendance. The app requests consent for each check, sends the live liveness flow to AWS Rekognition, compares its reference frame against the admin-approved photo server-side, and only then permits a one-use clock-in RPC. The liveness video/audit images are not saved by this app; confidence scores and verification metadata are retained in Supabase for attendance linkage.

Biometric processing is sensitive personal data. Obtain informed consent, define retention/access policies, provide an accessible non-biometric alternative where required, and confirm local employment/privacy law before using this to make attendance or employment decisions. Face matching and liveness are probabilistic, not a guarantee of identity.

With Supabase configured, login uses work email and password. The database stores the employee profile and department, and the `register_current_device` RPC enforces that one browser-generated device ID belongs to only one account. A different account on that browser is rejected. To release a device after an employee loses or replaces it, an administrator can remove its row in the Supabase SQL Editor using its device ID: `delete from public.device_registrations where device_id = 'DEVICE_UUID';`. The browser-generated ID is kept in local storage, so clearing site data or using another browser can create a new ID; ordinary websites cannot reliably identify physical hardware. Strong physical-device enforcement would require a native app with platform device attestation or managed-device controls.

The Admin Monitoring dashboard loads attendance records from Supabase and updates live when employees clock in or out. The employee Attendance History page and weekly/monthly summaries still use local browser history, and the existing admin user form does not provision Supabase Auth accounts. Keep the service-role key private and perform privileged account provisioning through a trusted server or Supabase dashboard.
