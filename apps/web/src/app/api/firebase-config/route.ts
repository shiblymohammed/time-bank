import { respond } from '@/lib/server-api';
export const dynamic = 'force-dynamic';
// Read when the page loads so one image can serve every environment. These values identify the
// Firebase web app and are not secrets; sign-in stays limited by Firebase's authorized domains.
export function GET() {
  // The local demo flow deliberately uses the API's fixed 123456 OTP. Do not let an available
  // Firebase web configuration silently switch the sign-in screen back to Firebase in dev.
  if (process.env['NODE_ENV'] !== 'production' && process.env['AUTH_ALLOW_MOCK_OTP'] === 'true') {
    return respond({});
  }
  const apiKey = process.env['FIREBASE_WEB_API_KEY'];
  const authDomain = process.env['FIREBASE_WEB_AUTH_DOMAIN'];
  const projectId = process.env['FIREBASE_PROJECT_ID'];
  const appId = process.env['FIREBASE_WEB_APP_ID'];
  return respond(
    apiKey && authDomain && projectId && appId ? { apiKey, authDomain, projectId, appId } : {},
  );
}
