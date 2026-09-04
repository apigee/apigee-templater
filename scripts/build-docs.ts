#!/usr/bin/env bun
/**
 * Copyright 2022-2026 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import fs from "node:fs";
import path from "node:path";
import packageJson from "../package.json";

const version = packageJson.version;
const docsDir = path.resolve(import.meta.dir, "../docs");
const outputFile = path.join(docsDir, "index.html");

if (!fs.existsSync(docsDir)) {
  fs.mkdirSync(docsDir, { recursive: true });
}

// Commands data source for documentation and search indexing
const commands = [
  {
    id: "cmd-convert",
    name: "convert",
    category: "core",
    isDefault: true,
    badge: "Default Command",
    badgeColor: "blue",
    syntax: "aft [convert] [options] [<input>] [<output>]",
    description:
      "The primary engine of AFT. Converts between Apigee proxy ZIP bundles, concise YAML proxies, and JSON formats. Applies and removes modular features, instantiates templates with parameter substitutions, converts between features and SharedFlow ZIP bundles, or creates new proxies and templates from scratch.",
    flags: [
      { flag: "-i, --input <path|name>", desc: "Input ZIP bundle, YAML/JSON file, or remote Apigee resource name." },
      { flag: "-o, --output <path>", desc: "Target output file or directory path (e.g. proxy.yaml, bundle.zip, ./proxies/)." },
      { flag: "-f, --format <format>", desc: "Target conversion format: 'proxy', 'template', 'feature', 'product', 'user', or 'sharedflow' ('sf')." },
      { flag: "-a, --applyFeature <name>", desc: "Apply a feature (or comma-separated list of features) to a template or proxy." },
      { flag: "-r, --removeFeature <name>", desc: "Remove a feature (or comma-separated list) from a template or proxy." },
      { flag: "-p, --parameters <list>", desc: "Parameter substitutions for template instantiation (e.g. param1=val1,param2=val2)." },
      { flag: "-b, --basePath <path>", desc: "Base path when scaffolding a new proxy or template (e.g. /v1/weather)." },
      { flag: "-u, --targetUrl <url>", desc: "Backend target URL when scaffolding a new proxy or template." },
      { flag: "-n, --name <name>", desc: "Resource name for output template, feature, or proxy." },
      { flag: "--organization, --org, --project <name>", desc: "Target Apigee organization or GCP project for deployment or export." },
      { flag: "--environment <name>", desc: "Apigee environment name to deploy the proxy revision to (e.g. dev, prod)." },
      { flag: "--service-account <email>", desc: "Google Cloud service account email attached to proxy deployment." },
      { flag: "--delete", desc: "Delete Apigee resources defined in input template, product, user, or proxy." },
      { flag: "-d, --drz <region>", desc: "Specify DRZ endpoint region ('us', 'eu', 'in') for data-residency compliance." },
    ],
    examples: [
      {
        title: "Convert Apigee ZIP Bundle to concise YAML",
        description: "Decompresses an Apigee proxy ZIP bundle and generates a clean, single-file YAML specification with all policies, flows, and resources.",
        command: "aft -i ./bundles/WeatherAPI.zip -o WeatherAPI.yaml",
      },
      {
        title: "Compile YAML Proxy to deployable ZIP Bundle",
        description: "Compiles a YAML proxy into an official Apigee-compliant ZIP bundle ready for import via apigeecli or Cloud Console.",
        command: "aft -i WeatherAPI.yaml -o WeatherAPI.zip",
      },
      {
        title: "Create a new Proxy from scratch with BasePath and Target",
        description: "Scaffolds a complete Apigee proxy YAML configured with an endpoint base path and backend target URL.",
        command: "aft -n Customers-v1 -b /v1/customers -u https://api.example.com/customers -o Customers-v1.yaml",
      },
      {
        title: "Apply Security & CORS Features to a Proxy",
        description: "Injects authentication and CORS policies into an existing proxy using pre-built repository features.",
        command: "aft WeatherAPI.yaml -a auth-apikey-verify,cors -o WeatherAPI-Secured.yaml",
      },
      {
        title: "Instantiate a Template with Parameter Substitutions",
        description: "Takes a template referencing features and renders a concrete proxy by filling in parameter placeholders.",
        command: "aft -i Template-AI-Gateway.yaml -p Model=gemini-2.5-flash,Project=my-gcp-proj -o Proxy-AI.yaml",
      },
      {
        title: "Convert Feature to SharedFlow ZIP Bundle",
        description: "Converts a feature YAML file into an Apigee SharedFlow ZIP bundle for deployment as a reusable flow.",
        command: "aft -i auth-apikey-verify.yaml -f sf -o SF-ApiKeyVerify.zip",
      },
      {
        title: "Deploy Proxy directly to Apigee Environment",
        description: "Deploys a local YAML proxy directly to an Apigee X environment, attaching a service account if needed.",
        command: "aft -i WeatherAPI.yaml --org my-org --environment dev --service-account apigee-sa@my-proj.iam.gserviceaccount.com",
      },
    ],
  },
  {
    id: "cmd-describe",
    name: "describe",
    category: "inspect",
    isDefault: false,
    badge: "Inspection",
    badgeColor: "purple",
    syntax: "aft describe <input>   |   aft <input>",
    description:
      "Inspects and summarizes any local file or remote repository resource (template, proxy, feature, product, or user). Renders a high-contrast terminal card detailing the name, description, endpoints, target URLs, flows, policies, and parameters without modifying or creating files. If given a non-existent filename as a single argument, AFT safely creates an empty template proxy instead.",
    flags: [
      { flag: "<input>", desc: "Path to a local YAML/JSON file, or the identifier of a feature/template in the repository." },
      { flag: "-i, --input <path|name>", desc: "Explicit flag alternative for the input resource." },
      { flag: "--organization, --org, --project <name>", desc: "Inspect a deployed Apigee remote proxy or resource." },
      { flag: "-f, --format <format>", desc: "Optional format hint ('proxy', 'template', 'feature', 'product', 'user', 'sf')." },
      { flag: "-t, --token <token>", desc: "Google Cloud OAuth2 token (defaults to Application Default Credentials)." },
    ],
    examples: [
      {
        title: "Describe a local Proxy YAML",
        description: "Outputs an overview card showing endpoints, targets, pre/post flows, and policies for a local proxy file.",
        command: "aft describe SimpleProxy-v1.yaml",
      },
      {
        title: "Quick inspection shorthand (Single argument)",
        description: "Passing any existing file or repository resource directly as a single argument automatically triggers describe without writing files.",
        command: "aft ai-target-googlecloud",
      },
      {
        title: "Describe a Repository Feature",
        description: "Fetches and displays metadata, parameters, target endpoints, policies, and flow steps for a catalog feature.",
        command: "aft describe auth-apikey-verify",
      },
      {
        title: "Describe an Apigee Product YAML",
        description: "Displays approval type, environments, proxies, and quota limits defined in an API Product YAML.",
        command: "aft describe standard-api-product.yaml",
      },
      {
        title: "Describe a Developer User YAML",
        description: "Displays developer details, registered apps, and associated credential configurations.",
        command: "aft describe developer-john.yaml",
      },
    ],
  },
  {
    id: "cmd-list",
    name: "list",
    category: "catalog",
    isDefault: false,
    badge: "Catalog",
    badgeColor: "green",
    syntax: "aft list [options]   |   aft -l   |   aft --list",
    description:
      "Browses all pre-built templates and features available in the central GitHub repository (https://github.com/gcp-samples/apigee-template-repository). Supports structured output in JSON or YAML formats for integration with CI/CD pipelines and developer tooling. Results are cached locally for 24 hours.",
    flags: [
      { flag: "-l, --list, --listFeatures", desc: "Flag alternative to the 'list' command." },
      { flag: "-f, --format <json|yaml>", desc: "Output format: 'json' or 'yaml' for machine-readable catalog representations." },
      { flag: "--listTemplates", desc: "List templates catalog." },
    ],
    examples: [
      {
        title: "List all Repository Templates and Features in Terminal",
        description: "Displays an interactive colored list of all available templates and features in the catalog.",
        command: "aft list",
      },
      {
        title: "Export Catalog as JSON",
        description: "Returns the full catalog of features and templates in structured JSON format for scripting.",
        command: "aft list -f json",
      },
      {
        title: "Export Catalog as YAML",
        description: "Outputs the complete catalog of features and templates formatted as YAML.",
        command: "aft list -f yaml",
      },
    ],
  },
  {
    id: "cmd-config",
    name: "config",
    category: "cloud",
    isDefault: false,
    badge: "Apigee Cloud",
    badgeColor: "amber",
    syntax: "aft -c <organization>   |   aft --config <organization>",
    description:
      "Queries and inspects runtime and organizational configuration for an Apigee X organization. Displays the associated GCP Project, analytics region, billing type, evaluation trial expiration countdown, environments, environment groups, and hostnames.",
    flags: [
      { flag: "-c, --config <organization>", desc: "Apigee organization name to inspect." },
      { flag: "-f, --format <json|yaml>", desc: "Output raw configuration payload in JSON or YAML format." },
      { flag: "-t, --token <token>", desc: "Google Cloud token (uses Application Default Credentials if omitted)." },
      { flag: "-d, --drz <region>", desc: "Specify DRZ endpoint ('us', 'eu', 'in')." },
    ],
    examples: [
      {
        title: "Inspect Apigee X Organization Configuration",
        description: "Prints a formatted summary card showing project ID, region, trial days remaining, environments, and hostnames.",
        command: "aft --config my-apigee-org",
      },
      {
        title: "Export Org Configuration to JSON",
        description: "Fetches full organization details and prints the raw JSON response.",
        command: "aft -c my-apigee-org -f json",
      },
      {
        title: "Inspect Org in a DRZ (Data Residency) Region",
        description: "Directs API calls to a regional Apigee control plane (e.g. EU or US).",
        command: "aft -c my-apigee-org --drz eu",
      },
    ],
  },
  {
    id: "cmd-completion",
    name: "completion",
    category: "tooling",
    isDefault: false,
    badge: "Tooling",
    badgeColor: "cyan",
    syntax: "aft completion <install | uninstall | zsh | bash | fish | powershell>",
    description:
      "Installs or displays dynamic shell tab-completion scripts. Provides context-aware auto-completion for commands, flags, formats, and repository feature names across Zsh, Bash, Fish, and Windows PowerShell.",
    flags: [
      { flag: "install", desc: "Auto-detects active shell and appends completion loader to ~/.zshrc, ~/.bashrc, config.fish, or PowerShell $PROFILE." },
      { flag: "uninstall", desc: "Removes AFT completion configuration from your shell profile." },
      { flag: "zsh", desc: "Prints raw Zsh completion script to stdout for manual sourcing." },
      { flag: "bash", desc: "Prints raw Bash completion script to stdout for manual sourcing." },
      { flag: "fish", desc: "Prints raw Fish completion script to stdout for manual sourcing." },
      { flag: "powershell", desc: "Prints raw PowerShell completion script to stdout (alias: pwsh)." },
    ],
    examples: [
      {
        title: "Auto-install shell completion for active shell",
        description: "Detects your shell and configures tab-completion automatically.",
        command: "aft completion install",
      },
      {
        title: "Manually source Zsh completion in current session",
        description: "Quickly activates tab-completion in the current terminal window without editing ~/.zshrc.",
        command: "source <(aft completion zsh)",
      },
      {
        title: "Generate completion script for Fish shell",
        description: "Saves completion rules into Fish configuration directory.",
        command: "aft completion fish > ~/.config/fish/completions/aft.fish",
      },
      {
        title: "Uninstall shell completions",
        description: "Removes all AFT completion hooks from your shell configuration files.",
        command: "aft completion uninstall",
      },
    ],
  },
  {
    id: "cmd-skill",
    name: "skill",
    category: "tooling",
    isDefault: false,
    badge: "Tooling",
    badgeColor: "cyan",
    syntax: "aft skill <install | uninstall>",
    description:
      "Manages the native Apigee Templater skill for AI coding assistants. Installs the SKILL.md specification and guides into ~/.agents/skills/apigee-templater, enabling tools like Google Antigravity, Gemini CLI, Claude Code, Cursor, and Codex to author and debug AFT proxies automatically.",
    flags: [
      { flag: "install", desc: "Installs the apigee-templater skill to ~/.agents/skills/apigee-templater." },
      { flag: "uninstall", desc: "Removes the apigee-templater skill from ~/.agents/skills/apigee-templater." },
    ],
    examples: [
      {
        title: "Install AI Agent Skill",
        description: "Equips local AI coding assistants with Apigee proxy rules, policy patterns, and templater CLI capabilities.",
        command: "aft skill install",
      },
      {
        title: "Uninstall AI Agent Skill",
        description: "Removes the skill definition from the local assistant skills directory.",
        command: "aft skill uninstall",
      },
    ],
  },
  {
    id: "cmd-cache",
    name: "cache",
    category: "tooling",
    isDefault: false,
    badge: "Tooling",
    badgeColor: "cyan",
    syntax: "aft cache <clear>",
    description:
      "Manages the local cache of templates, features, and schemas downloaded from the repository. The cache is stored in ~/.aft/cache/ and automatically expires after 24 hours. Use this command to force an immediate refresh of the catalog.",
    flags: [
      { flag: "clear", desc: "Clears cached features, templates, and products from ~/.aft/cache/." },
    ],
    examples: [
      {
        title: "Clear local repository cache",
        description: "Deletes cached repository files so the next AFT command fetches fresh definitions directly from GitHub.",
        command: "aft cache clear",
      },
    ],
  },
];

// Apigee Cloud Operations section data
const cloudOperations = [
  {
    id: "cloud-export",
    title: "Remote Export from Apigee X",
    description:
      "Export deployed proxies, SharedFlows, API products, and developer user credentials from an Apigee X organization directly into clean, version-controllable YAML or JSON files.",
    examples: [
      {
        title: "Export single Proxy to YAML",
        command: "aft SimpleProxy-v1 --org my-org -o SimpleProxy-v1.yaml",
        explanation: "Authenticates via gcloud default credentials, downloads the latest proxy revision, and writes a concise YAML file.",
      },
      {
        title: "Export ALL Proxies in an Organization to a Folder",
        command: "aft --org my-org -o ./proxies/",
        explanation: "Iterates through all proxies deployed in the organization and writes each one to an individual YAML file.",
      },
      {
        title: "Export single API Product to YAML",
        command: "aft standard-product --org my-org -f product -o standard-product.yaml",
        explanation: "Exports product quotas, scopes, approval rules, and proxy associations.",
      },
      {
        title: "Export ALL API Products in an Organization",
        command: "aft --org my-org -f product -o ./products/",
        explanation: "Backs up every API product in the organization into separate YAML files inside ./products/.",
      },
      {
        title: "Export Developer User, Apps & Credentials",
        command: "aft dev@example.com --org my-org -f user -o dev-user.yaml",
        explanation: "Exports developer profile, registered apps, API keys, and client secrets.",
      },
      {
        title: "Export ALL Developers and Apps in an Organization",
        command: "aft --org my-org -f user -o ./users/",
        explanation: "Exports complete developer registry and credentials to individual YAML files.",
      },
      {
        title: "Export SharedFlow to YAML",
        command: "aft my-shared-flow --org my-org -f sf -o sf-flow.yaml",
        explanation: "Exports an Apigee SharedFlow revision and converts it into a feature YAML format.",
      },
    ],
  },
  {
    id: "cloud-deploy",
    title: "Remote Deployment to Apigee X",
    description:
      "Deploy local proxies, API products, developer users, and complete multi-resource templates directly to your Apigee X / hybrid environments.",
    examples: [
      {
        title: "Deploy Proxy to Environment",
        command: "aft -i WeatherAPI.yaml --org my-org --environment dev",
        explanation: "Packages the YAML proxy into a bundle, imports it into Apigee X, and deploys a new revision to the 'dev' environment.",
      },
      {
        title: "Deploy Proxy with Google Service Account",
        command: "aft -i WeatherAPI.yaml --org my-org --environment prod --service-account apigee-runtime@my-proj.iam.gserviceaccount.com",
        explanation: "Attaches a Google Cloud Service Account to the deployed proxy revision for secure backend identity.",
      },
      {
        title: "Deploy API Product",
        command: "aft -i standard-product.yaml --org my-org -f product",
        explanation: "Creates or updates the API product definition in the Apigee organization.",
      },
      {
        title: "Deploy Developer User and Register Apps",
        command: "aft -i dev-user.yaml --org my-org -f user",
        explanation: "Provisions the developer in Apigee, creates their registered apps, and configures API credentials.",
      },
      {
        title: "Deploy Complete Template (Proxy + Products + Users)",
        command: "aft -i FullTemplate.yaml --org my-org --environment dev",
        explanation: "Orchestrates a full deployment in one command: deploys the proxy, provisions all associated products, and creates users with app keys.",
      },
    ],
  },
  {
    id: "cloud-delete",
    title: "Resource Deletion (--delete)",
    description:
      "Tears down and deletes Apigee resources defined in local YAML files. Handles multi-resource templates with automatic reverse dependency ordering (Users -> Products -> Proxies).",
    examples: [
      {
        title: "Delete Proxy from Apigee",
        command: "aft -i WeatherAPI.yaml --org my-org --delete",
        explanation: "Undeploys all revisions and deletes the proxy from the Apigee organization.",
      },
      {
        title: "Delete API Product",
        command: "aft -i standard-product.yaml --org my-org -f product --delete",
        explanation: "Deletes the API product from the Apigee organization.",
      },
      {
        title: "Delete Developer User and Apps",
        command: "aft -i dev-user.yaml --org my-org -f user --delete",
        explanation: "Deletes developer apps, API credentials, and developer account.",
      },
      {
        title: "Clean up Full Template Environment",
        command: "aft -i FullTemplate.yaml --org my-org --delete",
        explanation: "Safely cleans up everything created by the template in the correct dependency order.",
      },
    ],
  },
];

// Complete CLI options matrix
const cliOptions = [
  { flag: "--input, -i", arg: "<path|name>", desc: "Input path to a ZIP, JSON, or YAML file, or an Apigee resource name." },
  { flag: "--output, -o", arg: "<path>", desc: "Optional file or directory output path (e.g. proxy.yaml, bundle.zip, ./proxies/)." },
  { flag: "--organization, --org, --project", arg: "<name>", desc: "Apigee organization or GCP project name to export from or deploy to. All 3 aliases are interchangeable." },
  { flag: "--environment", arg: "<name>", desc: "Apigee environment name to deploy the proxy revision to (e.g. dev, test, prod)." },
  { flag: "--service-account", arg: "<email>", desc: "Google Cloud service account email attached to proxy deployment." },
  { flag: "--format, -f", arg: "<format>", desc: "Resource format: 'proxy', 'template', 'feature', 'product', 'user', or 'sharedflow' ('sf')." },
  { flag: "--applyFeature, -a", arg: "<features>", desc: "Feature name or comma-separated list of features to apply to a template or proxy." },
  { flag: "--removeFeature, -r", arg: "<features>", desc: "Feature name or comma-separated list of features to remove from a template or proxy." },
  { flag: "--parameters, -p", arg: "<list>", desc: "Parameter substitutions when instantiating a template (e.g. key1=val1,key2=val2)." },
  { flag: "--basePath, -b", arg: "<path>", desc: "Endpoint base path when scaffolding a new proxy or template (e.g. /v1/my-api)." },
  { flag: "--targetUrl, -u", arg: "<url>", desc: "Backend target URL when scaffolding a new proxy or template." },
  { flag: "--name, -n", arg: "<name>", desc: "The name for the output template, feature, or proxy." },
  { flag: "--list, -l", arg: "--", desc: "List all templates and features available in the central repository (supports -f json/yaml)." },
  { flag: "--config, -c", arg: "<org>", desc: "Display runtime configuration information for an Apigee X organization." },
  { flag: "--delete", arg: "--", desc: "Delete Apigee resources defined in input template, product, user, or proxy." },
  { flag: "--token, -t", arg: "<token>", desc: "Google Cloud OAuth2 token for Apigee API (uses Application Default Credentials if omitted)." },
  { flag: "--drz, -d", arg: "<region>", desc: "Use a DRZ Apigee endpoint ('us', 'eu', 'in') for data-residency compliance." },
  { flag: "--help, -h", arg: "--", desc: "Display CLI usage instructions and version information." },
  { flag: "--version, -v", arg: "--", desc: "Display current AFT version number." },
];

// Practical recipes / cookbook
const cookbook = [
  {
    id: "recipe-ai-gateway",
    title: "Recipe 1: Building a Multi-Model AI Gateway Proxy",
    description: "Create an enterprise AI gateway proxy routing to Google Cloud Vertex AI Model Garden with automatic token extraction and authentication.",
    steps: [
      {
        step: "1. Create an empty template proxy",
        code: "aft -n AI-Gateway -o AI-Gateway.yaml",
        note: "Initializes a minimal template YAML with default proxy endpoints.",
      },
      {
        step: "2. Apply Google Cloud Model Garden target feature",
        code: "aft AI-Gateway.yaml -a ai-target-googlecloud -o AI-Gateway.yaml",
        note: "Injects Google Cloud Model Garden targets and token header setup into the proxy.",
      },
      {
        step: "3. Apply API Key Verification and Rate Limiting",
        code: "aft AI-Gateway.yaml -a auth-apikey-verify,ai-auth-quota -o AI-Gateway.yaml",
        note: "Secures the AI gateway with API key enforcement and per-model quota controls.",
      },
      {
        step: "4. Deploy to Apigee X Environment",
        code: "aft -i AI-Gateway.yaml --org my-apigee-org --environment dev",
        note: "Deploys the secured AI gateway proxy directly to the dev environment in Apigee X.",
      },
    ],
  },
  {
    id: "recipe-repo-migration",
    title: "Recipe 2: Bulk Exporting Apigee X Org to Git for CI/CD",
    description: "Export all proxies, products, and developer credentials from an existing Apigee organization into structured folders for GitOps version control.",
    steps: [
      {
        step: "1. Export all proxies to ./proxies/ directory",
        code: "aft --org production-org -o ./proxies/",
        note: "Converts every deployed proxy in the org into a clean YAML file.",
      },
      {
        step: "2. Export all API products to ./products/ directory",
        code: "aft --org production-org -f product -o ./products/",
        note: "Exports product definitions with quotas, environments, and allowed proxies.",
      },
      {
        step: "3. Export all developers & developer apps to ./users/ directory",
        code: "aft --org production-org -f user -o ./users/",
        note: "Extracts developer user profiles and API credential configurations.",
      },
    ],
  },
  {
    id: "recipe-sharedflow",
    title: "Recipe 3: Packaging Reusable Feature into SharedFlow Bundle",
    description: "Maintain security policies as clean YAML features locally, and compile them into Apigee SharedFlow ZIP bundles for deployment.",
    steps: [
      {
        step: "1. Inspect the security feature definition",
        code: "aft describe auth-apikey-verify",
        note: "Verifies the policies and pre-flow steps included in the feature.",
      },
      {
        step: "2. Compile into an Apigee SharedFlow ZIP bundle",
        code: "aft -i auth-apikey-verify.yaml -f sf -o SF-ApiKeyVerify.zip",
        note: "Builds a standard SharedFlow bundle ready for gcloud or apigeecli deployment.",
      },
    ],
  },
];

// Helper to escape HTML characters
function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

// Formats descriptions with clickable links opening in a new tab
function renderFormattedText(str: string): string {
  const escaped = escapeHtml(str);
  // Match markdown links: [text](url)
  const withMarkdownLinks = escaped.replace(
    /\[([^\]]+)\]\((https?:\/\/[^\s\)]+)\)/g,
    '<a href="$2" target="_blank" rel="noopener noreferrer" class="external-link">$1 ↗</a>'
  );
  // Match bare URLs
  return withMarkdownLinks.replace(
    /(^|[\s(])(https?:\/\/[^\s\)\<\>]+)/g,
    '$1<a href="$2" target="_blank" rel="noopener noreferrer" class="external-link">$2 ↗</a>'
  );
}

// Generate the complete HTML documentation page
function generateDocsHtml(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Apigee Feature Templater (aft) v${version} · Documentation &amp; CLI Reference</title>
  <meta name="description" content="Complete developer documentation, CLI command reference, interactive search, and examples for Apigee Feature Templater (aft) v${version}." />
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500;600;700&display=swap" rel="stylesheet" />
  <style>
    :root {
      --bg-base: #0a0e17;
      --bg-surface: #111827;
      --bg-elevated: #1a2234;
      --bg-card: #151d30;
      --bg-code: #0c121e;
      --border-subtle: rgba(255, 255, 255, 0.08);
      --border-focus: rgba(6, 182, 212, 0.5);
      --text-main: #f3f4f6;
      --text-muted: #9ca3af;
      --text-dim: #6b7280;
      --accent-cyan: #06b6d4;
      --accent-cyan-light: #22d3ee;
      --accent-blue: #3b82f6;
      --accent-purple: #a855f7;
      --accent-green: #10b981;
      --accent-amber: #f59e0b;
      --accent-red: #ef4444;
      --sidebar-width: 310px;
      --header-height: 64px;
      --radius-sm: 6px;
      --radius-md: 10px;
      --radius-lg: 16px;
      --font-sans: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      --font-mono: 'JetBrains Mono', SFMono-Regular, Menlo, Monaco, Consolas, monospace;
    }

    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }

    html {
      scroll-behavior: smooth;
      scroll-padding-top: calc(var(--header-height) + 24px);
      background-color: var(--bg-base);
      color: var(--text-main);
      font-family: var(--font-sans);
      font-size: 15px;
      line-height: 1.6;
    }

    body {
      display: flex;
      min-height: 100vh;
      background-color: var(--bg-base);
    }

    /* Mobile Header & Backdrop */
    .mobile-header {
      display: none;
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      height: var(--header-height);
      background: rgba(17, 24, 39, 0.95);
      backdrop-filter: blur(12px);
      border-bottom: 1px solid var(--border-subtle);
      z-index: 100;
      padding: 0 16px;
      align-items: center;
      justify-content: space-between;
    }

    .mobile-backdrop {
      display: none;
      position: fixed;
      inset: 0;
      background: rgba(0, 0, 0, 0.6);
      z-index: 80;
    }

    .menu-toggle {
      background: transparent;
      border: 1px solid var(--border-subtle);
      color: var(--text-main);
      padding: 8px 12px;
      border-radius: var(--radius-sm);
      cursor: pointer;
      font-family: var(--font-sans);
      font-size: 14px;
      display: flex;
      align-items: center;
      gap: 6px;
    }

    /* Sidebar Navigation */
    .sidebar {
      width: var(--sidebar-width);
      height: 100vh;
      position: sticky;
      top: 0;
      flex-shrink: 0;
      background: var(--bg-surface);
      border-right: 1px solid var(--border-subtle);
      display: flex;
      flex-direction: column;
      z-index: 90;
      overflow: hidden;
    }

    .sidebar-header {
      padding: 20px 20px 16px;
      border-bottom: 1px solid var(--border-subtle);
    }

    .brand {
      display: flex;
      align-items: center;
      gap: 12px;
      text-decoration: none;
      color: inherit;
    }

    .brand-logo {
      width: 36px;
      height: 36px;
      border-radius: 8px;
      background: #000;
      display: block;
    }

    .brand-text h1 {
      font-size: 16px;
      font-weight: 700;
      letter-spacing: -0.02em;
      color: #fff;
    }

    .brand-version {
      display: inline-block;
      font-size: 11px;
      font-weight: 600;
      font-family: var(--font-mono);
      color: var(--accent-cyan);
      background: rgba(6, 182, 212, 0.12);
      padding: 1px 8px;
      border-radius: 12px;
      border: 1px solid rgba(6, 182, 212, 0.25);
      margin-top: 2px;
    }

    .search-box {
      padding: 14px 20px 10px;
    }

    .search-input-wrapper {
      position: relative;
      display: flex;
      align-items: center;
    }

    .search-input {
      width: 100%;
      background: var(--bg-elevated);
      border: 1px solid var(--border-subtle);
      border-radius: var(--radius-sm);
      padding: 8px 36px 8px 12px;
      color: var(--text-main);
      font-size: 13px;
      font-family: var(--font-sans);
      outline: none;
      transition: all 0.2s ease;
    }

    .search-input:focus {
      border-color: var(--accent-cyan);
      box-shadow: 0 0 0 2px rgba(6, 182, 212, 0.2);
    }

    .search-kbd {
      position: absolute;
      right: 10px;
      font-family: var(--font-mono);
      font-size: 10px;
      background: rgba(255, 255, 255, 0.1);
      color: var(--text-dim);
      padding: 2px 6px;
      border-radius: 4px;
      pointer-events: none;
    }

    .filter-pills {
      display: flex;
      gap: 6px;
      padding: 0 20px 12px;
      overflow-x: auto;
      scrollbar-width: none;
      -ms-overflow-style: none;
    }

    .filter-pills::-webkit-scrollbar {
      display: none;
    }

    .pill-btn {
      background: var(--bg-elevated);
      border: 1px solid var(--border-subtle);
      color: var(--text-muted);
      font-size: 11px;
      font-weight: 500;
      padding: 4px 10px;
      border-radius: 14px;
      cursor: pointer;
      white-space: nowrap;
      transition: all 0.15s ease;
    }

    .pill-btn:hover {
      color: var(--text-main);
      border-color: rgba(255, 255, 255, 0.2);
    }

    .pill-btn.active {
      background: var(--accent-cyan);
      color: #000;
      font-weight: 600;
      border-color: var(--accent-cyan);
    }

    .nav-content {
      flex: 1;
      overflow-y: auto;
      overflow-x: hidden;
      padding: 10px 14px 24px;
    }

    .nav-content::-webkit-scrollbar {
      width: 5px;
    }

    .nav-content::-webkit-scrollbar-thumb {
      background: rgba(255, 255, 255, 0.1);
      border-radius: 3px;
    }

    .nav-group {
      margin-bottom: 20px;
    }

    .nav-group-title {
      font-size: 11px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      color: var(--text-dim);
      padding: 6px 10px;
    }

    .nav-link {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      padding: 7px 10px;
      color: var(--text-muted);
      text-decoration: none;
      font-size: 13px;
      border-radius: var(--radius-sm);
      transition: all 0.15s ease;
      margin-bottom: 2px;
      white-space: nowrap;
      overflow: hidden;
    }

    .nav-link span:first-child {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .nav-link:hover {
      background: rgba(255, 255, 255, 0.05);
      color: var(--text-main);
    }

    .nav-link.active {
      background: rgba(6, 182, 212, 0.12);
      color: var(--accent-cyan-light);
      font-weight: 600;
      border-left: 2px solid var(--accent-cyan);
    }

    .nav-tag {
      font-size: 10px;
      font-family: var(--font-mono);
      padding: 1px 6px;
      border-radius: 10px;
      background: rgba(255, 255, 255, 0.06);
      color: var(--text-dim);
    }

    .sidebar-footer {
      padding: 14px 20px;
      border-top: 1px solid var(--border-subtle);
      font-size: 12px;
      color: var(--text-dim);
      display: flex;
      justify-content: space-between;
      align-items: center;
    }

    .sidebar-footer a {
      color: var(--text-muted);
      text-decoration: none;
    }

    .sidebar-footer a:hover {
      color: var(--accent-cyan);
    }

    a.external-link {
      color: var(--accent-cyan-light);
      text-decoration: underline;
      text-underline-offset: 3px;
      word-break: break-all;
      transition: color 0.15s ease;
    }

    a.external-link:hover {
      color: #fff;
    }

    /* Main Container */
    .main-wrapper {
      flex: 1;
      display: flex;
      flex-direction: column;
      min-width: 0;
    }

    .main-content {
      flex: 1;
      max-width: 980px;
      width: 100%;
      margin: 0 auto;
      padding: 48px 36px 96px;
    }

    /* Hero Section */
    .hero {
      margin-bottom: 48px;
      border-bottom: 1px solid var(--border-subtle);
      padding-bottom: 40px;
    }

    .hero-badge-row {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      margin-bottom: 16px;
    }

    .badge {
      display: inline-flex;
      align-items: center;
      gap: 5px;
      font-size: 12px;
      font-weight: 600;
      padding: 3px 10px;
      border-radius: 20px;
      text-decoration: none;
    }

    .badge-blue {
      background: rgba(59, 130, 246, 0.15);
      color: #60a5fa;
      border: 1px solid rgba(59, 130, 246, 0.3);
    }

    .badge-cyan {
      background: rgba(6, 182, 212, 0.15);
      color: #67e8f9;
      border: 1px solid rgba(6, 182, 212, 0.3);
    }

    .badge-green {
      background: rgba(16, 185, 129, 0.15);
      color: #34d399;
      border: 1px solid rgba(16, 185, 129, 0.3);
    }

    .badge-purple {
      background: rgba(168, 85, 247, 0.15);
      color: #c084fc;
      border: 1px solid rgba(168, 85, 247, 0.3);
    }

    .badge-amber {
      background: rgba(245, 158, 11, 0.15);
      color: #fbbf24;
      border: 1px solid rgba(245, 158, 11, 0.3);
    }

    .hero h1 {
      font-size: 34px;
      font-weight: 800;
      letter-spacing: -0.03em;
      line-height: 1.2;
      margin-bottom: 14px;
      background: linear-gradient(135deg, #fff 40%, var(--accent-cyan-light) 100%);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
    }

    .hero p {
      font-size: 16px;
      color: var(--text-muted);
      max-width: 760px;
      margin-bottom: 24px;
      line-height: 1.6;
    }

    .install-bar {
      background: var(--bg-surface);
      border: 1px solid var(--border-subtle);
      border-radius: var(--radius-md);
      padding: 12px 18px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 16px;
      max-width: 680px;
    }

    .install-code {
      font-family: var(--font-mono);
      font-size: 13px;
      color: var(--accent-cyan-light);
      overflow-x: auto;
      white-space: nowrap;
      scrollbar-width: none;
      -ms-overflow-style: none;
    }

    .install-code::-webkit-scrollbar {
      display: none;
    }

    /* Content Typography & Sections */
    .doc-section {
      margin-bottom: 64px;
    }

    .doc-section h2 {
      font-size: 24px;
      font-weight: 700;
      letter-spacing: -0.02em;
      margin-bottom: 12px;
      color: #fff;
      display: flex;
      align-items: center;
      gap: 10px;
    }

    .doc-section h3 {
      font-size: 18px;
      font-weight: 600;
      margin: 28px 0 12px;
      color: #e5e7eb;
    }

    .doc-section p {
      color: var(--text-muted);
      margin-bottom: 16px;
      line-height: 1.65;
    }

    .doc-section ul, .doc-section ol {
      margin: 12px 0 20px 24px;
      color: var(--text-muted);
    }

    .doc-section li {
      margin-bottom: 8px;
    }

    /* Command Article Card */
    .command-card {
      background: var(--bg-surface);
      border: 1px solid var(--border-subtle);
      border-radius: var(--radius-lg);
      padding: 28px;
      margin-bottom: 40px;
      transition: border-color 0.2s ease;
    }

    .command-card:hover {
      border-color: rgba(6, 182, 212, 0.3);
    }

    .command-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      flex-wrap: wrap;
      gap: 12px;
      margin-bottom: 16px;
      padding-bottom: 16px;
      border-bottom: 1px solid var(--border-subtle);
    }

    .command-title {
      display: flex;
      align-items: center;
      gap: 12px;
    }

    .command-title h3 {
      margin: 0;
      font-size: 22px;
      font-family: var(--font-mono);
      color: #fff;
    }

    .syntax-box {
      background: var(--bg-code);
      border: 1px solid var(--border-subtle);
      border-radius: var(--radius-sm);
      padding: 10px 14px;
      font-family: var(--font-mono);
      font-size: 13px;
      color: #e2e8f0;
      margin-bottom: 18px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      overflow-x: auto;
      scrollbar-width: thin;
      scrollbar-color: rgba(255, 255, 255, 0.15) transparent;
    }

    .syntax-box::-webkit-scrollbar {
      height: 4px;
    }

    .syntax-box::-webkit-scrollbar-thumb {
      background: rgba(255, 255, 255, 0.15);
      border-radius: 4px;
    }

    .syntax-text {
      white-space: nowrap;
    }

    /* Flags & Parameters Table */
    .flags-table-wrap {
      margin: 20px 0;
      overflow-x: auto;
      border: 1px solid var(--border-subtle);
      border-radius: var(--radius-md);
      background: var(--bg-base);
    }

    table.flags-table {
      width: 100%;
      border-collapse: collapse;
      text-align: left;
      font-size: 13px;
    }

    table.flags-table th {
      background: var(--bg-elevated);
      color: var(--text-main);
      padding: 10px 14px;
      font-weight: 600;
      border-bottom: 1px solid var(--border-subtle);
    }

    table.flags-table td {
      padding: 10px 14px;
      border-bottom: 1px solid var(--border-subtle);
      color: var(--text-muted);
      vertical-align: top;
    }

    table.flags-table tr:last-child td {
      border-bottom: none;
    }

    .flag-name {
      font-family: var(--font-mono);
      font-weight: 600;
      color: var(--accent-cyan-light);
      white-space: nowrap;
    }

    /* Example Box */
    .example-box {
      background: var(--bg-card);
      border: 1px solid var(--border-subtle);
      border-radius: var(--radius-md);
      padding: 18px;
      margin-bottom: 16px;
    }

    .example-title {
      font-size: 14px;
      font-weight: 600;
      color: #f3f4f6;
      margin-bottom: 6px;
    }

    .example-desc {
      font-size: 13px;
      color: var(--text-muted);
      margin-bottom: 12px;
    }

    .code-block {
      position: relative;
      background: var(--bg-code);
      border: 1px solid rgba(255, 255, 255, 0.06);
      border-radius: var(--radius-sm);
      padding: 12px 14px;
      font-family: var(--font-mono);
      font-size: 13px;
      color: #38bdf8;
      overflow-x: auto;
      display: flex;
      justify-content: space-between;
      align-items: center;
      scrollbar-width: thin;
      scrollbar-color: rgba(255, 255, 255, 0.15) transparent;
    }

    .code-block::-webkit-scrollbar {
      height: 4px;
    }

    .code-block::-webkit-scrollbar-thumb {
      background: rgba(255, 255, 255, 0.15);
      border-radius: 4px;
    }

    .copy-btn {
      background: rgba(255, 255, 255, 0.08);
      border: 1px solid rgba(255, 255, 255, 0.12);
      color: var(--text-muted);
      font-size: 11px;
      font-family: var(--font-sans);
      padding: 4px 10px;
      border-radius: 4px;
      cursor: pointer;
      flex-shrink: 0;
      transition: all 0.15s ease;
      margin-left: 12px;
    }

    .copy-btn:hover {
      background: rgba(255, 255, 255, 0.16);
      color: #fff;
    }

    .copy-btn.copied {
      background: rgba(16, 185, 129, 0.2);
      border-color: rgba(16, 185, 129, 0.4);
      color: #34d399;
    }

    /* Search Results Overlay / Hidden states */
    .hidden-by-search {
      display: none !important;
    }

    .search-empty-state {
      display: none;
      text-align: center;
      padding: 48px 24px;
      background: var(--bg-surface);
      border: 1px dashed var(--border-subtle);
      border-radius: var(--radius-lg);
      margin: 32px 0;
    }

    .search-empty-state p {
      color: var(--text-dim);
      font-size: 15px;
      margin-bottom: 14px;
    }

    .btn-reset {
      background: var(--accent-cyan);
      color: #000;
      font-weight: 600;
      font-size: 13px;
      border: none;
      padding: 8px 16px;
      border-radius: var(--radius-sm);
      cursor: pointer;
    }

    /* Responsive */
    @media (max-width: 960px) {
      .mobile-header {
        display: flex;
      }

      .sidebar {
        position: fixed;
        left: -100%;
        top: 0;
        bottom: 0;
        transition: left 0.25s ease;
        box-shadow: 20px 0 40px rgba(0, 0, 0, 0.5);
      }

      .sidebar.open {
        left: 0;
      }

      .mobile-backdrop.open {
        display: block;
      }

      .main-wrapper {
        margin-top: var(--header-height);
      }

      .main-content {
        padding: 32px 20px 80px;
      }

      .hero h1 {
        font-size: 28px;
      }
    }
  </style>
</head>
<body>

  <!-- Mobile Top Bar -->
  <header class="mobile-header">
    <div class="brand">
      <img src="https://amalbagee.web.app/apigee/aft-logo.png" alt="AFT Logo" class="brand-logo" />
      <span style="font-weight: 700; color: #fff;">AFT Docs</span>
      <span class="brand-version">v${version}</span>
    </div>
    <button class="menu-toggle" id="menuToggle" aria-label="Toggle Navigation Menu">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="3" y1="12" x2="21" y2="12"></line><line x1="3" y1="6" x2="21" y2="6"></line><line x1="3" y1="18" x2="21" y2="18"></line></svg>
      Menu
    </button>
  </header>
  <div class="mobile-backdrop" id="mobileBackdrop"></div>

  <!-- Left Sidebar Navigation -->
  <aside class="sidebar" id="sidebar">
    <div class="sidebar-header">
      <a href="#overview" class="brand">
        <img src="https://amalbagee.web.app/apigee/aft-logo.png" alt="AFT Logo" class="brand-logo" />
        <div class="brand-text">
          <h1>Apigee Templater</h1>
          <span class="brand-version">v${version}</span>
        </div>
      </a>
    </div>

    <!-- Live Search Input -->
    <div class="search-box">
      <div class="search-input-wrapper">
        <input type="search" id="docSearch" class="search-input" placeholder="Search commands, flags, examples..." aria-label="Search Documentation" autocomplete="off" />
        <span class="search-kbd">/</span>
      </div>
    </div>

    <!-- Category Filter Pills -->
    <div class="filter-pills">
      <button class="pill-btn active" data-filter="all">All</button>
      <button class="pill-btn" data-filter="core">Core</button>
      <button class="pill-btn" data-filter="cloud">Cloud</button>
      <button class="pill-btn" data-filter="tooling">Tooling</button>
      <button class="pill-btn" data-filter="reference">Reference</button>
    </div>

    <!-- Navigation Tree -->
    <nav class="nav-content" id="sidebarNav">
      <div class="nav-group" data-category="core">
        <div class="nav-group-title">Getting Started</div>
        <a href="#overview" class="nav-link"><span>Overview &amp; Concepts</span></a>
        <a href="#installation" class="nav-link"><span>Installation</span></a>
      </div>

      <div class="nav-group" data-category="core">
        <div class="nav-group-title">Commands</div>
        <a href="#cmd-convert" class="nav-link" data-search="convert bundle yaml json feature template sharedflow parameters apply">
          <span>convert</span>
          <span class="nav-tag">default</span>
        </a>
        <a href="#cmd-describe" class="nav-link" data-search="describe inspect overview card parameters summary flow policies">
          <span>describe</span>
          <span class="nav-tag">inspect</span>
        </a>
        <a href="#cmd-list" class="nav-link" data-search="list catalog features templates browse repository json yaml">
          <span>list</span>
          <span class="nav-tag">catalog</span>
        </a>
        <a href="#cmd-config" class="nav-link" data-search="config organization gcp project region billing trial expiration hostnames">
          <span>config</span>
          <span class="nav-tag">cloud</span>
        </a>
        <a href="#cmd-completion" class="nav-link" data-search="completion shell tab install zsh bash fish powershell">
          <span>completion</span>
          <span class="nav-tag">tooling</span>
        </a>
        <a href="#cmd-skill" class="nav-link" data-search="skill ai assistant antigravity gemini claude cursor codex">
          <span>skill</span>
          <span class="nav-tag">tooling</span>
        </a>
        <a href="#cmd-cache" class="nav-link" data-search="cache clear refresh templates features">
          <span>cache</span>
          <span class="nav-tag">tooling</span>
        </a>
      </div>

      <div class="nav-group" data-category="cloud">
        <div class="nav-group-title">Apigee X Cloud</div>
        <a href="#cloud-export" class="nav-link" data-search="export proxies products users developers credentials sharedflow">
          <span>Remote Export</span>
        </a>
        <a href="#cloud-deploy" class="nav-link" data-search="deploy proxy product user developer template environment service-account">
          <span>Remote Deployment</span>
        </a>
        <a href="#cloud-delete" class="nav-link" data-search="delete cleanup proxy product user template teardown">
          <span>Resource Deletion</span>
        </a>
      </div>

      <div class="nav-group" data-category="reference">
        <div class="nav-group-title">Reference &amp; Recipes</div>
        <a href="#options-reference" class="nav-link" data-search="options flags arguments matrix table reference">
          <span>CLI Options Matrix</span>
        </a>
        <a href="#cookbook" class="nav-link" data-search="cookbook recipes ai gateway gemini api key cors migration sharedflow">
          <span>Cookbook &amp; Recipes</span>
        </a>
      </div>
    </nav>

    <div class="sidebar-footer">
      <span>Apache-2.0 License</span>
      <a href="https://github.com/apigee/apigee-templater" target="_blank" rel="noopener">GitHub ↗</a>
    </div>
  </aside>

  <!-- Main Content Wrapper -->
  <div class="main-wrapper">
    <main class="main-content">

      <!-- Hero Header -->
      <section class="hero" id="overview">
        <div class="hero-badge-row">
          <span class="badge badge-cyan">CLI Reference</span>
          <span class="badge badge-blue">Version v${version}</span>
          <span class="badge badge-green">Apigee X &amp; Hybrid</span>
          <span class="badge badge-purple">Bun Native</span>
        </div>
        <h1>Apigee Feature Templater</h1>
        <p>
          <strong>Apigee Feature Templater (aft)</strong> is a lightning-fast, zero-dependency CLI tool built for modern Apigee development. It converts effortlessly between Apigee ZIP proxy bundles, concise YAML proxies, and JSON formats, while providing modular feature composition, remote Apigee X deployments, and full developer/product exports.
        </p>
        <div class="install-bar">
          <code class="install-code">curl -fsSL https://raw.githubusercontent.com/apigee/apigee-templater/main/install.sh | sh</code>
          <button class="copy-btn" data-clipboard="curl -fsSL https://raw.githubusercontent.com/apigee/apigee-templater/main/install.sh | sh">Copy</button>
        </div>
      </section>

      <!-- Empty Search State -->
      <div id="searchEmptyState" class="search-empty-state">
        <p>No commands or topics matched your search.</p>
        <button class="btn-reset" id="resetSearchBtn">Clear Search</button>
      </div>

      <!-- Section: Installation -->
      <section class="doc-section searchable-item" id="installation" data-category="core" data-search="install curl powershell binary zero-dependency update uninstall">
        <h2>🚀 Installation &amp; Setup</h2>
        <p>AFT is compiled into single-file, zero-dependency binaries for Linux, macOS, and Windows. No Node.js or Bun runtime is required on the host system.</p>

        <h3>Option 1: One-Line Installer (Recommended)</h3>
        <p>Automatically downloads the appropriate binary for your OS and architecture, places it in your PATH, and sets execute permissions.</p>

        <div class="example-box">
          <div class="example-title">macOS &amp; Linux (Bash/Zsh)</div>
          <div class="code-block">
            <code>curl -fsSL https://raw.githubusercontent.com/apigee/apigee-templater/main/install.sh | sh</code>
            <button class="copy-btn" data-clipboard="curl -fsSL https://raw.githubusercontent.com/apigee/apigee-templater/main/install.sh | sh">Copy</button>
          </div>
        </div>

        <div class="example-box">
          <div class="example-title">Windows (PowerShell)</div>
          <div class="code-block">
            <code>iwr -useb https://raw.githubusercontent.com/apigee/apigee-templater/main/install.ps1 | iex</code>
            <button class="copy-btn" data-clipboard="iwr -useb https://raw.githubusercontent.com/apigee/apigee-templater/main/install.ps1 | iex">Copy</button>
          </div>
        </div>

        <h3>Option 2: Standalone Binary Downloads</h3>
        <p>Download directly from <a href="https://github.com/apigee/apigee-templater/releases" target="_blank" style="color: var(--accent-cyan-light);">GitHub Releases</a>:</p>
        <ul>
          <li>Linux (x64): <code>aft-linux-x64</code></li>
          <li>Linux (ARM64): <code>aft-linux-arm64</code></li>
          <li>macOS Apple Silicon: <code>aft-darwin-arm64</code></li>
          <li>macOS Intel: <code>aft-darwin-x64</code></li>
          <li>Windows (x64): <code>aft-windows-x64.exe</code></li>
        </ul>
      </section>

      <!-- Section: Commands -->
      <section class="doc-section" id="commands-section">
        <h2>⚡ CLI Commands Reference</h2>
        <p>AFT offers 7 primary commands designed for composable, non-destructive workflows.</p>

        <!-- Dynamic Commands Generation -->
        ${commands
          .map(
            (cmd) => `
        <article class="command-card searchable-item" id="${cmd.id}" data-category="${cmd.category}" data-search="${cmd.name} ${escapeHtml(cmd.description)}">
          <div class="command-header">
            <div class="command-title">
              <h3>aft ${cmd.name}</h3>
              <span class="badge badge-${cmd.badgeColor}">${cmd.badge}</span>
            </div>
          </div>

          <div class="syntax-box">
            <span class="syntax-text">${escapeHtml(cmd.syntax)}</span>
            <button class="copy-btn" data-clipboard="${escapeHtml(cmd.syntax)}">Copy</button>
          </div>

          <p>${renderFormattedText(cmd.description)}</p>

          ${
            cmd.flags.length > 0
              ? `
          <h4 style="font-size: 14px; font-weight: 600; margin: 20px 0 10px; color: #e2e8f0;">Command Options</h4>
          <div class="flags-table-wrap">
            <table class="flags-table">
              <thead>
                <tr>
                  <th style="width: 35%;">Option</th>
                  <th>Description</th>
                </tr>
              </thead>
              <tbody>
                ${cmd.flags
                  .map(
                    (f) => `
                <tr>
                  <td class="flag-name">${escapeHtml(f.flag)}</td>
                  <td>${escapeHtml(f.desc)}</td>
                </tr>`,
                  )
                  .join("")}
              </tbody>
            </table>
          </div>`
              : ""
          }

          <h4 style="font-size: 14px; font-weight: 600; margin: 24px 0 12px; color: #e2e8f0;">Examples</h4>
          ${cmd.examples
            .map(
              (ex) => `
          <div class="example-box">
            <div class="example-title">${escapeHtml(ex.title)}</div>
            <div class="example-desc">${escapeHtml(ex.description)}</div>
            <div class="code-block">
              <code>${escapeHtml(ex.command)}</code>
              <button class="copy-btn" data-clipboard="${escapeHtml(ex.command)}">Copy</button>
            </div>
          </div>`,
            )
            .join("")}
        </article>`,
          )
          .join("\n")}
      </section>

      <!-- Section: Apigee X Cloud Operations -->
      <section class="doc-section" id="cloud-section">
        <h2>☁️ Apigee X Cloud Operations</h2>
        <p>AFT interacts directly with the Google Cloud Apigee management API using standard Application Default Credentials (ADC) or explicit tokens. Use <code>--organization</code>, <code>--org</code>, or <code>--project</code> interchangeably.</p>

        ${cloudOperations
          .map(
            (op) => `
        <article class="command-card searchable-item" id="${op.id}" data-category="cloud" data-search="${escapeHtml(op.title)} ${escapeHtml(op.description)}">
          <div class="command-header">
            <div class="command-title">
              <h3>${escapeHtml(op.title)}</h3>
              <span class="badge badge-amber">Apigee Cloud</span>
            </div>
          </div>
          <p>${renderFormattedText(op.description)}</p>

          <h4 style="font-size: 14px; font-weight: 600; margin: 20px 0 12px; color: #e2e8f0;">Examples</h4>
          ${op.examples
            .map(
              (ex) => `
          <div class="example-box">
            <div class="example-title">${escapeHtml(ex.title)}</div>
            <div class="example-desc">${escapeHtml(ex.explanation)}</div>
            <div class="code-block">
              <code>${escapeHtml(ex.command)}</code>
              <button class="copy-btn" data-clipboard="${escapeHtml(ex.command)}">Copy</button>
            </div>
          </div>`,
            )
            .join("")}
        </article>`,
          )
          .join("\n")}
      </section>

      <!-- Section: CLI Options Reference Matrix -->
      <section class="doc-section searchable-item" id="options-reference" data-category="reference" data-search="options flags parameters matrix arguments reference">
        <h2>📖 Complete CLI Options Matrix</h2>
        <p>Complete reference of all command-line options, aliases, and argument expectations supported by AFT.</p>

        <div class="flags-table-wrap">
          <table class="flags-table">
            <thead>
              <tr>
                <th style="width: 28%;">Flag</th>
                <th style="width: 16%;">Argument</th>
                <th>Description</th>
              </tr>
            </thead>
            <tbody>
              ${cliOptions
                .map(
                  (opt) => `
              <tr>
                <td class="flag-name">${escapeHtml(opt.flag)}</td>
                <td style="font-family: var(--font-mono); font-size: 12px; color: var(--text-dim);">${escapeHtml(opt.arg)}</td>
                <td>${escapeHtml(opt.desc)}</td>
              </tr>`,
                )
                .join("")}
            </tbody>
          </table>
        </div>
      </section>

      <!-- Section: Cookbook & Recipes -->
      <section class="doc-section" id="cookbook">
        <h2>🍳 Cookbook &amp; Real-World Recipes</h2>
        <p>Step-by-step practical workflows for common architectural patterns.</p>

        ${cookbook
          .map(
            (recipe) => `
        <article class="command-card searchable-item" id="${recipe.id}" data-category="reference" data-search="${escapeHtml(recipe.title)} ${escapeHtml(recipe.description)}">
          <div class="command-header">
            <div class="command-title">
              <h3>${escapeHtml(recipe.title)}</h3>
              <span class="badge badge-purple">Cookbook</span>
            </div>
          </div>
          <p>${renderFormattedText(recipe.description)}</p>

          <div style="margin-top: 20px;">
            ${recipe.steps
              .map(
                (s) => `
            <div class="example-box">
              <div class="example-title">${escapeHtml(s.step)}</div>
              <div class="example-desc">${escapeHtml(s.note)}</div>
              <div class="code-block">
                <code>${escapeHtml(s.code)}</code>
                <button class="copy-btn" data-clipboard="${escapeHtml(s.code)}">Copy</button>
              </div>
            </div>`,
              )
              .join("")}
          </div>
        </article>`,
          )
          .join("\n")}
      </section>

    </main>
  </div>

  <!-- Interactive Client-side Script -->
  <script>
    (function() {
      // 1. Mobile Menu Drawer
      const menuToggle = document.getElementById('menuToggle');
      const sidebar = document.getElementById('sidebar');
      const backdrop = document.getElementById('mobileBackdrop');

      if (menuToggle && sidebar && backdrop) {
        menuToggle.addEventListener('click', () => {
          sidebar.classList.toggle('open');
          backdrop.classList.toggle('open');
        });

        backdrop.addEventListener('click', () => {
          sidebar.classList.remove('open');
          backdrop.classList.remove('open');
        });
      }

      // 2. Copy to Clipboard
      document.querySelectorAll('.copy-btn').forEach((btn) => {
        btn.addEventListener('click', async () => {
          const text = btn.getAttribute('data-clipboard');
          if (!text) return;
          try {
            await navigator.clipboard.writeText(text);
            const originalText = btn.textContent;
            btn.textContent = 'Copied! ✓';
            btn.classList.add('copied');
            setTimeout(() => {
              btn.textContent = originalText;
              btn.classList.remove('copied');
            }, 2000);
          } catch (err) {
            console.error('Failed to copy to clipboard', err);
          }
        });
      });

      // 3. Category Filter Pills
      const filterPills = document.querySelectorAll('.pill-btn');
      const searchableItems = document.querySelectorAll('.searchable-item');
      const navGroups = document.querySelectorAll('.nav-group');
      let currentFilter = 'all';

      filterPills.forEach((pill) => {
        pill.addEventListener('click', () => {
          filterPills.forEach((p) => p.classList.remove('active'));
          pill.classList.add('active');
          currentFilter = pill.getAttribute('data-filter') || 'all';
          applyFilterAndSearch();
        });
      });

      // 4. Live Search
      const searchInput = document.getElementById('docSearch');
      const emptyState = document.getElementById('searchEmptyState');
      const resetBtn = document.getElementById('resetSearchBtn');
      let currentQuery = '';

      if (searchInput) {
        searchInput.addEventListener('input', (e) => {
          currentQuery = (e.target.value || '').trim().toLowerCase();
          applyFilterAndSearch();
        });

        // Keyboard Shortcut: '/' to focus search, 'Esc' to clear
        document.addEventListener('keydown', (e) => {
          if (e.key === '/' && document.activeElement !== searchInput) {
            e.preventDefault();
            searchInput.focus();
          } else if (e.key === 'Escape' && document.activeElement === searchInput) {
            searchInput.value = '';
            currentQuery = '';
            applyFilterAndSearch();
            searchInput.blur();
          }
        });
      }

      if (resetBtn && searchInput) {
        resetBtn.addEventListener('click', () => {
          searchInput.value = '';
          currentQuery = '';
          currentFilter = 'all';
          filterPills.forEach((p) => p.classList.toggle('active', p.getAttribute('data-filter') === 'all'));
          applyFilterAndSearch();
        });
      }

      function applyFilterAndSearch() {
        let visibleCount = 0;

        searchableItems.forEach((item) => {
          const category = item.getAttribute('data-category') || '';
          const searchText = (item.getAttribute('data-search') || '' + item.textContent).toLowerCase();

          const matchesCategory = currentFilter === 'all' || category === currentFilter;
          const matchesQuery = !currentQuery || searchText.includes(currentQuery);

          if (matchesCategory && matchesQuery) {
            item.classList.remove('hidden-by-search');
            visibleCount++;
          } else {
            item.classList.add('hidden-by-search');
          }
        });

        // Filter sidebar navigation
        navGroups.forEach((group) => {
          const groupCat = group.getAttribute('data-category') || '';
          const matchesCat = currentFilter === 'all' || groupCat === currentFilter;
          group.style.display = matchesCat ? 'block' : 'none';

          const links = group.querySelectorAll('.nav-link');
          links.forEach((link) => {
            const linkSearch = (link.getAttribute('data-search') || '' + link.textContent).toLowerCase();
            const matchesLinkQuery = !currentQuery || linkSearch.includes(currentQuery);
            link.style.display = matchesLinkQuery ? 'flex' : 'none';
          });
        });

        if (emptyState) {
          emptyState.style.display = visibleCount === 0 ? 'block' : 'none';
        }
        updateActiveNav();
      }

      // 5. Scrollspy for Active Nav Link
      const navLinks = Array.from(document.querySelectorAll('.nav-link'));
      const targetIds = navLinks
        .map((link) => (link.getAttribute('href') || '').replace('#', ''))
        .filter(Boolean);
      const trackedElements = targetIds
        .map((id) => document.getElementById(id))
        .filter((el) => el !== null);

      function updateActiveNav() {
        const triggerOffset = 140;
        let currentActiveId = '';

        if (window.scrollY < 100) {
          currentActiveId = 'overview';
        } else if (window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 50) {
          currentActiveId = targetIds[targetIds.length - 1];
        } else {
          for (let i = trackedElements.length - 1; i >= 0; i--) {
            const el = trackedElements[i];
            if (el.offsetParent === null) continue; // element is hidden
            const rect = el.getBoundingClientRect();
            if (rect.top <= triggerOffset) {
              currentActiveId = el.id;
              break;
            }
          }
        }

        if (currentActiveId) {
          navLinks.forEach((link) => {
            const href = link.getAttribute('href');
            if (href === '#' + currentActiveId) {
              link.classList.add('active');
            } else {
              link.classList.remove('active');
            }
          });
        }
      }

      navLinks.forEach((link) => {
        link.addEventListener('click', () => {
          navLinks.forEach((l) => l.classList.remove('active'));
          link.classList.add('active');
          if (sidebar && sidebar.classList.contains('open')) {
            sidebar.classList.remove('open');
            if (backdrop) backdrop.classList.remove('open');
          }
        });
      });

      window.addEventListener('scroll', updateActiveNav, { passive: true });
      window.addEventListener('resize', updateActiveNav, { passive: true });
      updateActiveNav();
    })();
  </script>
</body>
</html>`;
}

// Build and write the documentation
const htmlContent = generateDocsHtml();
fs.writeFileSync(outputFile, htmlContent, "utf-8");

const stats = fs.statSync(outputFile);
console.log(`✅ Documentation successfully generated: ${outputFile} (${Math.round(stats.size / 1024)} KB)`);
