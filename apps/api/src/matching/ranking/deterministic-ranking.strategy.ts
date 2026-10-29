import { Injectable } from '@nestjs/common';
import {
  CandidateMatchProfile,
  CandidateRankingStrategy,
  RankedCandidate,
} from './ranking-strategy.interface';

/**
 * DeterministicCandidateRankingStrategy
 *
 * Implements deterministic policy-driven ranking (D#7, D#13, D#60):
 *  1. Same Ward / Assigned Operational Zone (+10,000 pts)
 *  2. Proximity Distance (closer distance yields higher score, up to +5,000 pts)
 *  3. Verified Skill Count (+500 pts per skill)
 *  4. Workload Balancing (-200 pts per active assignment)
 *  5. Home Organization Affinity (+1,000 pts)
 *  6. Deterministic Tie-Breaker: Alphabetical sort by membershipId
 */
@Injectable()
export class DeterministicCandidateRankingStrategy implements CandidateRankingStrategy {
  rankCandidates(
    candidates: CandidateMatchProfile[],
    _requestContext: {
      urgency: string;
      locationWardNumber: string;
      searchRadiusKm: number;
    },
  ): RankedCandidate[] {
    const scored = candidates.map((candidate) => {
      let score = 0;

      // 1. Same Ward or Operational Zone
      if (candidate.isSameWard || candidate.isInAssignedOperationalZone) {
        score += 10000;
      }

      // 2. Spatial Distance
      if (candidate.distanceKm !== null && !isNaN(candidate.distanceKm)) {
        const distScore = Math.max(0, 5000 - candidate.distanceKm * 100);
        score += distScore;
      } else {
        // If distance is not calculable, grant baseline half-points
        score += 2500;
      }

      // 3. Verified Skills
      score += candidate.verifiedSkillCount * 500;

      // 4. Workload Balancing (prefer volunteers with fewer active commitments)
      score -= candidate.activeAssignmentCount * 200;

      // 5. Home Organization Affinity
      if (candidate.isSameOrganization) {
        score += 1000;
      }

      return {
        profile: candidate,
        score,
        rank: 0,
      };
    });

    // Deterministic Sort:
    // Primary: Score descending
    // Secondary: Deterministic tiebreaker on membershipId ascending
    scored.sort((a, b) => {
      if (b.score !== a.score) {
        return b.score - a.score;
      }
      return a.profile.membershipId.localeCompare(b.profile.membershipId);
    });

    return scored.map((item, index) => ({
      ...item,
      rank: index + 1,
    }));
  }
}
