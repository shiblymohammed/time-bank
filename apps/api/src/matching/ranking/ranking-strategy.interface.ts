export interface CandidateMatchProfile {
  membershipId: string;
  userId: string;
  organizationId: string;
  isSameOrganization: boolean;
  isSameWard: boolean;
  isInAssignedOperationalZone: boolean;
  distanceKm: number | null;
  verifiedSkillCount: number;
  activeAssignmentCount: number;
  isAvailableImmediate: boolean;
}

export interface RankedCandidate {
  profile: CandidateMatchProfile;
  score: number;
  rank: number;
}

export const CANDIDATE_RANKING_STRATEGY = 'CANDIDATE_RANKING_STRATEGY';

export interface CandidateRankingStrategy {
  rankCandidates(
    candidates: CandidateMatchProfile[],
    requestContext: {
      urgency: string;
      locationWardNumber: string;
      searchRadiusKm: number;
    },
  ): RankedCandidate[];
}
