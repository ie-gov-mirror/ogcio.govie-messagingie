import { SeedingMetrics } from "./seeding-metrics.js";

/**
 * Represents the data to be seeded for a single profile
 */
export interface SeedingMetadata {
  privateDetailsCount: number; // How many private detail records (including historical)
  hasOrgDetails: boolean;
  consentsCount: number;
  validConsentsCount: number;
  messagesCount: number;
  attachmentsCount: number;
}

/**
 * Distributes items across profiles probabilistically to match target totals
 */
export class GenerateSeedingMetadata {
  private readonly metrics: SeedingMetrics;
  private readonly totalProfiles: number;

  // Tracking counters to ensure we hit target totals
  private privateDetailsRemaining: number;
  private orgDetailsRemaining: number;
  private consentsRemaining: number;
  private validConsentsRemaining: number;
  private messagesRemaining: number;
  private attachmentsRemaining: number;

  constructor(totalProfiles: number) {
    this.totalProfiles = totalProfiles;
    this.metrics = new SeedingMetrics(totalProfiles);

    // Initialize remaining counters
    // Subtract the guaranteed 1:1 private details
    this.privateDetailsRemaining =
      this.metrics.getTotalPrivateDetails() -
      this.metrics.getLatestPrivateDetails();
    this.orgDetailsRemaining = this.metrics.getProfilesWithOrgDetails();
    this.consentsRemaining = this.metrics.getTotalConsents();
    this.validConsentsRemaining = this.metrics.getValidConsents();
    this.messagesRemaining = this.metrics.getTotalMessages();
    this.attachmentsRemaining = this.metrics.getTotalAttachments();
  }

  /**
   * Generates seed data for all profiles
   */
  generateMetadata(): SeedingMetadata[] {
    const seedData: SeedingMetadata[] = [];

    for (let i = 0; i < this.totalProfiles; i++) {
      const profileData = this.generateProfileData(i);
      seedData.push(profileData);
    }

    return seedData;
  }

  /**
   * Generates seed data for a single profile
   */
  private generateProfileData(index: number): SeedingMetadata {
    const profilesLeft = this.totalProfiles - index;

    // Private Details: Each profile gets 1 current + potentially historical ones
    // Distribute remaining historical details across remaining profiles
    const historicalDetailsForThisProfile = this.distributeItems(
      this.privateDetailsRemaining,
      profilesLeft,
    );
    const privateDetailsCount = 1 + historicalDetailsForThisProfile; // 1 current + historical
    this.privateDetailsRemaining -= historicalDetailsForThisProfile;

    // Organization Details: Distribute to ~83% of profiles
    const hasOrgDetails =
      this.distributeItems(this.orgDetailsRemaining, profilesLeft) > 0;
    if (hasOrgDetails) {
      this.orgDetailsRemaining--;
    }

    // Consents: Distribute across all profiles
    const consentsCount = this.distributeItems(
      this.consentsRemaining,
      profilesLeft,
    );
    this.consentsRemaining -= consentsCount;

    // Valid Consents: Should be ~94% of this profile's consents
    const validConsentsCount = Math.min(
      Math.round(consentsCount * 0.94),
      this.validConsentsRemaining,
    );
    this.validConsentsRemaining -= validConsentsCount;

    // Messages: Distribute to ~83% of profiles
    const messagesCount = this.distributeItems(
      this.messagesRemaining,
      profilesLeft,
    );
    this.messagesRemaining -= messagesCount;

    // Attachments: ~80% of messages get attachments
    const attachmentsCount = Math.min(
      this.distributeItems(this.attachmentsRemaining, profilesLeft),
      messagesCount, // Can't have more attachments than messages for this profile
    );
    this.attachmentsRemaining -= attachmentsCount;

    return {
      privateDetailsCount,
      hasOrgDetails,
      consentsCount,
      validConsentsCount,
      messagesCount,
      attachmentsCount,
    };
  }

  /**
   * Distributes items across remaining profiles
   * Returns how many items this profile should get
   */
  private distributeItems(
    itemsRemaining: number,
    profilesLeft: number,
  ): number {
    if (itemsRemaining <= 0 || profilesLeft <= 0) {
      return 0;
    }

    const avgPerProfile = itemsRemaining / profilesLeft;

    // If we're near the end, give all remaining items to last profiles
    if (profilesLeft === 1) {
      return itemsRemaining;
    }

    // Use Poisson-like distribution: round average + random variation
    const baseAmount = Math.floor(avgPerProfile);
    const remainder = avgPerProfile - baseAmount;

    // Probabilistically add one more based on the fractional part
    const extraItem = Math.random() < remainder ? 1 : 0;

    return Math.min(baseAmount + extraItem, itemsRemaining);
  }

  /**
   * Prints summary statistics
   */
  getSummary(): string {
    const metrics = this.metrics.getAllMetrics();
    const percentages = this.metrics.getAllMetricsAsPercentages();

    return `
Seeding Summary for ${this.totalProfiles} profiles:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Private Details:
  - Latest (1:1): ${metrics.privateDetails.latest}
  - Total (including historical): ${metrics.privateDetails.total} (${percentages.privateDetailsPerProfile}%)

Organization Details:
  - Profiles with org details: ${metrics.organizationDetails.profilesWithOrgDetails} (${percentages.profilesWithOrgDetails}%)

Consents:
  - Total consents: ${metrics.consents.total} (${percentages.consentsPerProfile}%)
  - Valid consents: ${metrics.consents.valid} (${percentages.validConsentsRatio}%)

Messages:
  - Profiles with messages: ${metrics.messages.profilesWithMessages} (${percentages.profilesWithMessages}%)
  - Total messages: ${metrics.messages.totalMessages}

Attachments:
  - Total attachments: ${metrics.attachments.total} (${percentages.attachmentsPerMessage}%)
  - Average size: ${(metrics.attachments.averageSize / 1024).toFixed(2)} KB
  - Total storage: ${(metrics.attachments.totalStorage / 1024 / 1024).toFixed(2)} MB
`;
  }
}
