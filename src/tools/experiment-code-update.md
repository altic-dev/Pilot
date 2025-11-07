# Experiment Code Update Tool

Automates adding PostHog feature flag code to a GitHub repository for A/B testing experiments. This tool clones a repository, analyzes the codebase, installs dependencies if needed, adds feature flag implementation based on your hypothesis, verifies the build succeeds, and commits the changes.

## When to Use This Tool

Use this tool when you need to:
- Add PostHog feature flag code for A/B testing experiments
- Implement an experiment in a GitHub repository based on a hypothesis
- Automate the setup of feature flags in an existing codebase
- Test variations of features using PostHog experiments

## What This Tool Does

1. **Clones your GitHub repository** into a dedicated folder
2. **Analyzes the codebase** to detect language, framework, and dependencies
3. **Installs dependencies** if missing (using pnpm or npm based on project setup)
4. **Locates target files** based on your hypothesis
5. **Installs PostHog SDK** if not already present (using the correct package manager)
6. **Generates and applies feature flag code** following best practices for the detected framework
7. **Runs build verification** to ensure changes don't break the project
8. **Commits and pushes changes** only if the build succeeds

## Required Parameters

- **githubUrl**: The GitHub repository URL to clone (must be a valid URL)
- **featureFlagKey**: The PostHog feature flag key for the experiment (lowercase alphanumeric with hyphens)
- **hypothesis**: Description of what you're testing (minimum 10 characters)

## Supported Languages & Frameworks

- JavaScript/TypeScript (Browser & Node.js)
- React (including hooks)
- Next.js (Client & Server components)
- Python

## Example Usage

**Hypothesis**: "Changing the checkout button color from blue to green will increase conversions"

**Feature Flag Key**: "green-checkout-button"

**GitHub URL**: "https://github.com/yourorg/yourrepo"

The tool will automatically detect your project structure, add the appropriate PostHog feature flag code, and ensure everything builds successfully before pushing.

---
