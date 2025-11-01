Retrieves the user's PostHog project information. Returns the latest project by default.

## When to Use

- User mentions a specific project or needs to identify which PostHog project to work with
- Before setting up experiments or accessing project-specific features
- User asks to "find my project" or similar requests

## Output Format

Returns:
- Project ID
- Project name
- Project URL (link to PostHog dashboard)

Note: Currently returns the most recent project. Does not perform search filtering.
