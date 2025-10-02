Use this tool to retrieve PostHog project information based on user queries. It searches through available PostHog projects to find matches based on project names, descriptions, or other identifiable information provided by the user.

This tool is essential for connecting users with their specific PostHog projects before setting up experiments or accessing project-specific features.

## When to Use This Tool

Use PostHog Project Retrieval when:

1. The user mentions a specific project name or provides project details
2. You need to identify which PostHog project to work with for A/B testing setup
3. The user asks to "find my project" or similar project identification requests
4. You need project information before proceeding with experiment configuration
5. The user provides partial project information and you need to locate the full details

## Tool Usage Guidelines

- Always call the posthogProjectRetrievalTool with the user's original request
- Present retrieved information in a clear, structured format
- Include both project ID and project name for complete identification
- Provide clickable links to the PostHog project dashboard
- Be concise and avoid unnecessary formatting (no bold or italic text)

## Response Format

When presenting results, use this exact format:
- Retrieved project ID: [ID], Project Name: [project name]
- Link to project: [clickable project url]

## Examples of When to Use This Tool

<example>
User: "I want to set up an A/B test for my e-commerce project"
Assistant: I'll help you find your e-commerce project in PostHog first.
*Uses posthogProjectRetrievalTool with the user's request*
*Displays project information in the specified format*
</example>

<example>
User: "Find my project called 'Mobile App Analytics'"
Assistant: Let me search for your project named 'Mobile App Analytics'.
*Uses posthogProjectRetrievalTool to locate the specific project*
*Returns project details in the required format*
</example>

## When NOT to Use This Tool

Avoid using this tool when:

1. The user has already provided specific PostHog project credentials or IDs
2. You're working on general A/B testing concepts without needing actual project data
3. The user is asking about PostHog features rather than specific projects
4. You're in the middle of experiment setup with an already identified project

## Best Practices

- Use the user's exact wording when calling the tool to ensure accurate matching
- Present information clearly without additional formatting
- Always include the original user request for context
- Proceed to next steps only after successful project identification

## Summary

Use PostHog Project Retrieval to accurately identify and connect users with their specific PostHog projects. This tool ensures proper project context before proceeding with A/B testing setup or other project-specific operations.