import { DeterministicCandidateRankingStrategy } from './deterministic-ranking.strategy';
import { CandidateMatchProfile } from './ranking-strategy.interface';

describe('DeterministicCandidateRankingStrategy', () => {
  let strategy: DeterministicCandidateRankingStrategy;

  beforeEach(() => {
    strategy = new DeterministicCandidateRankingStrategy();
  });

  const baseCandidate = (id: string): CandidateMatchProfile => ({
    membershipId: id,
    userId: `user-${id}`,
    organizationId: 'org-1',
    isSameOrganization: true,
    isSameWard: false,
    isInAssignedOperationalZone: false,
    distanceKm: 5.0,
    verifiedSkillCount: 0,
    activeAssignmentCount: 0,
    isAvailableImmediate: true,
  });

  const requestContext = {
    urgency: 'IMMEDIATE',
    locationWardNumber: '4',
    searchRadiusKm: 10.0,
  };

  it('prioritizes candidates in the same ward or assigned operational zone (+10000 pts)', () => {
    const candidateA = { ...baseCandidate('mem-a'), isSameWard: true, distanceKm: 8.0 };
    const candidateB = { ...baseCandidate('mem-b'), isSameWard: false, distanceKm: 1.0 };

    const ranked = strategy.rankCandidates([candidateB, candidateA], requestContext);

    expect(ranked[0]!.profile.membershipId).toBe('mem-a');
    expect(ranked[0]!.rank).toBe(1);
    expect(ranked[1]!.profile.membershipId).toBe('mem-b');
    expect(ranked[1]!.rank).toBe(2);
  });

  it('ranks closer spatial distance higher when other factors are equal', () => {
    const closeCandidate = { ...baseCandidate('mem-close'), distanceKm: 2.0 };
    const farCandidate = { ...baseCandidate('mem-far'), distanceKm: 8.0 };

    const ranked = strategy.rankCandidates([farCandidate, closeCandidate], requestContext);

    expect(ranked[0]!.profile.membershipId).toBe('mem-close');
    expect(ranked[1]!.profile.membershipId).toBe('mem-far');
  });

  it('rewards candidates with more verified skills (+500 pts per skill)', () => {
    const skilledCandidate = { ...baseCandidate('mem-skilled'), verifiedSkillCount: 3 };
    const unskilledCandidate = { ...baseCandidate('mem-unskilled'), verifiedSkillCount: 0 };

    const ranked = strategy.rankCandidates([unskilledCandidate, skilledCandidate], requestContext);

    expect(ranked[0]!.profile.membershipId).toBe('mem-skilled');
  });

  it('penalizes candidates with higher active assignment load for workload balancing (-200 pts)', () => {
    const busyCandidate = { ...baseCandidate('mem-busy'), activeAssignmentCount: 4 };
    const freeCandidate = { ...baseCandidate('mem-free'), activeAssignmentCount: 0 };

    const ranked = strategy.rankCandidates([busyCandidate, freeCandidate], requestContext);

    expect(ranked[0]!.profile.membershipId).toBe('mem-free');
  });

  it('breaks ties deterministically using alphabetical membershipId', () => {
    // Identical candidate profiles except membership ID
    const cand1 = baseCandidate('vol-uuid-0002');
    const cand2 = baseCandidate('vol-uuid-0001');

    const ranked = strategy.rankCandidates([cand1, cand2], requestContext);

    // vol-uuid-0001 must rank ahead of vol-uuid-0002 deterministically
    expect(ranked[0]!.profile.membershipId).toBe('vol-uuid-0001');
    expect(ranked[1]!.profile.membershipId).toBe('vol-uuid-0002');
  });
});
