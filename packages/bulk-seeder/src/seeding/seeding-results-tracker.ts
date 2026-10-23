import { writeFileSync } from "node:fs";
import { join } from "node:path";
import type { SeederConfiguration } from "../configuration.js";

/**
 * Seeding result record
 */
export type SeedingResult = {
  timestamp: string;
  operation: string;
  email: string;
  profileId?: string;
  status: "success" | "error";
  message?: string;
};

/**
 * Tracks seeding results and saves to CSV file
 */
export class SeedingResultsTracker {
  private results: SeedingResult[] = [];
  private config: SeederConfiguration;

  constructor(config: SeederConfiguration) {
    this.config = config;
  }

  recordProfileCreated(email: string, profileId: string): void {
    this.results.push({
      timestamp: new Date().toISOString(),
      operation: "profile_created",
      email,
      profileId,
      status: "success",
    });
  }

  recordProfileRetrieved(email: string, profileId: string): void {
    this.results.push({
      timestamp: new Date().toISOString(),
      operation: "profile_retrieved",
      email,
      profileId,
      status: "success",
    });
  }

  recordLogtoIdentityUpdated(email: string, profileId: string): void {
    this.results.push({
      timestamp: new Date().toISOString(),
      operation: "logto_identity_updated",
      email,
      profileId,
      status: "success",
    });
  }

  recordConsentCreated(email: string, profileId: string): void {
    this.results.push({
      timestamp: new Date().toISOString(),
      operation: "consent_created",
      email,
      profileId,
      status: "success",
    });
  }

  recordPrivateDetailCreated(email: string, profileId: string): void {
    this.results.push({
      timestamp: new Date().toISOString(),
      operation: "private_detail_created",
      email,
      profileId,
      status: "success",
    });
  }

  recordOrgDetailCreated(email: string, profileId: string): void {
    this.results.push({
      timestamp: new Date().toISOString(),
      operation: "org_detail_created",
      email,
      profileId,
      status: "success",
    });
  }

  recordMessageCreated(
    email: string,
    profileId: string,
    messageId: string,
  ): void {
    this.results.push({
      timestamp: new Date().toISOString(),
      operation: "message_created",
      email,
      profileId,
      status: "success",
      message: messageId,
    });
  }

  recordAttachmentCreated(
    email: string,
    profileId: string,
    fileId: string,
  ): void {
    this.results.push({
      timestamp: new Date().toISOString(),
      operation: "attachment_created",
      email,
      profileId,
      status: "success",
      message: fileId,
    });
  }

  recordError(email: string, errorMessage: string): void {
    this.results.push({
      timestamp: new Date().toISOString(),
      operation: "error",
      email,
      status: "error",
      message: errorMessage,
    });
  }

  /**
   * Saves results to CSV file with timestamp-based filename
   */
  async saveResults(): Promise<void> {
    if (this.results.length === 0) {
      console.log("[Seeder] No results to save");
      return;
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const filename = `seeding-results-${timestamp}.csv`;
    const filepath = join(process.cwd(), filename);

    // Generate CSV content
    const headers = [
      "timestamp",
      "operation",
      "email",
      "profileId",
      "status",
      "message",
    ];
    const rows = this.results.map((result) => [
      result.timestamp,
      result.operation,
      result.email,
      result.profileId || "",
      result.status,
      result.message || "",
    ]);

    const csvContent = [
      headers.join(","),
      ...rows.map((row) => row.map((cell) => `"${cell}"`).join(",")),
    ].join("\n");

    writeFileSync(filepath, csvContent, "utf-8");
    console.log(`[Seeder] Saved ${this.results.length} results to ${filename}`);
  }
}
