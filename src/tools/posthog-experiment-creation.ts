import { z } from "zod";
import { PAGE_LEAVE_METRIC_NAME, POSTHOG_URL } from "@/lib/constants";
import { tool } from "ai";
import {
  CreateExperiment,
  DefaultSource,
  MetricGoal,
  MetricType,
} from "@/lib/posthog-types";
import { logger } from "@/lib/logger";

export const posthogExperimentCreationTool = tool({
  description:
    "Create a posthog experiment. Note that experiments live under a project",
  inputSchema: z.object({
    projectId: z.coerce.string().describe("Posthog project Id (accepts string or number)"),
    name: z.string().describe("Name of the experiment"),
    description: z
      .string()
      .describe("Hypothesis or description of the experiment"),
    featureFlagKey: z
      .string()
      .describe("A key used to identify the experiment"),
  }),
  execute: async ({ projectId, name, description, featureFlagKey }): Promise<{
    success: boolean;
    experimentId: number;
    name: string;
    featureFlagKey: string;
  }> => {
    try {
      const metricId: string = crypto.randomUUID();
      // Default to optimizing page bounce metric for now
      const createExperiment: CreateExperiment = {
        name: name,
        description: description,
        feature_flag_key: featureFlagKey,
        metrics: [
          {
            name: PAGE_LEAVE_METRIC_NAME,
            uuid: metricId,
            metric_type: MetricType.mean,
            goal: MetricGoal.decrease,
            source: {
              kind: "EventsNode",
              name: DefaultSource.pageLeave,
              event: DefaultSource.pageLeave,
              math: "total",
            },
          },
        ],
        primary_metrics_ordered_uuids: [metricId],
      };
      logger.info("Creating experiment with payload", createExperiment);

      const response = await fetch(
        `${POSTHOG_URL}/api/projects/${projectId}/experiments`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${process.env.POSTHOG_PERSONAL_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(createExperiment),
        },
      );

      if (!response.ok) {
        const errorText = await response.text();
        logger.error("Unable to create experiment", { status: response.status, error: errorText });
        throw new Error(
          `Unable to create experiment, PostHog API error: ${response.status} - ${errorText}`,
        );
      }

      const data = await response.json();
      return {
        success: true,
        experimentId: data.id,
        name: data.name,
        featureFlagKey: data.feature_flag_key,
      };
    } catch (error) {
      logger.error("Failed to create experiment", error);
      throw error;
    }
  },
});
