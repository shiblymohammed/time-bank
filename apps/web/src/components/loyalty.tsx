'use client';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ApiError, backend } from '@/lib/api';

type Row = Record<string, unknown>;
const words = (value: unknown) => (value == null ? '' : String(value));
const stamp = (value: unknown) =>
  value ? new Date(String(value)).toLocaleString('en-IN') : 'Not recorded';
const uuid = () => crypto.randomUUID();
function Field({
  label,
  value,
  onChange,
  type = 'text',
  min,
  max,
}: {
  label: string;
  value: string;
  onChange: (s: string) => void;
  type?: string;
  min?: number;
  max?: number;
}) {
  return (
    <label className="form-label">
      {label}
      <input
        className="form-input"
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        required
        min={min}
        max={max}
      />
    </label>
  );
}
function Status({ row }: { row: Row }) {
  return <span className="badge">{words(row.status).toLowerCase()}</span>;
}

export function Loyalty({
  organizationId: org,
  isGlobal,
  canManage,
  canProposeAwards,
  isMerchant,
  onExpired,
}: {
  organizationId: string | null;
  isGlobal: boolean;
  canManage: boolean;
  canProposeAwards: boolean;
  isMerchant: boolean;
  onExpired: () => void;
}) {
  const [revision, revise] = useState(0),
    [busy, setBusy] = useState(false),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(''),
    [notice, setNotice] = useState('');
  const [program, setProgram] = useState({ enabled: false, leaderboardEnabled: false });
  const [policies, setPolicies] = useState<Row[]>([]),
    [review, setReview] = useState<{ merchants: Row[]; offers: Row[] }>({
      merchants: [],
      offers: [],
    });
  const [own, setOwn] = useState<{
    merchant: Row | null;
    offers: Row[];
    receipts: Row[];
    volume: Row;
  }>({
    merchant: null,
    offers: [],
    receipts: [],
    volume: {},
  });
  const [campaigns, setCampaigns] = useState<Row[]>([]),
    [engagement, setEngagement] = useState<Row[]>([]);
  const keys = useRef(new Map<string, string>());
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  const retryKey = (kind: string, data: unknown) => {
    const key = kind + JSON.stringify(data);
    if (!keys.current.has(key)) keys.current.set(key, uuid());
    return keys.current.get(key)!;
  };
  const base = org ? `/organizations/${org}/loyalty` : '';
  const pending = busy || loading;
  const load = useCallback(
    async (signal: AbortSignal) => {
      if (isGlobal)
        setPolicies(await backend<Row[]>('/admin/loyalty/policies', 'GET', undefined, signal));
      if (!org) return;
      const settings = await backend<{
        program: { enabled: boolean; leaderboard_enabled: boolean };
      }>(`${base}/settings`, 'GET', undefined, signal);
      if (signal.aborted) return;
      setProgram({
        enabled: settings.program.enabled,
        leaderboardEnabled: settings.program.leaderboard_enabled,
      });
      if (canManage) {
        setReview(await backend(`${base}/review`, 'GET', undefined, signal));
        setCampaigns(await backend(`${base}/campaigns`, 'GET', undefined, signal));
      }
      if (canProposeAwards)
        setEngagement(await backend(`${base}/engagement`, 'GET', undefined, signal));
      if (isMerchant) setOwn(await backend(`${base}/merchant`, 'GET', undefined, signal));
    },
    [org, base, isGlobal, canManage, canProposeAwards, isMerchant],
  );
  useEffect(() => {
    const abort = new AbortController();
    setLoading(true);
    void load(abort.signal)
      .catch((cause: unknown) => {
        if (abort.signal.aborted) return;
        if (cause instanceof ApiError && cause.status === 401) onExpired();
        else setError(cause instanceof Error ? cause.message : 'Unable to load loyalty');
      })
      .finally(() => {
        if (!abort.signal.aborted) setLoading(false);
      });
    return () => abort.abort();
  }, [load, revision, onExpired]);
  async function run(action: () => Promise<unknown>) {
    if (pending) return;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await action();
      if (!alive.current) return;
      keys.current.clear();
      setNotice('Saved.');
      revise((n) => n + 1);
    } catch (cause) {
      if (!alive.current) return;
      if (cause instanceof ApiError && cause.status === 401) onExpired();
      else setError(cause instanceof Error ? cause.message : 'Unable to save');
    } finally {
      if (alive.current) setBusy(false);
    }
  }
  const post = (path: string, body?: unknown) => backend(base + path, 'POST', body ?? {});
  const [enabled, setEnabled] = useState(false),
    [rate, setRate] = useState('0'),
    [cap, setCap] = useState('0'),
    [campaignCap, setCampaignCap] = useState('0');
  const [milestones, setMilestones] = useState<{ name: string; hours: string; coins: string }[]>(
    [],
  );
  const policyVersion = useRef<unknown>(null);
  useEffect(() => {
    const current = policies[0];
    if (!current || current.id === policyVersion.current) return;
    policyVersion.current = current.id;
    setEnabled(current.enabled === true);
    setRate(words(current.coins_per_hour));
    setCap(words(current.engagement_cap));
    setCampaignCap(words(current.campaign_cap_per_hour));
    setMilestones(
      Array.isArray(current.milestones)
        ? (current.milestones as Row[]).map((m) => ({
            name: words(m.name),
            hours: words(Number(m.minutes) / 60),
            coins: words(m.coins),
          }))
        : [],
    );
  }, [policies]);
  const [business, setBusiness] = useState({ name: '', address: '', phone: '' });
  const [offer, setOffer] = useState({
    title: '',
    description: '',
    terms: '',
    coins: '',
    startsAt: '',
    endsAt: '',
    redemptionLimit: '',
  });
  const [previousOffer, setPreviousOffer] = useState('');
  const [campaign, setCampaign] = useState({
    title: '',
    bonusPerHour: '',
    startsAt: '',
    endsAt: '',
  });
  const [award, setAward] = useState({ member: '', coins: '', reason: '' });
  const [token, setToken] = useState('');
  const [receipt, setReceipt] = useState<Row | null>(null);
  const iso = (value: string) => new Date(value).toISOString();
  async function consume(value: string) {
    const result = (await post('/redemptions/consume', { token: value })) as Row;
    setReceipt(result);
    setToken('');
  }
  async function scan(file: File) {
    const Detector = (
      window as unknown as {
        BarcodeDetector?: new (options: { formats: string[] }) => {
          detect: (source: ImageBitmap) => Promise<{ rawValue: string }[]>;
        };
      }
    ).BarcodeDetector;
    if (!Detector)
      throw new Error(
        'Camera QR reading is unavailable in this browser. Enter the member’s one-time code.',
      );
    const image = await createImageBitmap(file);
    try {
      const found = await new Detector({ formats: ['qr_code'] }).detect(image);
      if (!found[0])
        throw new Error('No QR code found. Try a clearer photo or enter the one-time code.');
      await consume(found[0].rawValue);
    } finally {
      image.close();
    }
  }
  const decide = (kind: string, id: unknown, approve: boolean) =>
    run(() => post(`/${kind}/${words(id)}/decide`, { approve }));
  const actionButtons = (kind: string, row: Row, allowed: boolean) =>
    row.status === 'PENDING' && allowed ? (
      <div className="action-row">
        <button
          className="btn btn-primary"
          disabled={pending}
          onClick={() => void decide(kind, row.id, true)}
        >
          Approve
        </button>
        <button
          className="btn btn-secondary"
          disabled={pending}
          onClick={() => void decide(kind, row.id, false)}
        >
          Refuse
        </button>
      </div>
    ) : null;
  return (
    <div className="loyalty-workspace request-workspace">
      <div className="action-row">
        <button
          className="btn btn-secondary"
          disabled={pending}
          onClick={() => {
            setError('');
            revise((n) => n + 1);
          }}
        >
          Refresh loyalty
        </button>
      </div>
      <p className="help-text">
        Local coins are separate from time credits. Merchants fund every promotion; the platform
        makes no cash reimbursement.
      </p>
      {error && (
        <p role="alert" className="error-message">
          {error}
        </p>
      )}
      {notice && <p role="status">{notice}</p>}
      {isGlobal && (
        <section className="glass-panel">
          <h2>Central earning policy</h2>
          <p>
            Current version: {words(policies[0]?.version) || 'No policy yet'}. Earning starts only
            after a central policy and the community program are enabled.
          </p>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void run(() =>
                backend('/admin/loyalty/policies', 'POST', {
                  enabled,
                  coinsPerHour: Number(rate),
                  engagementCap: Number(cap),
                  campaignCapPerHour: Number(campaignCap),
                  milestones: milestones.map((m) => ({
                    minutes: Math.round(Number(m.hours) * 60),
                    name: m.name,
                    coins: Number(m.coins),
                  })),
                }),
              );
            }}
          >
            <label>
              <input
                type="checkbox"
                checked={enabled}
                onChange={(e) => setEnabled(e.target.checked)}
              />{' '}
              Enable earning with this policy
            </label>
            <Field
              label="Coins per verified hour"
              type="number"
              min={0}
              max={1000000}
              value={rate}
              onChange={setRate}
            />
            <Field
              label="Maximum coins per engagement award"
              type="number"
              min={0}
              max={1000000}
              value={cap}
              onChange={setCap}
            />
            <Field
              label="Maximum combined campaign bonus per hour"
              type="number"
              min={0}
              max={1000000}
              value={campaignCap}
              onChange={setCampaignCap}
            />
            <h3>Recognition milestones</h3>
            {milestones.map((m, index) => (
              <fieldset key={index}>
                <legend>Milestone {index + 1}</legend>
                {(['name', 'hours', 'coins'] as const).map((key) => (
                  <Field
                    key={key}
                    label={
                      key === 'name'
                        ? 'Achievement name'
                        : key === 'hours'
                          ? 'Verified whole hours'
                          : 'Bonus coins'
                    }
                    type={key === 'name' ? 'text' : 'number'}
                    min={key === 'hours' ? 1 : 0}
                    value={m[key]}
                    onChange={(value) =>
                      setMilestones((all) =>
                        all.map((item, i) => (i === index ? { ...item, [key]: value } : item)),
                      )
                    }
                  />
                ))}
                <button
                  className="btn btn-secondary"
                  type="button"
                  onClick={() => setMilestones((all) => all.filter((_, i) => i !== index))}
                >
                  Remove milestone
                </button>
              </fieldset>
            ))}
            <button
              className="btn btn-secondary"
              type="button"
              disabled={milestones.length >= 20}
              onClick={() => setMilestones((all) => [...all, { name: '', hours: '', coins: '0' }])}
            >
              Add milestone
            </button>
            <button className="btn btn-primary" disabled={pending}>
              Publish new policy version
            </button>
          </form>
          {policies.slice(0, 5).map((p) => (
            <p key={words(p.id)}>
              Version {words(p.version)}: {p.enabled ? 'enabled' : 'disabled'},{' '}
              {words(p.coins_per_hour)} coins/hour
            </p>
          ))}
        </section>
      )}
      {!org ? (
        <p className="glass-panel empty-state">
          Choose a community to manage its loyalty program, merchants and campaigns.
        </p>
      ) : (
        <>
          {canManage && (
            <section className="glass-panel">
              <h2>Community program</h2>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  void run(() => post('/settings', program));
                }}
              >
                <label>
                  <input
                    type="checkbox"
                    checked={program.enabled}
                    onChange={(e) => setProgram({ ...program, enabled: e.target.checked })}
                  />{' '}
                  Enable local loyalty earning and redemption
                </label>
                <br />
                <label>
                  <input
                    type="checkbox"
                    checked={program.leaderboardEnabled}
                    onChange={(e) =>
                      setProgram({ ...program, leaderboardEnabled: e.target.checked })
                    }
                  />{' '}
                  Offer an opt-in community leaderboard
                </label>
                <br />
                <button className="btn btn-primary" disabled={pending}>
                  Save community settings
                </button>
              </form>
            </section>
          )}
          {canManage && (
            <section className="glass-panel">
              <h2>Merchant applications</h2>
              {review.merchants.length === 0 && <p>No applications.</p>}
              {review.merchants.map((m) => (
                <article key={words(m.id)} className="detail-section">
                  <h3>{words(m.name)}</h3>
                  <p>
                    {words(m.address)} · {words(m.phone)}
                  </p>
                  <Status row={m} />
                  {actionButtons('merchants', m, true)}
                  {m.status === 'APPROVED' && (
                    <button
                      className="btn btn-secondary"
                      disabled={pending}
                      onClick={() => void run(() => post(`/merchants/${words(m.id)}/suspend`))}
                    >
                      Suspend business
                    </button>
                  )}
                  {m.status === 'SUSPENDED' && (
                    <button
                      className="btn btn-primary"
                      disabled={pending}
                      onClick={() => void decide('merchants', m.id, true)}
                    >
                      Restore business
                    </button>
                  )}
                </article>
              ))}
            </section>
          )}
          {canManage && (
            <section className="glass-panel">
              <h2>Offer publication</h2>
              {review.offers.length === 0 && <p>No offers to review.</p>}
              {review.offers.map((o) => (
                <article className="detail-section" key={words(o.id)}>
                  <h3>
                    {words(o.title)} · {words(o.merchant_name)}
                  </h3>
                  <p>{words(o.description)}</p>
                  <p>{words(o.terms)}</p>
                  <p>
                    {words(o.coins)} coins · {stamp(o.starts_at)} to {stamp(o.ends_at)} · limit{' '}
                    {words(o.redemption_limit)}
                  </p>
                  <Status row={o} />
                  {actionButtons('offers', o, true)}
                </article>
              ))}
            </section>
          )}
          {isMerchant && (
            <>
              {!own.merchant || own.merchant.status === 'REJECTED' ? (
                <section className="glass-panel">
                  <h2>Register your business</h2>
                  <p>An administrator must approve your business before you submit offers.</p>
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      void run(() => post('/merchant', business));
                    }}
                  >
                    {(['name', 'address', 'phone'] as const).map((key) => (
                      <Field
                        key={key}
                        label={
                          key === 'phone'
                            ? 'Public business phone, including +country code'
                            : key === 'name'
                              ? 'Business name'
                              : 'Public business address'
                        }
                        value={business[key]}
                        onChange={(value) => setBusiness({ ...business, [key]: value })}
                      />
                    ))}
                    <button className="btn btn-primary" disabled={pending}>
                      Submit for approval
                    </button>
                  </form>
                </section>
              ) : (
                <section className="glass-panel">
                  <h2>{words(own.merchant.name)}</h2>
                  <Status row={own.merchant} />
                  <p>{words(own.merchant.address)}</p>
                </section>
              )}
              {own.merchant?.status === 'APPROVED' && (
                <section className="glass-panel">
                  <h2>Redeem a member’s offer</h2>
                  <p>
                    Confirm that you are providing the promotion before completing redemption. A
                    successful receipt means the coins were spent.
                  </p>
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      void run(() => consume(token));
                    }}
                  >
                    <Field
                      label="One-time code or scanned QR text"
                      value={token}
                      onChange={setToken}
                    />
                    <button className="btn btn-primary" disabled={pending}>
                      Provide offer and redeem
                    </button>
                  </form>
                  <label className="loyalty-scan-upload">
                    Scan a QR photo
                    <input
                      type="file"
                      accept="image/*"
                      capture="environment"
                      disabled={pending}
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        e.target.value = '';
                        if (file) void run(() => scan(file));
                      }}
                    />
                  </label>
                  {receipt && (
                    <p role="status">
                      Redemption confirmed: {words(receipt.coins)} coins. Receipt{' '}
                      {words(receipt.id)}.
                    </p>
                  )}
                </section>
              )}
              {own.merchant?.status === 'APPROVED' && (
                <section className="glass-panel">
                  <h2>Propose an offer</h2>
                  <p>Changes create a new proposal. Published terms remain on record.</p>
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      const data = {
                        ...offer,
                        coins: Number(offer.coins),
                        redemptionLimit: Number(offer.redemptionLimit),
                        startsAt: iso(offer.startsAt),
                        endsAt: iso(offer.endsAt),
                        ...(previousOffer ? { previousOfferId: previousOffer } : {}),
                      };
                      void run(() =>
                        post('/offers', { ...data, clientOperationId: retryKey('offer', data) }),
                      );
                    }}
                  >
                    {(
                      [
                        'title',
                        'description',
                        'terms',
                        'coins',
                        'startsAt',
                        'endsAt',
                        'redemptionLimit',
                      ] as const
                    ).map((key) => (
                      <Field
                        key={key}
                        label={
                          key === 'redemptionLimit'
                            ? 'Total available redemptions'
                            : key === 'startsAt'
                              ? 'Starts at (your local time)'
                              : key === 'endsAt'
                                ? 'Ends at (your local time)'
                                : key === 'coins'
                                  ? 'Coin cost'
                                  : key[0]!.toUpperCase() + key.slice(1)
                        }
                        type={
                          key.endsWith('At')
                            ? 'datetime-local'
                            : ['coins', 'redemptionLimit'].includes(key)
                              ? 'number'
                              : 'text'
                        }
                        min={1}
                        max={1000000}
                        value={offer[key]}
                        onChange={(value) => setOffer({ ...offer, [key]: value })}
                      />
                    ))}
                    <label className="form-label">
                      Replace a published offer (optional)
                      <select
                        className="form-input"
                        value={previousOffer}
                        onChange={(e) => setPreviousOffer(e.target.value)}
                      >
                        <option value="">New offer</option>
                        {own.offers
                          .filter((o) => o.status === 'APPROVED')
                          .map((o) => (
                            <option key={words(o.id)} value={words(o.id)}>
                              {words(o.title)}
                            </option>
                          ))}
                      </select>
                    </label>
                    <button className="btn btn-primary" disabled={pending}>
                      Submit offer for approval
                    </button>
                  </form>
                </section>
              )}
              <section className="glass-panel">
                <h2>Your offers and receipts</h2>
                <p>
                  {words(own.volume?.redemptions ?? '—')} completed redemptions ·{' '}
                  {words(own.volume?.coins ?? '—')} coins redeemed in this community. Showing up to
                  100 recent receipts below.
                </p>
                {own.offers.map((o) => (
                  <article key={words(o.id)}>
                    <h3>{words(o.title)}</h3>
                    <p>
                      {words(o.coins)} coins · <Status row={o} />
                    </p>
                    {['PENDING', 'APPROVED'].includes(words(o.status)) && (
                      <button
                        className="btn btn-secondary"
                        disabled={pending}
                        onClick={() => void run(() => post(`/offers/${words(o.id)}/withdraw`))}
                      >
                        Withdraw offer
                      </button>
                    )}
                  </article>
                ))}
                {own.receipts.map((r) => (
                  <p key={words(r.id)}>
                    {words(r.title)} · {words(r.coins)} coins · {stamp(r.redeemed_at)} · Receipt{' '}
                    {words(r.id)}
                  </p>
                ))}
              </section>
            </>
          )}
          {canProposeAwards && (
            <section className="glass-panel">
              <h2>Engagement awards</h2>
              <p>
                Propose a centrally limited award for verified civic participation. A different
                administrator must approve it.
              </p>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  const data = { ...award, coins: Number(award.coins) };
                  void run(() =>
                    post('/engagement', { ...data, clientOperationId: retryKey('award', data) }),
                  );
                }}
              >
                <Field
                  label="Member phone or membership number"
                  value={award.member}
                  onChange={(value) => setAward({ ...award, member: value })}
                />
                <Field
                  label="Coins"
                  type="number"
                  min={1}
                  max={1000000}
                  value={award.coins}
                  onChange={(value) => setAward({ ...award, coins: value })}
                />
                <Field
                  label="Verified activity and reason"
                  value={award.reason}
                  onChange={(value) => setAward({ ...award, reason: value })}
                />
                <button className="btn btn-primary" disabled={pending}>
                  Propose award
                </button>
              </form>
              {engagement.map((a) => (
                <article key={words(a.id)}>
                  <p>
                    {words(a.member_name) || words(a.membership_number) || words(a.member_phone)} ·{' '}
                    {words(a.member_phone)}
                  </p>
                  <p>
                    {words(a.reason)} · {words(a.coins)} coins
                  </p>
                  <Status row={a} />
                  {actionButtons('engagement', a, canManage)}
                </article>
              ))}
            </section>
          )}
          {canManage && (
            <section className="glass-panel">
              <h2>Local bonus campaigns</h2>
              <p>
                Local proposals need independent Super Admin approval and stay within the central
                bonus cap.
              </p>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  const data = {
                    ...campaign,
                    bonusPerHour: Number(campaign.bonusPerHour),
                    startsAt: iso(campaign.startsAt),
                    endsAt: iso(campaign.endsAt),
                  };
                  void run(() =>
                    post('/campaigns', { ...data, clientOperationId: retryKey('campaign', data) }),
                  );
                }}
              >
                {(['title', 'bonusPerHour', 'startsAt', 'endsAt'] as const).map((key) => (
                  <Field
                    key={key}
                    label={
                      key === 'title'
                        ? 'Campaign name'
                        : key === 'bonusPerHour'
                          ? 'Extra coins per verified hour'
                          : key === 'startsAt'
                            ? 'Starts at (local time)'
                            : 'Ends at (local time)'
                    }
                    type={
                      key.endsWith('At')
                        ? 'datetime-local'
                        : key === 'bonusPerHour'
                          ? 'number'
                          : 'text'
                    }
                    min={1}
                    max={1000000}
                    value={campaign[key]}
                    onChange={(value) => setCampaign({ ...campaign, [key]: value })}
                  />
                ))}
                <button className="btn btn-primary" disabled={pending}>
                  Submit campaign for central approval
                </button>
              </form>
              {campaigns.map((c) => (
                <article key={words(c.id)}>
                  <h3>{words(c.title)}</h3>
                  <p>
                    {words(c.bonus_per_hour)} extra coins/hour · {stamp(c.starts_at)} to{' '}
                    {stamp(c.ends_at)}
                  </p>
                  <Status row={c} />
                  {actionButtons('campaigns', c, isGlobal)}
                </article>
              ))}
            </section>
          )}
        </>
      )}
    </div>
  );
}
