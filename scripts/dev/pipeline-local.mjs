import { execSync } from "node:child_process"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

/**
 * Local Pipeline Runner
 *
 * This script runs the equivalent of Azure Pipeline steps locally:
 * 1. Security scans (lint, test)
 * 2. Build dependencies
 * 3. Unit tests
 * 4. Build services
 * 5. Docker builds
 * 6. Security scans (optional)
 */

class LocalPipelineRunner {
  constructor() {
    this.rootDir = join(__dirname, "..", "..")
    this.continueOnError = process.argv.includes("--continue")
    this.skipTests = process.argv.includes("--skip-tests")
    this.skipDocker = process.argv.includes("--skip-docker")
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
    this.log("🚀 Starting Local Pipeline Execution", "info")

    const steps = [
      {
        name: "🔒 Security Scans",
        commands: ["pnpm lint", "pnpm test"],
        skipIf: this.skipTests,
      },
      {
        name: "📦 Build Dependencies",
        commands: ["pnpm install", "pnpm build"],
      },
      {
        name: "🧪 Unit Tests",
        commands: [
          "pnpm --filter messaging-admin-next test",
          "pnpm --filter public-servant-portal test",
          "pnpm --filter messaging-api test",
        ],
        skipIf: this.skipTests,
      },
      {
        name: "🏗️ Build Services",
        commands: [
          "pnpm build:api",
          "pnpm build:admin-next",
          "pnpm build:public-servant-portal",
        ],
      },
      {
        name: "🐳 Docker Builds",
        commands: [
          "docker build -f apps/messaging-admin-next/Dockerfile -t messaging-admin-next .",
          "docker build -f apps/public-servant-portal/Dockerfile -t public-servant-portal .",
          "docker build -f apps/messaging-api/Dockerfile -t messaging-api .",
        ],
        skipIf: this.skipDocker,
      },
    ]

    let successCount = 0
    const totalSteps = steps.filter((step) => !step.skipIf).length

    for (const step of steps) {
      if (step.skipIf) {
        this.log(`⏭️ Skipping ${step.name}`, "warning")
        continue
      }

      this.log(`Running: ${step.name}`, "info")

      for (const command of step.commands) {
        try {
          this.log(`Executing: ${command}`, "info")
          execSync(command, {
            cwd: this.rootDir,
            stdio: "inherit",
          })
          this.log(`✅ ${command} completed`, "success")
        } catch (error) {
          this.log(`❌ ${command} failed: ${error.message}`, "error")

          if (this.continueOnError) {
            this.log("Continuing with next step...", "warning")
          } else {
            this.log(
              "Pipeline failed. Use --continue to continue on errors",
              "error",
            )
            process.exit(1)
          }
        }
      }

      successCount++
    }

    this.log(
      `🎉 Pipeline completed: ${successCount}/${totalSteps} steps successful`,
      "success",
    )

    if (successCount < totalSteps) {
      this.log(
        "Some steps failed, but pipeline continued due to --continue flag",
        "warning",
      )
    }
  }
}

// Run the pipeline
const runner = new LocalPipelineRunner()
try {
  await runner.run()
} catch (error) {
  console.error("Pipeline execution failed:", error)
  process.exit(1)
}
