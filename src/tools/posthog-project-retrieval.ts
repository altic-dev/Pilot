import { tool } from "ai";
import description from "./posthog-project-retrieval.md";
import { z } from "zod";
import { POSTHOG_URL } from "@/lib/constants";
import { logger } from "@/lib/logger";

export const posthogProjectRetrievalTool = tool({
  description: description,
  inputSchema: z.object(),
  execute: async (): Promise<{
    projectId: string;
    projectName: string;
    projectUrl: string;
  }> => {
    try {
      const response = await fetch(`${POSTHOG_URL}/api/projects/`, {
        headers: {
          Authorization: `Bearer ${process.env.POSTHOG_PERSONAL_API_KEY}`,
        },
      });

      if (!response.ok) {
        const errorText = await response.text();
        logger.error("Unable to retrieve project", { status: response.status, error: errorText });
        throw new Error(
          `Unable to retrieve project, PostHog API error: ${response.status} - ${errorText}`,
        );
      }

      const data = await response.json();
      logger.info("Successfully retrieved data from posthog", data);
      const projects = data.results;
      
      if (!projects || projects.length === 0) {
        throw new Error("No PostHog projects found for this account");
      }
      
      const latestProject = projects[0];

      return {
        projectId: String(latestProject.id),
        projectName: latestProject.name,
        projectUrl: `${POSTHOG_URL}/project/${latestProject.id}`,
      };
    } catch (error) {
      logger.error("Failed to retrieve PostHog project", error);
      throw error;
    }
  },
});
