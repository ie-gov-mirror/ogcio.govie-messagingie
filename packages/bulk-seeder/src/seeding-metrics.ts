/**
 * Calculates seeding metrics based on production data ratios
 */
export class SeedingMetrics {
  private readonly TNP: number; // Total Number of Profiles

  // Production-based ratios
  private readonly PRIVATE_DETAILS_RATIO = 1.76; // 116866/66373
  private readonly ORG_DETAILS_RATIO = 0.829; // 55033/66373
  private readonly CONSENTS_PER_PROFILE = 1.69;
  private readonly VALID_CONSENTS_RATIO = 0.94; // 105762/112454
  private readonly PROFILES_WITH_MESSAGES_RATIO = 0.833; // 55334/66373
  private readonly MESSAGES_PER_ACTIVE_PROFILE = 40; // 2261112/55334 ≈ 40.86
  private readonly ATTACHMENTS_PER_MESSAGE = 0.8;
  private readonly AVERAGE_ATTACHMENT_SIZE = 100000; // bytes

  constructor(totalNumberOfProfiles: number) {
    if (totalNumberOfProfiles < 0) {
      throw new Error("Total number of profiles must be non-negative");
    }
    this.TNP = totalNumberOfProfiles;
  }

  /**
   * Latest private details (1:1 ratio, each profile has current details)
   */
  getLatestPrivateDetails(): number {
    return this.TNP;
  }

  /**
   * Total private details including historical (TNP × 1.76)
   */
  getTotalPrivateDetails(): number {
    return Math.round(this.TNP * this.PRIVATE_DETAILS_RATIO);
  }

  /**
   * Profiles with organization details (TNP × 0.829)
   */
  getProfilesWithOrgDetails(): number {
    return Math.round(this.TNP * this.ORG_DETAILS_RATIO);
  }

  /**
   * Total consents (TNP × 1.69)
   */
  getTotalConsents(): number {
    return Math.round(this.TNP * this.CONSENTS_PER_PROFILE);
  }

  /**
   * Valid consents: pre-approved + opted-in + undefined (Total × 0.94)
   */
  getValidConsents(): number {
    return Math.round(this.getTotalConsents() * this.VALID_CONSENTS_RATIO);
  }

  /**
   * Profiles with messages (TNP × 0.833)
   */
  getProfilesWithMessages(): number {
    return Math.round(this.TNP * this.PROFILES_WITH_MESSAGES_RATIO);
  }

  /**
   * Total messages (PWM × 40 = TNP × 0.833 × 40 = TNP × 33.32)
   */
  getTotalMessages(): number {
    return Math.round(
      this.getProfilesWithMessages() * this.MESSAGES_PER_ACTIVE_PROFILE,
    );
  }

  /**
   * Total attachments (Total Messages × 0.8)
   */
  getTotalAttachments(): number {
    return Math.round(this.getTotalMessages() * this.ATTACHMENTS_PER_MESSAGE);
  }

  /**
   * Average attachment size in bytes
   */
  getAverageAttachmentSize(): number {
    return this.AVERAGE_ATTACHMENT_SIZE;
  }

  /**
   * Total storage needed for attachments in bytes
   */
  getTotalAttachmentStorage(): number {
    return this.getTotalAttachments() * this.AVERAGE_ATTACHMENT_SIZE;
  }

  /**
   * Get all metrics as an object
   */
  getAllMetrics() {
    return {
      totalProfiles: this.TNP,
      privateDetails: {
        latest: this.getLatestPrivateDetails(),
        total: this.getTotalPrivateDetails(),
      },
      organizationDetails: {
        profilesWithOrgDetails: this.getProfilesWithOrgDetails(),
      },
      consents: {
        total: this.getTotalConsents(),
        valid: this.getValidConsents(),
      },
      messages: {
        profilesWithMessages: this.getProfilesWithMessages(),
        totalMessages: this.getTotalMessages(),
      },
      attachments: {
        total: this.getTotalAttachments(),
        averageSize: this.getAverageAttachmentSize(),
        totalStorage: this.getTotalAttachmentStorage(),
      },
    };
  }

  /**
   * Get all metrics as percentages where applicable
   */
  getAllMetricsAsPercentages() {
    return {
      profilesWithMessages: Math.round(this.PROFILES_WITH_MESSAGES_RATIO * 100), // 83
      profilesWithOrgDetails: Math.round(this.ORG_DETAILS_RATIO * 100), // 83
      validConsentsRatio: Math.round(this.VALID_CONSENTS_RATIO * 100), // 94
      privateDetailsPerProfile: Math.round(this.PRIVATE_DETAILS_RATIO * 100), // 176
      consentsPerProfile: Math.round(this.CONSENTS_PER_PROFILE * 100), // 169
      attachmentsPerMessage: Math.round(this.ATTACHMENTS_PER_MESSAGE * 100), // 80
    };
  }
}
