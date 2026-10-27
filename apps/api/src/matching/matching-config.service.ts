import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { UrgencyType } from '@ktb/shared-types';

export interface MatchingTierConfig {
  tier: number;
  radiusKm: number;
  expansionTimeoutMinutesImmediate: number;
  expansionHoursBeforeScheduled: number;
}

/**
 * MatchingConfigService
 * Centralizes configurable matching search radii, multi-round timeouts, and offer lifespans (D#7, D#13, D#60).
 */
@Injectable()
export class MatchingConfigService {
  private readonly defaultTiers: MatchingTierConfig[] = [
    {
      tier: 1,
      radiusKm: 3.0,
      expansionTimeoutMinutesImmediate: 15,
      expansionHoursBeforeScheduled: 24,
    },
    {
      tier: 2,
      radiusKm: 7.0,
      expansionTimeoutMinutesImmediate: 30,
      expansionHoursBeforeScheduled: 4,
    },
    {
      tier: 3,
      radiusKm: 15.0,
      expansionTimeoutMinutesImmediate: 45,
      expansionHoursBeforeScheduled: 2,
    },
  ];

  constructor(private readonly config: ConfigService) {}

  getTierConfig(tier: number): MatchingTierConfig {
    const found = this.defaultTiers.find((t) => t.tier === tier);
    if (!found) {
      return this.defaultTiers[this.defaultTiers.length - 1]!;
    }
    return found;
  }

  getRadiusForTier(tier: number): number {
    return this.getTierConfig(tier).radiusKm;
  }

  getOfferExpiresAt(urgency: UrgencyType, scheduledStartTime?: Date): Date {
    const now = Date.now();
    if (urgency === UrgencyType.IMMEDIATE) {
      // 15 minutes offer window for immediate tasks
      return new Date(now + 15 * 60 * 1000);
    }

    // Scheduled: 4 hours ahead, or capped at 1 hour before scheduled start
    const fourHours = now + 4 * 60 * 60 * 1000;
    if (scheduledStartTime) {
      const scheduledTime = new Date(scheduledStartTime).getTime();
      const oneHourBeforeStart = scheduledTime - 60 * 60 * 1000;
      return new Date(Math.min(fourHours, Math.max(now + 15 * 60 * 1000, oneHourBeforeStart)));
    }
    return new Date(fourHours);
  }

  getRoundExpiresAt(urgency: UrgencyType, tier: number, scheduledStartTime?: Date): Date {
    const now = Date.now();
    const tierConfig = this.getTierConfig(tier);

    if (urgency === UrgencyType.IMMEDIATE) {
      return new Date(now + tierConfig.expansionTimeoutMinutesImmediate * 60 * 1000);
    }

    if (scheduledStartTime) {
      const scheduledTime = new Date(scheduledStartTime).getTime();
      const cutoffTime = scheduledTime - tierConfig.expansionHoursBeforeScheduled * 60 * 60 * 1000;
      if (cutoffTime > now) {
        return new Date(cutoffTime);
      }
    }

    // Fallback: 2 hours from now
    return new Date(now + 2 * 60 * 60 * 1000);
  }

  getMaxOffersPerSlot(): number {
    return this.config.get<number>('MATCHING_MAX_OFFERS_PER_SLOT', 5);
  }
}
