# Experiment Code Update Agent

Automates adding PostHog feature flag code to a GitHub repository for A/B testing. Clones the repo, identifies target files, adds feature flag implementation, and commits changes.

## When to Use This Tool

Use when:
- User wants to add feature flag code for A/B testing
- Implementing a PostHog experiment in a GitHub repository
- Automating feature flag setup based on a hypothesis
- Integrating PostHog experiments into an existing codebase

## Agent Workflow

1. Clone the GitHub repository
2. Analyze codebase (README, package files) to detect language, framework, and dependencies
3. Locate target files based on the hypothesis
4. Install appropriate PostHog SDK if needed
5. Generate and apply feature flag code
6. Commit and push changes

## PostHog Feature Flag Patterns

### JavaScript/TypeScript (Browser)
```javascript
import posthog from 'posthog-js'
posthog.init('<key>', { api_host: 'https://us.i.posthog.com' })
if (posthog.isFeatureEnabled('flag-key')) { /* new feature */ }
```

### React
```javascript
import { useFeatureFlagEnabled } from 'posthog-js/react'
const showNew = useFeatureFlagEnabled('flag-key')
```

### Next.js (Client)
```javascript
'use client'
import { useFeatureFlagEnabled } from 'posthog-js/react'
```

### Next.js (Server)
```javascript
import { PostHog } from 'posthog-node'
const posthog = new PostHog('<key>', { host: 'https://us.i.posthog.com' })
await posthog.isFeatureEnabled('flag-key', 'user-id')
```

### Python
```python
from posthog import Posthog
posthog = Posthog('<key>', host='https://us.i.posthog.com')
posthog.feature_enabled('flag-key', 'user-id')
```

### Node.js
```javascript
const { PostHog } = require('posthog-node')
const posthog = new PostHog('<key>', { host: 'https://us.i.posthog.com' })
await posthog.isFeatureEnabled('flag-key', 'user-id')
```

## SDK Installation

- JavaScript/TypeScript (client): `posthog-js`
- Node.js/Next.js (server): `posthog-node`
- Python: `posthog`
- React: `posthog-js` (with React hooks)

## Available Tools

- **bashTool**: Execute bash commands (ls, grep, cat, find, git only)
- **textEditorTool**: View, create, and edit files
- **fileUpdateTool**: Apply intelligent code merges using MorphLLM

## Best Practices

- Read README/package.json first to identify language and framework
- Check if PostHog is already initialized to avoid duplicates
- Use language-appropriate feature flag patterns
- Keep code changes minimal and focused
- Include clear comments explaining the A/B test logic
- Maximum 20 steps to prevent infinite loops
- Always await the generateText result before returning
