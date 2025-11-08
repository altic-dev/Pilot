import { z } from "zod";
import { generateText, tool, stepCountIs } from "ai";
import { anthropic } from "@ai-sdk/anthropic";
import { logger } from "@/lib/logger";

const TEXT_VARIATION_AGENT_PROMPT = `You are a creative copywriting AI specialized in generating compelling A/B test variations for digital products.

## Your Expertise

You excel at:
- Writing clear, action-oriented copy that drives conversions
- Understanding psychological triggers (urgency, social proof, value proposition, curiosity)
- Adapting tone and style to match different contexts and audiences
- Creating variations that are meaningfully different for A/B testing
- Keeping copy concise and impactful

## A/B Testing Best Practices

When generating variations:
- Make meaningful changes that test a specific hypothesis (tone, benefit vs feature, urgency, etc.)
- Keep copy clear and scannable
- Focus on user benefits, not just features
- Use active voice and strong verbs
- Consider the user's journey and intent at that point
- Ensure the variation is measurably different from the original

## Your Task

Generate ONE compelling text variation based on the provided context. If existing text is provided, create a meaningful alternative that tests a different approach. If no existing text is provided, create compelling copy from scratch.

## Output Format

Provide your response in this format:

VARIATION:
[Your generated text variation here]

APPROACH:
[Brief 1-2 sentence explanation of the strategy behind this variation]
`;

export const textVariationTool = tool({
  description: "Generate creative text variations for A/B testing experiments (headlines, CTAs, button text, marketing copy). Can create new copy from scratch or generate variations of existing text. Returns one compelling variation with an explanation of the approach.",
  inputSchema: z.object({
    context: z
      .string()
      .min(5, "Context must be at least 5 characters")
      .describe("Description of what the text is for (e.g., 'checkout CTA button', 'hero headline for SaaS landing page', 'product description')"),
    existingText: z
      .string()
      .optional()
      .describe("Optional: Current text to generate a variation from. If not provided, will create new copy from scratch."),
    targetAudience: z
      .string()
      .optional()
      .describe("Optional: Description of the target audience (e.g., 'B2B SaaS founders', 'young parents', 'enterprise decision makers')"),
    tone: z
      .string()
      .optional()
      .describe("Optional: Desired tone (e.g., 'professional', 'casual', 'urgent', 'playful', 'empathetic', 'authoritative')"),
  }),
  execute: async ({ context, existingText, targetAudience, tone }): Promise<string> => {
    logger.info("Text variation tool invoked", {
      context: context.substring(0, 100),
      hasExistingText: !!existingText,
      targetAudience: targetAudience?.substring(0, 50),
      tone,
    });

    try {
      // Build the prompt with all provided context
      let prompt = `${TEXT_VARIATION_AGENT_PROMPT}

## Context
${context}`;

      if (existingText) {
        prompt += `

## Existing Text
${existingText}

Generate a meaningful variation of this text that tests a different approach while maintaining the same general purpose.`;
      } else {
        prompt += `

Generate compelling copy for this use case.`;
      }

      if (targetAudience) {
        prompt += `

## Target Audience
${targetAudience}`;
      }

      if (tone) {
        prompt += `

## Desired Tone
${tone}`;
      }

      logger.info("Generating text variation with Claude");

      const result = await generateText({
        model: anthropic("claude-sonnet-4-5"),
        prompt,
        stopWhen: stepCountIs(5),
        maxOutputTokens: 1000
      });

      logger.info("Text variation generated successfully", {
        textLength: result.text.length,
        textPreview: result.text.substring(0, 200),
      });

      return result.text;
    } catch (error) {
      logger.error("Failed to generate text variation", {
        error: error instanceof Error ? {
          message: error.message,
          stack: error.stack,
        } : String(error),
        context: context.substring(0, 100),
      });
      throw new Error(`Text variation generation failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  },
});

