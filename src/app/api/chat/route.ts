import { anthropic } from "@ai-sdk/anthropic";
import { tool, generateText, stepCountIs } from "ai";
import { z } from "zod";
import { NextResponse } from "next/server";
import { loadPrompt } from "@/utils/prompt-loader";

// Agent types based on the workflow
type AgentType =
  | "project_retrieval"
  | "experiment_setup"
  | "coding"
  | "rollout"
  | "monitoring"
  | "insights";

const CLAUDE_SONNET_MODEL = "claude-sonnet-4-20250514";
const PROJECT_RETRIEVAL_PROMPT = loadPrompt("project-retrieval");
const EXPERIMENT_SETUP_PROMPT = loadPrompt("experiment-setup");
const POSTHOG_URL = "https://us.posthog.com";

// Select agent based on message content and context
function selectAgent(message: string, context?: any): AgentType {
  const lowerMessage = message.toLowerCase();

  // Check for specific workflow stages
  if (context?.lastAgent === "hypothesis" && !context?.experimentCreated) {
    return "experiment_setup";
  }
  if (context?.experimentCreated && !context?.codeImplemented) {
    return "coding";
  }
  if (context?.codeImplemented && !context?.rolledOut) {
    return "rollout";
  }
  if (context?.rolledOut && !context?.monitored) {
    return "monitoring";
  }
  if (context?.monitored) {
    return "insights";
  }

  // Initial agent selection based on keywords
  if (
    lowerMessage.includes("hypothesis") ||
    lowerMessage.includes("test") ||
    lowerMessage.includes("experiment") ||
    lowerMessage.includes("optimize")
  ) {
    return "hypothesis";
  }

  return "hypothesis"; // Default to hypothesis generator
}

const posthogProjectRetrievalTool = tool({
  description:
    "Retrieve all projects from PostHog and let user choose if multiple exist",
  inputSchema: z.object({
    selectedProjectId: z
      .string()
      .optional()
      .describe("Specific project ID to use if known"),
  }),
  outputSchema: z.object({
    projectId: z.string().describe("The selected project Id"),
    projectName: z.string().describe("The selected project name"),
  }),
  execute: async () => {
    const response = await fetch("https://us.posthog.com/api/projects/", {
      headers: {
        Authorization: `Bearer ${process.env.POSTHOG_PERSONAL_API_KEY}`,
      },
    });

    if (!response.ok) {
      throw new Error(`PostHog API error: ${response.status}`);
    }

    const data = await response.json();
    const projects = data.results;
    const latestProject = projects[0];
    return {
      projectId: latestProject.id,
      projectName: latestProject.name,
      projectUrl: `${POSTHOG_URL}/project/${latestProject.id}`,
    };
  },
});

const posthogExperimentCreationTool = tool({
  description:
    "Create an A/B test experiment in PostHog by providing all experiment related information",
  inputSchema: z.object({
    name: z.string().describe("Experiment name"),
    description: z.string().describe("Description of the experiment"),
    feature_flag_key: z
      .string()
      .describe("Feature flag key for the experiment"),
    parameters: z.object({
      feature_flag_variants: z
        .array(
          z.object({
            key: z.string().describe("Variant key - Control/Test"),
            rolloutPercentage: z
              .number()
              .min(0)
              .max(100)
              .describe("Rollout percentage for the variant"),
          }),
        )
        .describe("Experiment variants with rollout percentages")
        .refine(
          (variants) =>
            variants.reduce((sum, v) => sum + v.rolloutPercentage, 0) === 100,
          { message: "Rollout percentages must sum to 100" },
        ),
    }),
  }),
  outputSchema: z.object({
    experimentId: z.string().describe("Experiment ID"),
    experimentUrl: z.string().describe("Experiment URL"),
  }),
});

// Code implementation tool
const codeImplementationTool = tool({
  description: "Generate code changes for A/B test implementation",
  parameters: z.object({
    experimentId: z.string().describe("Experiment ID"),
    changes: z
      .array(
        z.object({
          file: z.string(),
          selector: z.string(),
          changeType: z.enum(["css", "text", "structure"]),
          before: z.string(),
          after: z.string(),
        }),
      )
      .describe("Code changes to implement"),
  }),
  execute: async ({ experimentId, changes }) => {
    const branchName = `experiment-${experimentId}`;

    return {
      success: true,
      branchName,
      filesModified: changes.map((c) => c.file),
      changes: changes.map((change) => ({
        ...change,
        diff: `- ${change.before}\n+ ${change.after}`,
      })),
      gitCommands: [
        `git checkout -b ${branchName}`,
        `git add .`,
        `git commit -m "feat: implement A/B test ${experimentId}"`,
        `git push origin ${branchName}`,
      ],
      pullRequestUrl: `https://github.com/org/repo/pull/new/${branchName}`,
    };
  },
});

// Rollout controller tool
const rolloutControllerTool = tool({
  description: "Control experiment rollout percentages",
  parameters: z.object({
    experimentId: z.string().describe("Experiment ID"),
    targetPercentage: z
      .number()
      .min(0)
      .max(100)
      .describe("Target rollout percentage for treatment"),
  }),
  execute: async ({ experimentId, targetPercentage }) => {
    return {
      success: true,
      experimentId,
      rolloutStatus: {
        control: 100 - targetPercentage,
        treatment: targetPercentage,
      },
      stage:
        targetPercentage === 0
          ? "not_started"
          : targetPercentage < 50
            ? "ramping"
            : targetPercentage === 50
              ? "running"
              : targetPercentage === 100
                ? "completed"
                : "custom",
      metricsStable: true,
      recommendation:
        targetPercentage < 100 ? "Continue monitoring" : "Ready for analysis",
    };
  },
});

// Metrics monitoring tool
const metricsMonitoringTool = tool({
  description: "Monitor experiment metrics and perform statistical analysis",
  parameters: z.object({
    experimentId: z.string().describe("Experiment ID"),
    duration: z.number().optional().describe("Hours since experiment start"),
  }),
  execute: async ({ experimentId, duration = 24 }) => {
    // Simulate Bayesian analysis results
    const probabilityTreatmentBetter = Math.random() * 0.3 + 0.65; // 65-95% range
    const expectedLift = Math.random() * 0.15 + 0.05; // 5-20% lift
    const sampleSize = Math.floor(duration * 100 + Math.random() * 500);

    return {
      experimentId,
      metrics: {
        sampleSize: {
          control: Math.floor(sampleSize / 2),
          treatment: Math.floor(sampleSize / 2),
        },
        conversionRate: {
          control: 0.032,
          treatment: 0.032 * (1 + expectedLift),
        },
        probabilityTreatmentBetter,
        expectedLift: `${(expectedLift * 100).toFixed(1)}%`,
        credibleInterval: {
          lower: expectedLift - 0.05,
          upper: expectedLift + 0.05,
        },
        isSignificant: probabilityTreatmentBetter > 0.95,
      },
      recommendation:
        probabilityTreatmentBetter > 0.95
          ? "PROMOTE_TREATMENT"
          : probabilityTreatmentBetter < 0.05
            ? "PROMOTE_CONTROL"
            : "CONTINUE_MONITORING",
    };
  },
});

// Customer insights tool
const customerInsightsTool = tool({
  description: "Generate customer behavior insights from experiment results",
  parameters: z.object({
    experimentId: z.string().describe("Experiment ID"),
    results: z
      .object({
        winner: z.enum(["control", "treatment", "inconclusive"]),
        lift: z.number(),
        confidence: z.number(),
      })
      .describe("Experiment results"),
  }),
  execute: async ({ experimentId, results }) => {
    const insights = {
      behaviorPatterns:
        results.winner === "treatment"
          ? [
              "Users responded positively to enhanced visual hierarchy",
              "Clear CTAs improved decision-making speed",
              "Visual emphasis on recommended option increased selections",
            ]
          : [
              "Users prefer familiar interfaces",
              "Changes may have introduced cognitive load",
              "Original design better matched user expectations",
            ],
      businessImpact: {
        immediate:
          results.winner === "treatment"
            ? `Expected ${(results.lift * 100).toFixed(1)}% increase in conversions`
            : "Avoided potential conversion loss",
        longTerm: "Insights inform future optimization strategy",
      },
      nextSteps:
        results.winner === "treatment"
          ? [
              "Roll out to 100% of traffic",
              "Apply similar principles to other pages",
              "Document design patterns for reuse",
            ]
          : [
              "Revert to control",
              "Gather more user research",
              "Test alternative approaches",
            ],
      psychologicalInsights:
        "Visual saliency and hierarchy significantly impact user behavior",
    };

    return insights;
  },
});

// Agent configurations with specialized system prompts and tools
const agentConfigs = {
  project_retrieval: {
    model: anthropic(CLAUDE_SONNET_MODEL),
    systemPrompt: PROJECT_RETRIEVAL_PROMPT,
    tools: { posthogProjectRetrievalTool },
    stepCount: 5,
  },

  //   experiment_setup: {
  //     model: anthropic("claude-3-haiku-20240307"),
  //     systemPrompt: `You are an Experiment Setup Specialist for PostHog.

  // Your role is to:
  // 1. Create properly configured A/B test experiments in PostHog
  // 2. Set up feature flags for easy rollout control
  // 3. Define clear success metrics and tracking
  // 4. Start with 100% Control / 0% Treatment for gradual rollout

  // Ensure experiments are statistically valid with proper sample sizes.`,
  //     tools: { posthogExperimentCreationTool },
  //   },

  //   coding: {
  //     model: anthropic("claude-3-haiku-20240307"),
  //     systemPrompt: `You are a Senior Frontend Engineer implementing A/B test variations.

  // Your role is to:
  // 1. Implement hypothesis changes in code (CSS, React components)
  // 2. Use feature flags to control variant display
  // 3. Ensure changes are minimal and reversible
  // 4. Create clean Git branches and PRs

  // Focus on CSS/visual changes that enhance user experience.`,
  //     tools: { codeImplementationTool },
  //   },

  //   rollout: {
  //     model: anthropic("claude-3-haiku-20240307"),
  //     systemPrompt: `You are an Experiment Rollout Manager.

  // Your role is to:
  // 1. Gradually increase treatment exposure (0% → 25% → 50%)
  // 2. Monitor for regressions at each stage
  // 3. Ensure safe deployment of experimental changes
  // 4. Document rollout progress

  // Always be cautious and ready to rollback if issues arise.`,
  //     tools: { rolloutControllerTool },
  //   },

  //   monitoring: {
  //     model: anthropic("claude-3-haiku-20240307"),
  //     systemPrompt: `You are a Statistical Analyst specializing in Bayesian experiment analysis.

  // Your role is to:
  // 1. Analyze experiment metrics using Bayesian methods
  // 2. Determine statistical significance and confidence
  // 3. Make clear launch recommendations
  // 4. Provide probability of treatment being better

  // Use rigorous statistical analysis to support decisions.`,
  //     tools: { metricsMonitoringTool },
  //   },

  //   insights: {
  //     model: openai("gpt-4o-mini"),
  //     systemPrompt: `You are a Customer Behavior Analyst and Growth Strategist.

  // Your role is to:
  // 1. Extract deep customer insights from experiment results
  // 2. Explain psychological patterns behind the data
  // 3. Generate actionable business recommendations
  // 4. Plan future experiments based on learnings

  // Translate statistical results into meaningful business insights.`,
  //     tools: { customerInsightsTool },
  //   },
};

export async function POST(request: Request) {
  try {
    const { messages } = await request.json();

    if (!messages || messages.length === 0) {
      return NextResponse.json(
        { error: "No messages provided" },
        { status: 400 },
      );
    }

    const lastMessage = messages[messages.length - 1];

    // Determine context from conversation history
    const context = {
      lastAgent: null,
      experimentCreated: false,
      codeImplemented: false,
      rolledOut: false,
      monitored: false,
    };

    // Analyze conversation to understand current stage
    // const conversationText = messages
    //   .map((m: any) => m.content)
    //   .join(" ")
    //   .toLowerCase();
    // if (conversationText.includes("[experiment created]"))
    //   context.experimentCreated = true;
    // if (conversationText.includes("[code implemented]"))
    //   context.codeImplemented = true;
    // if (conversationText.includes("[rollout complete]"))
    //   context.rolledOut = true;
    // if (conversationText.includes("[monitoring complete]"))
    //   context.monitored = true;

    // const agentType = selectAgent(lastMessage.content, context);
    const agentType = "project_retrieval";
    const config = agentConfigs[agentType];

    // Stream response with selected agent
    // const result = await streamText({
    //   model: config.model,
    //   messages: [{ role: "system", content: config.systemPrompt }, ...messages],
    //   tools: config.tools,
    //   maxSteps: 5,
    // });

    const { text } = await generateText({
      model: config.model,
      messages: [{ role: "system", content: config.systemPrompt }, ...messages],
      tools: config.tools,
      stopWhen: stepCountIs(config.stepCount),
    });

    console.log("text:", text);
    return NextResponse.json({ text }, { status: 200 });
  } catch (error) {
    console.error("Chat API error:", error);
    return NextResponse.json(
      { error: "Failed to process request" },
      { status: 500 },
    );
  }
}
