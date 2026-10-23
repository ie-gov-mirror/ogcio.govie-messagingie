import { execSync } from "node:child_process"
import { existsSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

/**
 * Development Environment Setup Script
 *
 * This script sets up the complete development environment:
 * 1. Validates prerequisites
 * 2. Initializes environment files
 * 3. Installs dependencies
 * 4. Sets up database
 * 5. Validates setup
 */

// Every backend service with its own database. Each entry lists the pnpm
// scripts to run (in order) after the database has been created and migrated.
const API_SERVICES = [
  {
    name: "messaging-api",
    postMigrate: ["sync-event-summary"],
  },
  {
    name: "upload-api",
    postMigrate: [],
  },
  {
    name: "scheduler-api",
    postMigrate: [],
  },
  {
    name: "profile-api",
    // Consent statements are required reference data, not test data
    postMigrate: ["seed-consent-statements"],
  },
]

class DevSetup {
  constructor() {
    this.rootDir = join(__dirname, "..", "..")
    this.errors = []
    this.warnings = []
  }

  log(message, type = "info") {
    const timestamp = new Date().toISOString()
    const prefix = {
      info: "ℹ️",
      success: "✅",
      warning: "⚠️",
      error: "❌",
    }[type]

    console.log(`${prefix} [${timestamp}] ${message}`)
  }

  async run() {
    this.log("🚀 Starting development environment setup...", "info")

    try {
      await this.validatePrerequisites()
      await this.initializeEnvironment()
      await this.installDependencies()
      await this.setupDatabase()
      await this.validateSetup()

      this.log(
        "🎉 Development environment setup completed successfully!",
        "success",
      )
      this.printNextSteps()
    } catch (error) {
      this.log(`Setup failed: ${error.message}`, "error")
      this.printErrors()
      process.exit(1)
    }
  }

  async validatePrerequisites() {
    this.log("Checking prerequisites...", "info")

    // Check Node.js version
    const nodeVersion = process.version
    const requiredVersion = "22.0.0"
    if (!this.satisfiesVersion(nodeVersion, requiredVersion)) {
      throw new Error(
        `Node.js ${requiredVersion} or higher is required. Current: ${nodeVersion}`,
      )
    }
    this.log(`Node.js version: ${nodeVersion}`, "success")

    // Check pnpm
    try {
      const pnpmVersion = execSync("pnpm --version", {
        encoding: "utf8",
      }).trim()
      this.log(`pnpm version: ${pnpmVersion}`, "success")
    } catch {
      throw new Error("pnpm is not installed. Please install pnpm first.")
    }

    // Check Docker (optional but recommended)
    try {
      const dockerVersion = execSync("docker --version", {
        encoding: "utf8",
      }).trim()
      this.log(`Docker version: ${dockerVersion}`, "success")
    } catch {
      this.warnings.push(
        "Docker not found. Some features may not work without Docker.",
      )
    }

    // Check Git
    try {
      const gitVersion = execSync("git --version", { encoding: "utf8" }).trim()
      this.log(`Git version: ${gitVersion}`, "success")
    } catch {
      this.warnings.push(
        "Git not found. Version control features may not work.",
      )
    }
  }

  async initializeEnvironment() {
    this.log("Initializing environment files...", "info")

    try {
      // Run the existing env init script
      execSync("node scripts/init-env.mjs", {
        cwd: this.rootDir,
        stdio: "inherit",
      })
      this.log("Environment files initialized", "success")
    } catch (error) {
      throw new Error(`Failed to initialize environment: ${error.message}`)
    }
  }

  async installDependencies() {
    this.log("Installing dependencies...", "info")

    try {
      execSync("pnpm install", {
        cwd: this.rootDir,
        stdio: "inherit",
      })
      this.log("Dependencies installed successfully", "success")
    } catch (error) {
      throw new Error(`Failed to install dependencies: ${error.message}`)
    }
  }

  async setupDatabase() {
    this.log("Setting up database...", "info")

    try {
      // Check if PostgreSQL is already running on the configured port
      this.log("Checking if PostgreSQL is already running...", "info")
      const dbHost = process.env.POSTGRES_HOST || "localhost"
      const dbPort = process.env.POSTGRES_PORT || "5432"
      const dbUser = process.env.POSTGRES_USER || "postgres"

      try {
        execSync(`pg_isready -h ${dbHost} -p ${dbPort} -U ${dbUser}`, {
          stdio: "ignore",
        })
        this.log(
          `PostgreSQL is already running on ${dbHost}:${dbPort}`,
          "success",
        )
        this.log("Using existing PostgreSQL instance", "info")

        // Postgres may be running outside of `pnpm db:up` (natively, or as a
        // lone container), so the other compose services still need starting:
        // upload-api will not boot without S3 (ministack) and needs ClamAV,
        // messaging-api sends mail through MailDev.
        this.log(
          "Starting remaining Docker services (maildev, redis, clamav, ministack)...",
          "info",
        )
        try {
          execSync(
            "docker compose --env-file .env -f docker-compose.yaml up --detach maildev redis clamav ministack",
            {
              cwd: this.rootDir,
              stdio: "inherit",
            },
          )
        } catch {
          this.warnings.push(
            "Could not start auxiliary Docker services (maildev, redis, clamav, ministack). upload-api needs S3 + ClamAV and messaging-api needs MailDev — start them with: pnpm db:up",
          )
        }
      } catch {
        // PostgreSQL is not running, check if Docker containers are running
        this.log(
          "PostgreSQL not running, checking Docker containers...",
          "info",
        )
        try {
          execSync("docker compose -f docker-compose.yaml ps", {
            cwd: this.rootDir,
            stdio: "pipe",
          })
          this.log("Docker containers found, starting them...", "info")
          execSync("pnpm db:up", {
            cwd: this.rootDir,
            stdio: "inherit",
          })
        } catch (_) {
          // No Docker containers or other error, try to start fresh
          this.log("Starting fresh database services...", "info")
          try {
            execSync("pnpm db:up", {
              cwd: this.rootDir,
              stdio: "inherit",
            })
          } catch (error) {
            if (error.message.includes("port is already allocated")) {
              this.log(
                "Port conflict detected, trying to clean up...",
                "warning",
              )
              try {
                execSync("docker compose -f docker-compose.yaml down", {
                  cwd: this.rootDir,
                  stdio: "ignore",
                })
                execSync("pnpm db:up", {
                  cwd: this.rootDir,
                  stdio: "inherit",
                })
              } catch (retryError) {
                throw new Error(
                  `Failed to start database after cleanup: ${retryError.message}`,
                )
              }
            } else {
              throw error
            }
          }
        }
      }

      // Wait for database to be ready
      await this.waitForDatabase()

      // Create and migrate the database of every API service
      for (const service of API_SERVICES) {
        this.log(
          `Creating and migrating database for ${service.name}...`,
          "info",
        )

        execSync(`pnpm --filter ${service.name} db:create`, {
          cwd: this.rootDir,
          stdio: "inherit",
        })

        execSync(`pnpm --filter ${service.name} db:migrate`, {
          cwd: this.rootDir,
          stdio: "inherit",
        })

        for (const script of service.postMigrate) {
          execSync(`pnpm --filter ${service.name} ${script}`, {
            cwd: this.rootDir,
            stdio: "inherit",
          })
        }
      }

      this.log("Database setup completed", "success")
    } catch (error) {
      throw new Error(`Failed to setup database: ${error.message}`)
    }
  }

  async validateSetup() {
    this.log("Validating setup...", "info")

    // Check if all required files exist
    const requiredFiles = [
      "apps/messaging-support/package.json",
      ...API_SERVICES.map((service) => `apps/${service.name}/package.json`),
      "package.json",
      "pnpm-workspace.yaml",
    ]

    for (const file of requiredFiles) {
      if (!existsSync(join(this.rootDir, file))) {
        this.errors.push(`Required file missing: ${file}`)
      }
    }

    // Check if environment files exist
    const envFiles = [
      "apps/messaging-support/.env",
      ...API_SERVICES.map((service) => `apps/${service.name}/.env`),
    ]

    for (const file of envFiles) {
      if (!existsSync(join(this.rootDir, file))) {
        this.warnings.push(`Environment file missing: ${file}`)
      }
    }

    if (this.errors.length > 0) {
      throw new Error("Setup validation failed")
    }
  }

  async waitForDatabase() {
    this.log("Waiting for database to be ready...", "info")

    const maxAttempts = 30
    const delay = 2000 // 2 seconds

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        const dbHost = process.env.POSTGRES_HOST || "localhost"
        const dbPort = process.env.POSTGRES_PORT || "5432"
        const dbUser = process.env.POSTGRES_USER || "postgres"
        execSync(`pg_isready -h ${dbHost} -p ${dbPort} -U ${dbUser}`, {
          stdio: "ignore",
        })
        this.log("Database is ready", "success")
        return
      } catch {
        if (attempt === maxAttempts) {
          throw new Error("Database failed to start within expected time")
        }
        this.log(
          `Database not ready, attempt ${attempt}/${maxAttempts}...`,
          "warning",
        )
        await this.sleep(delay)
      }
    }
  }

  satisfiesVersion(version, required) {
    const v1 = version.replace("v", "").split(".").map(Number)
    const v2 = required.split(".").map(Number)

    for (let i = 0; i < Math.max(v1.length, v2.length); i++) {
      const num1 = v1[i] || 0
      const num2 = v2[i] || 0
      if (num1 > num2) return true
      if (num1 < num2) return false
    }
    return true
  }

  sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms))
  }

  printNextSteps() {
    console.log("\n📋 Next Steps:")
    console.log("1. Start development servers: pnpm dev")
    console.log("2. Run tests: pnpm test")
    console.log("3. Check health: pnpm scripts:health-check")
    const apiPort = process.env.API_PORT || "8002"
    const profileApiPort = process.env.PROFILE_API_PORT || "8003"
    const schedulerApiPort = process.env.SCHEDULER_API_PORT || "8005"
    const uploadApiPort = process.env.UPLOAD_API_PORT || "8008"
    const frontendPort = process.env.FRONTEND_PORT || "3002"
    const maildevPort = process.env.MAILDEV_PORT || "1080"
    console.log(`4. View messaging-api docs: http://localhost:${apiPort}/docs`)
    console.log(
      `5. Other APIs: profile-api http://localhost:${profileApiPort}, scheduler-api http://localhost:${schedulerApiPort}, upload-api http://localhost:${uploadApiPort}`,
    )
    console.log(`6. View frontend: http://localhost:${frontendPort}`)
    console.log("7. View messaging-support: http://localhost:1337")
    console.log(`8. View MailDev: http://localhost:${maildevPort}`)
  }

  printErrors() {
    if (this.errors.length > 0) {
      console.log("\n❌ Errors:")
      this.errors.forEach((error) => console.log(`  - ${error}`))
    }

    if (this.warnings.length > 0) {
      console.log("\n⚠️  Warnings:")
      this.warnings.forEach((warning) => console.log(`  - ${warning}`))
    }
  }
}

// Run the setup
const setup = new DevSetup()
try {
  await setup.run()
} catch (error) {
  console.error("Setup failed:", error)
  process.exit(1)
}
