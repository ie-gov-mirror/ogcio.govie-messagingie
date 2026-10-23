/**
 * Base error class for seeding operations
 */
export class SeedingError extends Error {
  constructor(
    message: string,
    public readonly context?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "SeedingError";
  }
}

/**
 * Error thrown when profile import fails
 */
export class ProfileImportError extends SeedingError {
  constructor(
    message: string,
    public readonly profileImportId: string,
    context?: Record<string, unknown>,
  ) {
    super(message, { ...context, profileImportId });
    this.name = "ProfileImportError";
  }
}

/**
 * Error thrown when SDK operations fail
 */
export class SDKError extends SeedingError {
  constructor(
    message: string,
    public readonly service: string,
    context?: Record<string, unknown>,
  ) {
    super(message, { ...context, service });
    this.name = "SDKError";
  }
}
