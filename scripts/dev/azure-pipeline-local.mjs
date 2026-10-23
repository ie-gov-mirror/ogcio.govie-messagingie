import { execSync } from "node:child_process"
import fs from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

/**
 * Azure Pipeline Local Runner
 *
 * This script helps you run Azure Pipelines locally using:
 * 1. Azure Pipelines Agent (recommended)
 * 2. GitHub Actions (alternative)
 * 3. Manual pipeline steps
 */

class AzurePipelineLocal {
  constructor() {
    this.rootDir = join(__dirname, "..", "..")
    this.agentDir = join(this.rootDir, ".azure-agent")
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
    this.log("🔧 Azure Pipeline Local Runner", "info")
    console.log("\n📋 Available Options:")
    console.log("1. Setup Azure Pipelines Agent (recommended)")
    console.log("2. Run pipeline steps manually")
    console.log("3. Convert to GitHub Actions workflow")
    console.log("4. Show pipeline analysis")
    console.log(
      "\nChoose an option or run with --setup-agent, --manual, --github, or --analyze",
    )

    const args = process.argv.slice(2)

    if (args.includes("--setup-agent")) {
      await this.setupAgent()
    } else if (args.includes("--manual")) {
      await this.runManualSteps()
    } else if (args.includes("--github")) {
      await this.createGitHubWorkflow()
    } else if (args.includes("--analyze")) {
      await this.analyzePipeline()
    } else {
      this.printUsage()
    }
  }

  async setupAgent() {
    this.log("Setting up Azure Pipelines Agent...", "info")

    try {
      // Create agent directory
      if (!fs.existsSync(this.agentDir)) {
        fs.mkdirSync(this.agentDir, { recursive: true })
      }

      // Download agent (this is a simplified version - you'd need actual agent setup)
      this.log(
        "Note: Full agent setup requires Azure DevOps organization access",
        "warning",
      )
      this.log(
        "For complete setup, visit: https://docs.microsoft.com/en-us/azure/devops/pipelines/agents/agents?view=azure-devops",
        "info",
      )

      console.log("\n📋 Manual Agent Setup Steps:")
      console.log("1. Go to Azure DevOps > Project Settings > Agent pools")
      console.log("2. Add pool > Self-hosted > New agent")
      console.log("3. Download and configure the agent")
      console.log(
        "4. Run: ./config.sh --unattended --url <org-url> --auth pat --token <token> --pool <pool-name> --agent <agent-name> --replace",
      )
      console.log("5. Start the agent: ./run.sh")
    } catch (error) {
      this.log(`Agent setup failed: ${error.message}`, "error")
    }
  }

  async runManualSteps() {
    this.log("Running pipeline steps manually...", "info")

    const steps = [
      {
        name: "Security Scans",
        commands: [
          "pnpm lint",
          "pnpm test",
          // Add gitleaks and bearer scans if available
        ],
      },
      {
        name: "Build Dependencies",
        commands: ["pnpm install", "pnpm build"],
      },
      {
        name: "Unit Tests",
        commands: [
          "pnpm test",
          "pnpm --filter messaging-admin-next test",
          "pnpm --filter public-servant-portal test",
          "pnpm --filter messaging-api test",
        ],
      },
      {
        name: "Build Services",
        commands: [
          "pnpm build:api",
          "pnpm build:admin-next",
          "pnpm build:public-servant-portal",
        ],
      },
      {
        name: "Docker Builds",
        commands: [
          "docker build -f apps/messaging-admin-next/Dockerfile -t messaging-admin-next .",
          "docker build -f apps/public-servant-portal/Dockerfile -t public-servant-portal .",
          "docker build -f apps/messaging-api/Dockerfile -t messaging-api .",
        ],
      },
    ]

    for (const step of steps) {
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
          if (process.argv.slice(2).includes("--continue")) {
            this.log("Continuing with next step...", "warning")
          } else {
            process.exit(1)
          }
        }
      }
    }

    this.log("🎉 Manual pipeline execution completed!", "success")
  }

  async createGitHubWorkflow() {
    this.log("Creating GitHub Actions workflow...", "info")

    const workflowContent = `name: CI/CD Pipeline

on:
  push:
    branches: [ dev, uat ]
  pull_request:
    branches: [ dev, uat ]

env:
  NODE_VERSION: '22.x'

jobs:
  security-scan:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: \${{ env.NODE_VERSION }}
          cache: 'npm'
      - run: npm install -g pnpm
      - run: pnpm install
      - run: pnpm lint
      - run: pnpm test

  build-dependencies:
    runs-on: ubuntu-latest
    needs: security-scan
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: \${{ env.NODE_VERSION }}
          cache: 'npm'
      - run: npm install -g pnpm
      - run: pnpm install
      - run: pnpm build

  unit-tests-messaging-api:
    runs-on: ubuntu-latest
    needs: build-dependencies
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: \${{ env.NODE_VERSION }}
          cache: 'npm'
      - run: npm install -g pnpm
      - run: pnpm install
      - run: pnpm --filter messaging-api test

  build-messaging-api:
    runs-on: ubuntu-latest
    needs: unit-tests-messaging-api
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: \${{ env.NODE_VERSION }}
          cache: 'npm'
      - run: npm install -g pnpm
      - run: pnpm install
      - run: pnpm build:api
      - run: docker build -f apps/messaging-api/Dockerfile -t messaging-api .

  security-scan-images:
    runs-on: ubuntu-latest
    needs: build-messaging-api
    steps:
      - uses: actions/checkout@v4
      - name: Run Trivy vulnerability scanner
        uses: aquasecurity/trivy-action@master
        with:
          image-ref: 'messaging-api:latest'
          format: 'sarif'
          output: 'trivy-results.sarif'
      - name: Upload Trivy scan results to GitHub Security tab
        uses: github/codeql-action/upload-sarif@v3
        if: always()
        with:
          sarif_file: 'trivy-results.sarif'
`

    const workflowPath = join(this.rootDir, ".github", "workflows", "ci-cd.yml")

    // Create .github/workflows directory if it doesn't exist
    const workflowsDir = join(this.rootDir, ".github", "workflows")
    if (!fs.existsSync(workflowsDir)) {
      fs.mkdirSync(workflowsDir, { recursive: true })
    }

    fs.writeFileSync(workflowPath, workflowContent)
    this.log(`GitHub Actions workflow created at: ${workflowPath}`, "success")
    this.log(
      "Note: You'll need to configure secrets and environment variables",
      "warning",
    )
  }

  async analyzePipeline() {
    this.log("Analyzing Azure Pipeline...", "info")

    console.log("\n📊 Pipeline Analysis:")
    console.log("=====================")

    // Read pipeline files
    const mainPipeline = fs.readFileSync(
      join(this.rootDir, "azure_pipelines.yml"),
      "utf8",
    )
    const nightlyPipeline = fs.readFileSync(
      join(this.rootDir, "azure_pipelines_nightly.yml"),
      "utf8",
    )

    console.log("\n🔍 Main Pipeline Analysis:")
    console.log("=====================")

    // Analyze main pipeline
    const mainStages = mainPipeline.match(/stage:\s*'([^']+)'/g) || []
    const mainStageNames = mainStages.map((stage) =>
      stage.replace(/stage:\s*'([^']+)'/, "$1"),
    )

    if (mainStageNames.length > 0) {
      console.log("📋 Detected Stages:")
      mainStageNames.forEach((stage, index) => {
        console.log(`${index + 1}. ${stage}`)
      })
    } else {
      console.log("📋 Default Pipeline Stages:")
      const defaultStages = [
        "Security Scans (gitleaks, bearer)",
        "Build Dependencies",
        "Unit Tests (per service)",
        "Build Services",
        "Security Scan Images (trivy)",
        "Push to ECR",
        "Environment Approval",
        "GitOps Deploy to OpenShift",
        "Smoke Tests (disabled)",
      ]
      defaultStages.forEach((stage, index) => {
        console.log(`${index + 1}. ${stage}`)
      })
    }

    console.log("\n🌙 Nightly Pipeline:")
    const nightlyStages = nightlyPipeline.match(/stage:\s*'([^']+)'/g) || []
    const nightlyStageNames = nightlyStages.map((stage) =>
      stage.replace(/stage:\s*'([^']+)'/, "$1"),
    )

    if (nightlyStageNames.length > 0) {
      nightlyStageNames.forEach((stage, index) => {
        console.log(`${index + 1}. ${stage}`)
      })
    } else {
      console.log("- Regression Tests")
      console.log("- Performance Tests")
    }

    console.log("\n📦 Services:")
    console.log("- messaging-api")
    console.log("- messaging-admin-next")
    console.log("- public-servant-portal")

    console.log("\n🔧 Local Equivalents:")
    console.log("- Security: pnpm lint, pnpm test")
    console.log("- Build: pnpm build, pnpm build:api")
    console.log("- Docker: docker build -f apps/*/Dockerfile")
    console.log("- Tests: pnpm test, pnpm --filter * test")
  }

  printUsage() {
    console.log("\n📖 Usage:")
    console.log(
      "pnpm azure:local --setup-agent    # Setup Azure Pipelines Agent",
    )
    console.log(
      "pnpm azure:local --manual         # Run pipeline steps manually",
    )
    console.log(
      "pnpm azure:local --github         # Create GitHub Actions workflow",
    )
    console.log(
      "pnpm azure:local --analyze        # Analyze pipeline structure",
    )
    console.log("pnpm azure:local --manual --continue  # Continue on failures")
  }
}

// Run the pipeline local runner
const runner = new AzurePipelineLocal()
try {
  await runner.run()
} catch (error) {
  console.error("Azure Pipeline local runner failed:", error)
  process.exit(1)
}
