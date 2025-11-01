# File Update Tool (MorphLLM)

Uses MorphLLM's AI model to intelligently merge code changes. Understands code structure and context for complex modifications.

## Purpose

Applies code edits using AI-powered intelligent merging. Unlike simple string replacement, it understands code context and merges snippets with `// ... existing code ...` markers.

## Input Parameters

- **instruction** (required): Brief description of what you're changing
  - Example: "Add feature flag check around the checkout button"

- **code** (required): The entire original code before edits
  - Must be complete file or function content

- **codeEdit** (required): Code snippet showing only the changes
  - Use `// ... existing code ...` to indicate unchanged sections
  - Show only parts being added or modified

## Output

Returns the final merged code as a string with all changes applied.

## Example

**Instruction:** Add PostHog feature flag to component

**Original Code:**
```javascript
export function CheckoutButton({ onClick }) {
  return (
    <button onClick={onClick} className="btn-primary">
      Checkout
    </button>
  )
}
```

**Code Edit:**
```javascript
import { useFeatureFlagEnabled } from 'posthog-js/react'

export function CheckoutButton({ onClick }) {
  const showNewButton = useFeatureFlagEnabled('new-checkout-button')
  
  return (
    <button
      onClick={onClick}
      className={showNewButton ? "btn-new" : "btn-primary"}
    >
      {showNewButton ? "Complete Purchase" : "Checkout"}
    </button>
  )
}
```

**Result:** MorphLLM merges the feature flag logic, preserving function structure.

## Best Practices

- Write concise, specific instructions
- Provide complete original code
- Use `// ... existing code ...` markers for preserved sections
- Show only what's new or modified in codeEdit
- Use appropriate comment syntax for the language:
  - JavaScript/TypeScript: `// ... existing code ...`
  - Python: `# ... existing code ...`
  - HTML: `<!-- ... existing code ... -->`

## When to Use

Use this tool when:
- Making complex, context-aware code changes
- Adding feature flag logic that wraps existing code
- You have code snippets with `// ... existing code ...` markers
- Simple string replacement isn't sufficient
- Wrapping or modifying existing logic

Use textEditorTool instead for:
- Simple string replacements
- Creating new files from scratch
- Exact text to replace is known
