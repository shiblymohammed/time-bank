import { respond } from '@/lib/server-api';
export const dynamic = 'force-dynamic';
// Read when the page loads so one image can serve every environment. These values identify the
// Firebase web app and are not secrets; sign-in stays limited by Firebase's authorized domains.
export function GET() {
  const apiKey = process.env['FIREBASE_WEB_API_KEY'];
  const authDomain = process.env['FIREBASE_WEB_AUTH_DOMAIN'];
  const projectId = process.env['FIREBASE_PROJECT_ID'];
  const appId = process.env['FIREBASE_WEB_APP_ID'];
  return respond(
    apiKey && authDomain && projectId && appId ? { apiKey, authDomain, projectId, appId } : {},
  );
}
