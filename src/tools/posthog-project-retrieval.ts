import { tool } from "ai";
import description from "./posthog-project-retrieval.md";
import { z } from "zod/v4";
import { POSTHOG_URL } from "@/lib/constants";
import { logger } from "@/lib/logger";

export const posthogProjectRetrievalTool = tool({
  description: description,
  inputSchema: z.object(),
  execute: async () => {
    const response = await fetch(`${POSTHOG_URL}/api/projects/`, {
      headers: {
        Authorization: `Bearer ${process.env.POSTHOG_PERSONAL_API_KEY}`,
      },
    });

    if (!response.ok) {
      throw new Error(
        `Unable to retrieve project, PostHog API error: ${response.status}`,
      );
    }

    const data = await response.json();
    logger.info("Successfully retrieved data from posthog", data);
    const projects = data.results;
    const latestProject = projects[0];

    return {
      projectId: latestProject.id,
      projectName: latestProject.name,
      projectUrl: `${POSTHOG_URL}/project/${latestProject.id}`,
    };
  },
});
