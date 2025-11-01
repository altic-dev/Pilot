# Pilot - AI-Powered A/B Testing Agent

Pilot is an AI assistant that helps you set up PostHog A/B testing experiments and automatically integrate feature flags into your codebase.

## Features

- 🔍 **Automatic Project Detection**: Finds your PostHog projects
- 🧪 **Experiment Creation**: Creates A/B tests with appropriate metrics
- 🤖 **Code Automation**: Automatically adds feature flag code to your GitHub repositories
- 🚀 **Multi-Framework Support**: Works with React, Next.js, Python, Node.js, and more

## Getting Started

### Prerequisites

- Node.js 20+ and pnpm
- PostHog account with API access
- MorphLLM API key (for code editing)
- GitHub repository (for code automation)

### Installation

1. Clone the repository:
```bash
git clone <your-repo-url>
cd pilot
```

2. Install dependencies:
```bash
pnpm install
```

3. Set up environment variables:
```bash
cp .env.example .env.local
```

Edit `.env.local` and add your API keys:
- `POSTHOG_PERSONAL_API_KEY`: Get from [PostHog Settings](https://us.posthog.com/settings/user-api-keys)
- `MORPH_LLM_API_KEY`: Get from [MorphLLM](https://morphllm.com)

4. Run the development server:
```bash
pnpm dev
```

5. Open [http://localhost:3000](http://localhost:3000) in your browser

## Usage

### Creating an Experiment

1. Navigate to the Pilot interface
2. Describe your experiment hypothesis (e.g., "Test a new checkout button design that reduces cart abandonment")
3. Pilot will:
   - Find your PostHog project
   - Create the experiment with appropriate metrics
   - Generate a feature flag key
   - Optionally add the feature flag code to your repository

### Example Interactions

**Simple experiment creation:**
```
"Create an experiment to test a new hero section on the homepage"
```

**With code automation:**
```
"I want to test a new pricing page layout. Here's my repo: https://github.com/username/project"
```

## How It Works

Pilot uses AI tool calling to orchestrate three main operations:

1. **Project Retrieval**: Fetches your PostHog project information
2. **Experiment Creation**: Creates experiments with default "reduce page leave" metrics
3. **Code Updates**: Clones your repo, detects the framework, adds feature flag code, and commits changes

### Supported Frameworks

- React (with posthog-js)
- Next.js (client and server components)
- Node.js/Express
- Python/Django/Flask
- Plain JavaScript
- And more...

## Architecture

- **Frontend**: Next.js 15 with React 19
- **AI**: Claude Sonnet 4 via Anthropic AI SDK
- **Code Editing**: MorphLLM for intelligent code merging
- **Styling**: Tailwind CSS v4

## API Routes

- `POST /api/chat`: Main chat endpoint with streaming responses

## Tools

Pilot has access to three specialized tools:

1. **posthogProjectRetrievalTool**: Retrieves PostHog projects
2. **posthogExperimentCreationTool**: Creates experiments with metrics
3. **experimentCodeUpdateTool**: Automates feature flag implementation

## Development

### Project Structure

```
src/
├── app/              # Next.js app router
│   ├── api/chat/     # Chat API endpoint
│   └── chat/         # Chat UI page
├── components/       # React components
├── tools/            # AI tool implementations
├── prompts/          # System prompts
├── lib/              # Utilities and types
└── utils/            # Helper functions
```

### Adding New Tools

1. Create tool file in `src/tools/`
2. Define Zod schema for inputs
3. Implement execute function
4. Export from `src/tools/index.ts`
5. Add to tools object in `src/app/api/chat/route.ts`

## Environment Variables

Required:
- `POSTHOG_PERSONAL_API_KEY`: PostHog API authentication
- `MORPH_LLM_API_KEY`: MorphLLM code editing service

Optional:
- `ANTHROPIC_API_KEY`: If using Claude API directly

## Limitations

- Experiments default to "reduce page leave" metric only
- Code automation requires public GitHub repositories or proper authentication
- Maximum 20 AI steps per code automation session
- Bash commands limited to: ls, grep, cat, find, git

## Contributing

Contributions are welcome! Please ensure:
- TypeScript types are properly defined
- Tool prompts are concise (under 100 lines)
- Error handling is comprehensive
- Tests pass before submitting

## License

[Your License]

## Support

For issues or questions:
- GitHub Issues: [Your repo]/issues
- Documentation: [Your docs URL]
