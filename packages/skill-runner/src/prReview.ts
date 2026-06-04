import {
  type JsonObject,
  type PrReviewResult,
  prReviewResultSchema
} from "@llm-skills-poc/skill-spec";

export interface PrReviewInputs {
  repo: string;
  diff: string;
  risk_level: "low" | "medium" | "high";
}

export function parsePrReviewInputs(inputs: JsonObject): PrReviewInputs {
  const repo = inputs.repo;
  const diff = inputs.diff;
  const riskLevel = inputs.risk_level;

  if (typeof repo !== "string" || repo.length === 0) {
    throw new Error("Missing required string input: repo");
  }
  if (typeof diff !== "string" || diff.length === 0) {
    throw new Error("Missing required string input: diff");
  }
  if (riskLevel !== "low" && riskLevel !== "medium" && riskLevel !== "high") {
    throw new Error("Missing required enum input: risk_level");
  }

  return { repo, diff, risk_level: riskLevel };
}

export function runPrReview(inputs: PrReviewInputs): PrReviewResult {
  const lowerDiff = inputs.diff.toLowerCase();
  const blockingIssues: string[] = [];
  const suggestions: string[] = [];
  const tests: string[] = [];

  if (lowerDiff.includes("password") || lowerDiff.includes("secret") || lowerDiff.includes("api_key")) {
    blockingIssues.push("Potential secret-handling change detected; verify no credentials are introduced or exposed.");
  }

  if (lowerDiff.includes("payment") || lowerDiff.includes("charge") || lowerDiff.includes("authorize")) {
    suggestions.push("Payment or authorization logic changed; review failure handling and rollback behavior.");
  }

  if (!lowerDiff.includes("test") && !lowerDiff.includes("spec")) {
    tests.push("Add tests that cover the changed behavior and at least one edge case.");
  }

  if (lowerDiff.includes("delete") || lowerDiff.includes("drop table") || lowerDiff.includes("truncate")) {
    suggestions.push("Destructive data operation detected; confirm safeguards and recovery path.");
  }

  if (suggestions.length === 0) {
    suggestions.push("Validate empty inputs and boundary conditions for the changed code path.");
  }

  if (tests.length === 0) {
    tests.push("Run the existing focused test suite for the touched module.");
  }

  const deploymentRisk = computeDeploymentRisk(inputs.risk_level, blockingIssues, suggestions, tests);

  return prReviewResultSchema.parse({
    summary: `Reviewed ${inputs.repo}. The change has ${deploymentRisk} deployment risk based on the supplied diff.`,
    blocking_issues: blockingIssues,
    non_blocking_suggestions: suggestions,
    test_recommendations: tests,
    deployment_risk: deploymentRisk
  });
}

function computeDeploymentRisk(
  requestedRisk: PrReviewInputs["risk_level"],
  blockingIssues: string[],
  suggestions: string[],
  tests: string[]
): PrReviewResult["deployment_risk"] {
  if (blockingIssues.length > 0) {
    return "high";
  }
  if (requestedRisk === "high") {
    return "high";
  }
  if (suggestions.some((suggestion) => suggestion.toLowerCase().includes("payment"))) {
    return "high";
  }
  if (requestedRisk === "medium" || tests.some((test) => test.includes("Add tests"))) {
    return "medium";
  }
  return "low";
}
