// Run against next dev: NODE_PATH=<playwright module directory> node --test test/service-operations.e2e.cjs
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { chromium } = require('playwright');

test('service operations send tenant context, typed payloads and display API errors', async () => {
  const browser = await chromium.launch({
    headless: true,
    ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {}),
  });
  try {
    const page = await browser.newPage();
    const writes = [],
      reads = [],
      errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.route('**/backend/**', async (route) => {
      const req = route.request(),
        url = new URL(req.url()),
        path = url.pathname;
      let body = [],
        status = 200;
      if (req.method() !== 'GET') {
        writes.push({ path, body: req.postDataJSON(), headers: req.headers() });
        if (path.endsWith('/otp/request')) body = { devOtp: '123456' };
        else if (path.endsWith('/otp/verify'))
          body = {
            accessToken: 'token',
            refreshToken: 'refresh',
            isSuperAdmin: true,
            user: { id: 'admin' },
          };
        else if (path.endsWith('/skills/verify')) {
          status = 400;
          body = { message: ['Skill evidence missing'] };
        } else body = { id: 'saved' };
      } else {
        reads.push(path + url.search);
        if (path.endsWith('/v1/organizations'))
          body = { data: [{ id: 'org-1', name: 'Kottakkal', code: 'KTB', status: 'ACTIVE' }] };
        else if (path.endsWith('/overview'))
          body = {
            totalUsers: 1,
            totalOrganizations: 1,
            activeOrganizations: 1,
            totalUniversalWallets: 1,
            totalBalanceCredits: 0,
            pendingMemberships: 0,
          };
        else if (path.endsWith('/audit-logs')) body = { events: [], total: 0 };
        else if (path.endsWith('/memberships'))
          body = {
            memberships: [
              {
                id: 'member-1',
                status: 'APPROVED',
                roleGrants: [],
                organizationId: 'org-1',
                user: { phoneE164: '+919876543210' },
              },
            ],
            total: 1,
          };
        else if (path.endsWith('/categories'))
          body = [{ id: 'category-1', nameEn: 'Care', code: 'CARE', isActive: true }];
        else if (path.endsWith('/availability'))
          body = {
            isAvailableImmediate: false,
            maxTravelRadiusKm: 2.5,
            preferredWardNumbers: ['14'],
          };
        else if (path.endsWith('/volunteers/member-1/zones'))
          body = [{ id: 'assignment-zone', zoneId: 'zone-1', zone: { name: 'North' } }];
        else if (path.endsWith('/global'))
          body = [
            { id: 'service-1', nameEn: 'Hospital accompaniment', code: 'HOSPITAL', isActive: true },
          ];
        else if (path.endsWith('/requests'))
          body = {
            data: [
              {
                id: 'request-1',
                requestNumber: 'REQ-001',
                status: 'MATCHING_ACTIVE',
                scheduledStartTime: '2026-11-01T10:00:00Z',
                locationWardNumber: '14',
              },
            ],
            total: 21,
          };
        else if (path.endsWith('/requests/request-1'))
          body = {
            id: 'request-1',
            requestNumber: 'REQ-001',
            status: 'MATCHING_ACTIVE',
            locationAddressText: 'Taluk Hospital',
            assignments: [],
          };
        else if (path.endsWith('/eligibility')) {
          status = 404;
          body = { message: 'No eligibility' };
        } else if (path.endsWith('/zones'))
          body = [
            { id: 'zone-1', name: 'North', code: 'NORTH', wardNumbers: ['14'], isActive: true },
          ];
      }
      await route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
    });
    await page.goto(process.env.WEB_TEST_URL || 'http://localhost:3000');
    await page.getByLabel('Mobile number').fill('+919876543210');
    await page.getByRole('button', { name: 'Send code' }).click();
    await page.getByRole('button', { name: 'Verify and sign in' }).click();
    await page.locator('#nav-services').click();
    await page.getByRole('heading', { name: 'Service categories' }).waitFor();
    await page.locator('#tenant-select').selectOption('org-1');
    const form = (title) =>
      page.locator('form').filter({ has: page.getByRole('heading', { name: title, exact: true }) });
    const category = form('Create category');
    await category.getByLabel('Category code').fill('home_care');
    await category.getByLabel('English name').fill('Home care');
    await category.getByLabel('Malayalam name').fill('വീട്ടിൽ പരിചരണം');
    await category.getByRole('button').click();
    await page.getByText('Saved successfully.', { exact: true }).waitFor();
    assert.equal(writes.find((w) => w.path.endsWith('/categories')).body.code, 'HOME_CARE');
    await page.getByRole('button', { name: 'Requests', exact: true }).click();
    await page.getByText('REQ-001', { exact: true }).waitFor();
    await Promise.all([
      page.waitForResponse((r) => r.url().includes('/requests?page=2&limit=20')),
      page.getByRole('button', { name: 'Next', exact: true }).click(),
    ]);
    await page.getByText('Page 2', { exact: false }).waitFor();
    assert.ok(reads.some((r) => r.includes('/requests?page=2&limit=20')));
    await page.getByRole('button', { name: 'View details' }).click();
    const dispatch = form('Dispatch volunteer');
    await dispatch.getByLabel('Dispatch notes').fill('Confirmed by telephone');
    await dispatch.getByRole('button').click();
    await page.getByText('Saved successfully.', { exact: true }).waitFor();
    const sent = writes.find((w) => w.path.endsWith('/dispatch'));
    assert.equal(sent.body.volunteerMembershipId, 'member-1');
    assert.equal(sent.headers['x-organization-id'], 'org-1');
    assert.equal(sent.headers.authorization, 'Bearer token');
    await page.getByRole('button', { name: 'Beneficiaries', exact: true }).click();
    await form('Look up beneficiary').getByRole('button').click();
    await page.getByText('No eligibility record found.', { exact: true }).waitFor();
    const eligibility = form('Grant or renew eligibility');
    await eligibility.getByLabel('Review due', { exact: true }).fill('2027-10-27T10:00');
    await eligibility.getByRole('button').click();
    await page.getByText('Saved successfully.', { exact: true }).waitFor();
    const granted = writes.find((w) => w.path.endsWith('/beneficiaries/eligibility'));
    assert.equal(granted.body.monthlyRequestQuota, 8);
    assert.deepEqual(granted.body.approvedAssistanceCategories, ['*']);
    assert.ok(granted.body.reviewDueAt.endsWith('Z'));
    await page.getByRole('button', { name: 'Zones & volunteers', exact: true }).click();
    await form('Look up volunteer').getByRole('button').click();
    await page.getByRole('heading', { name: 'Update volunteer availability' }).waitFor();
    await form('Update volunteer availability')
      .getByLabel('Travel radius in km (0.5–50)')
      .fill('3.5');
    await form('Update volunteer availability').getByRole('button').click();
    await page.getByText('Saved successfully.', { exact: true }).waitFor();
    const preferences = writes.find((w) => w.path.endsWith('/availability'));
    assert.equal(preferences.body.maxTravelRadiusKm, 3.5);
    assert.equal(preferences.body.isAvailableImmediate, false);
    assert.deepEqual(preferences.body.preferredWardNumbers, ['14']);
    await form('Look up volunteer').getByRole('button').click();
    await page.getByRole('button', { name: 'Remove from zone' }).click();
    await page.getByText('Saved successfully.', { exact: true }).waitFor();
    assert.ok(writes.some((w) => w.path.endsWith('/zones/zone-1/volunteers/member-1')));
    await form('Verify volunteer skill').getByLabel('Skill code').fill('FIRST_AID');
    await form('Verify volunteer skill').getByRole('button').click();
    await page.getByRole('alert').filter({ hasText: 'Skill evidence missing' }).first().waitFor();
    await page.locator('#tenant-select').selectOption('GLOBAL');
    await page.getByRole('button', { name: 'Requests', exact: true }).click();
    await page.getByText('Select an active organization', { exact: false }).waitFor();
    assert.equal(
      await page.getByRole('heading', { name: 'Create service request', exact: true }).count(),
      0,
    );
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
  }
});
