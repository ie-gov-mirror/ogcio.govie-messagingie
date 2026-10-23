#!/usr/bin/env node

import { execSync } from "child_process";
import { existsSync, readFileSync, writeFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// App name mapping
const APP_NAME_MAP = {
  "messaging-api": "MessagingIE API",
  "profile-api": "Profile API",
  "scheduler-api": "Scheduler API",
  "upload-api": "Upload API",
  "citizen-portal": "MessagingIE Citizen App",
  "public-servant-portal": "MessagingIE Public Servant Portal",
  "messaging-support": "MessagingIE Support tool",
};

const APP_ORDER = [
  "messaging-api",
  "profile-api",
  "scheduler-api",
  "upload-api",
  "citizen-portal",
  "public-servant-portal",
  "messaging-support",
];

const APPS_DIR = join(__dirname, "../apps");
const ROOT_PACKAGE_JSON = join(__dirname, "../package.json");
const OUTPUT_FILE = join(__dirname, "../LICENCES.md");

// Cache for license lookups
const licenseCache = new Map();

/**
 * Normalize license format
 */
function normalizeLicense(license) {
  if (!license || license === "null" || license === "undefined") {
    return null;
  }

  if (typeof license === "string") {
    const trimmed = license.trim();
    // If it already contains " OR ", deduplicate it
    if (trimmed.includes(" OR ")) {
      const parts = trimmed
        .split(" OR ")
        .map((p) => p.trim())
        .filter((p) => p);
      const uniqueParts = [...new Set(parts)];
      return uniqueParts.length === 1
        ? uniqueParts[0]
        : uniqueParts.join(" OR ");
    }
    return trimmed;
  }

  if (Array.isArray(license)) {
    // Extract license values and deduplicate
    const licenses = license
      .map((l) => {
        if (typeof l === "string") return l.trim();
        if (typeof l === "object") return l.type || l.name || null;
        return String(l).trim();
      })
      .filter((l) => l && l !== "null" && l !== "undefined");

    // Remove duplicates
    const uniqueLicenses = [...new Set(licenses)];

    // If only one unique license, return it directly
    if (uniqueLicenses.length === 1) {
      return uniqueLicenses[0];
    }

    // If multiple unique licenses, join with " OR "
    if (uniqueLicenses.length > 1) {
      return uniqueLicenses.join(" OR ");
    }

    return null;
  }

  if (typeof license === "object") {
    return license.type || license.name || license.license || null;
  }

  return String(license).trim();
}

/**
 * Get license information for a package
 */
async function getLicense(packageName, version) {
  const cacheKey = `${packageName}@${version}`;
  if (licenseCache.has(cacheKey)) {
    return licenseCache.get(cacheKey);
  }

  // Try 1: Get license field directly with version
  try {
    const result = execSync(
      `npm view "${packageName}@${version}" license --json`,
      {
        encoding: "utf-8",
        stdio: ["pipe", "pipe", "ignore"],
        timeout: 15000,
      }
    ).trim();

    if (result && result !== "null" && result !== "undefined") {
      try {
        const data = JSON.parse(result);
        const license = normalizeLicense(data);
        if (license && license.toLowerCase() !== "unknown") {
          licenseCache.set(cacheKey, license);
          return license;
        }
      } catch (e) {
        const license = normalizeLicense(result);
        if (license && license.toLowerCase() !== "unknown") {
          licenseCache.set(cacheKey, license);
          return license;
        }
      }
    }
  } catch (error) {
    // Continue to next method
  }

  // Try 2: Get full package.json and extract license
  try {
    const result = execSync(`npm view "${packageName}@${version}" --json`, {
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "ignore"],
      timeout: 15000,
    });

    const pkg = JSON.parse(result);
    if (pkg.license) {
      const license = normalizeLicense(pkg.license);
      if (license && license.toLowerCase() !== "unknown") {
        licenseCache.set(cacheKey, license);
        return license;
      }
    }
    if (pkg.licenses) {
      const license = normalizeLicense(pkg.licenses);
      if (license && license.toLowerCase() !== "unknown") {
        licenseCache.set(cacheKey, license);
        return license;
      }
    }
  } catch (error) {
    // Continue to next method
  }

  // Try 3: Try without version
  try {
    const result = execSync(`npm view "${packageName}" license --json`, {
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "ignore"],
      timeout: 15000,
    }).trim();

    if (result && result !== "null" && result !== "undefined") {
      try {
        const data = JSON.parse(result);
        const license = normalizeLicense(data);
        if (license && license.toLowerCase() !== "unknown") {
          licenseCache.set(cacheKey, license);
          return license;
        }
      } catch (e) {
        const license = normalizeLicense(result);
        if (license && license.toLowerCase() !== "unknown") {
          licenseCache.set(cacheKey, license);
          return license;
        }
      }
    }
  } catch (error) {
    // Continue to next method
  }

  // Try 4: Get full package.json without version
  try {
    const result = execSync(`npm view "${packageName}" --json`, {
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "ignore"],
      timeout: 15000,
    });

    const pkg = JSON.parse(result);
    if (pkg.license) {
      const license = normalizeLicense(pkg.license);
      if (license && license.toLowerCase() !== "unknown") {
        licenseCache.set(cacheKey, license);
        return license;
      }
    }
    if (pkg.licenses) {
      const license = normalizeLicense(pkg.licenses);
      if (license && license.toLowerCase() !== "unknown") {
        licenseCache.set(cacheKey, license);
        return license;
      }
    }
  } catch (error) {
    // All methods failed
  }

  // If all methods failed, return Unknown
  licenseCache.set(cacheKey, "Unknown");
  return "Unknown";
}

/**
 * Resolve "*" version from root package.json
 */
function resolveVersion(packageName, rootDependencies, rootDevDependencies) {
  // Check dependencies first
  if (rootDependencies[packageName]) {
    return rootDependencies[packageName];
  }
  // Check devDependencies
  if (rootDevDependencies[packageName]) {
    return rootDevDependencies[packageName];
  }
  return "*";
}

/**
 * Get dependencies for an app
 */
function getAppDependencies(appName) {
  const appDir = join(APPS_DIR, appName);
  const appPackageJson = join(appDir, "package.json");

  // Read root package.json
  const rootPackageJson = JSON.parse(readFileSync(ROOT_PACKAGE_JSON, "utf-8"));
  const rootDependencies = rootPackageJson.dependencies || {};
  const rootDevDependencies = rootPackageJson.devDependencies || {};

  let dependencies = {};

  if (existsSync(appPackageJson)) {
    // App has its own package.json
    const appPackage = JSON.parse(readFileSync(appPackageJson, "utf-8"));
    const appDeps = {
      ...(appPackage.dependencies || {}),
      ...(appPackage.devDependencies || {}),
    };

    // Resolve "*" versions from root
    for (const [depName, depVersion] of Object.entries(appDeps)) {
      if (depVersion === "*") {
        const resolvedVersion = resolveVersion(
          depName,
          rootDependencies,
          rootDevDependencies
        );
        dependencies[depName] = resolvedVersion;
      } else {
        dependencies[depName] = depVersion;
      }
    }
  } else {
    // App uses root dependencies
    dependencies = { ...rootDependencies, ...rootDevDependencies };
  }

  return dependencies;
}

/**
 * Collect licenses for all apps
 */
async function collectLicenses() {
  const apps = APP_ORDER.filter((app) => {
    const appDir = join(APPS_DIR, app);
    return existsSync(appDir);
  });

  const results = {};

  for (const appName of apps) {
    console.log(`Processing ${appName}...`);
    const dependencies = getAppDependencies(appName);
    const licenseMap = {};

    // Collect unique dependencies
    const uniqueDeps = [...new Set(Object.keys(dependencies))].sort();

    // Fetch licenses
    for (const depName of uniqueDeps) {
      const version = dependencies[depName];
      console.log(`  Fetching license for ${depName}@${version}...`);
      const license = await getLicense(depName, version);
      licenseMap[depName] = { version, license };

      // Small delay to avoid rate limiting
      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    results[appName] = licenseMap;
  }

  return results;
}

/**
 * Format results as markdown
 */
function formatMarkdown(results) {
  const today = new Date();
  const dateStr = today.toISOString().split("T")[0]; // YYYY-MM-DD format

  let markdown = "<!--\n";
  markdown += "This is an auto-generated file, DO NOT modify it manually.\n\n";
  markdown += `Generated on: ${dateStr}\n\n`;
  markdown += "In order to update it run: src/scripts/collect-licenses.js\n";
  markdown += "-->\n\n";
  markdown += "# Licenses\n\n";
  markdown +=
    "This file contains license information for all dependencies used by each application.\n\n";

  for (const appName of APP_ORDER) {
    if (!results[appName]) continue;

    const appDisplayName = APP_NAME_MAP[appName] || appName;
    markdown += `## ${appDisplayName}\n\n`;

    const deps = results[appName];
    const sortedDeps = Object.keys(deps).sort();

    if (sortedDeps.length === 0) {
      markdown += "_No dependencies_\n\n";
      continue;
    }

    markdown += "| Package | Version | License |\n";
    markdown += "|---------|---------|----------|\n";

    for (const depName of sortedDeps) {
      const { version, license } = deps[depName];
      // Escape pipe characters in license
      const escapedLicense = license.replace(/\|/g, "\\|");
      markdown += `| ${depName} | ${version} | ${escapedLicense} |\n`;
    }

    markdown += "\n";
  }

  return markdown;
}

/**
 * Main function
 */
async function main() {
  try {
    console.log("Collecting license information...\n");
    const results = await collectLicenses();
    console.log("\nFormatting markdown...");
    const markdown = formatMarkdown(results);
    console.log("Writing to LICENCES.md...");
    writeFileSync(OUTPUT_FILE, markdown, "utf-8");
    console.log("Done!");
  } catch (error) {
    console.error("Error:", error);
    process.exit(1);
  }
}

main();
