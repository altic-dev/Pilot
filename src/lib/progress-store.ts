type ProgressMessage = {
  timestamp: string;
  message: string;
  type: "info" | "success" | "error";
};

type ProgressExecution = {
  id: string;
  messages: ProgressMessage[];
  completed: boolean;
  subscribers: Set<(message: ProgressMessage) => void>;
};

class ProgressStore {
  private executions = new Map<string, ProgressExecution>();
  private inputHashToExecutionId = new Map<string, string>();

  create(id: string, inputHash?: string): void {
    this.executions.set(id, {
      id,
      messages: [],
      completed: false,
      subscribers: new Set(),
    });

    // Store input hash mapping if provided
    if (inputHash) {
      this.inputHashToExecutionId.set(inputHash, id);
    }

    // Clean up after 5 minutes
    setTimeout(() => {
      this.executions.delete(id);
      if (inputHash) {
        this.inputHashToExecutionId.delete(inputHash);
      }
    }, 5 * 60 * 1000);
  }

  getExecutionIdByInputHash(inputHash: string): string | null {
    return this.inputHashToExecutionId.get(inputHash) || null;
  }

  update(id: string, message: string, type: "info" | "success" | "error" = "info"): void {
    const execution = this.executions.get(id);
    if (!execution) {
      console.warn(`No execution found for id: ${id}`);
      return;
    }

    const lastMessage = execution.messages[execution.messages.length - 1];

    if (lastMessage && lastMessage.message === message && lastMessage.type === type) {
      return;
    }

    const progressMessage: ProgressMessage = {
      timestamp: new Date().toISOString(),
      message,
      type,
    };

    execution.messages.push(progressMessage);

    // Notify all subscribers
    execution.subscribers.forEach((callback) => callback(progressMessage));
  }

  complete(id: string, success: boolean = true): void {
    const execution = this.executions.get(id);
    if (!execution) {
      return;
    }

    execution.completed = true;
    
    const lastMessage = execution.messages[execution.messages.length - 1];
    const completionMessage: ProgressMessage = {
      timestamp: new Date().toISOString(),
      message: success ? "Completed successfully" : "Completed with errors",
      type: success ? "success" : "error",
    };

    if (lastMessage && lastMessage.message === completionMessage.message && lastMessage.type === completionMessage.type) {
      return;
    }

    execution.messages.push(completionMessage);

    // Notify all subscribers
    execution.subscribers.forEach((callback) => callback(completionMessage));
  }

  subscribe(id: string, callback: (message: ProgressMessage) => void, sendExisting: boolean = true): () => void {
    const execution = this.executions.get(id);
    if (!execution) {
      console.warn(`No execution found for id: ${id}`);
      return () => {};
    }

    execution.subscribers.add(callback);

    // Send all existing messages to the new subscriber only if requested
    if (sendExisting) {
      execution.messages.forEach((msg) => callback(msg));
    }

    // Return unsubscribe function
    return () => {
      execution.subscribers.delete(callback);
    };
  }

  getMessages(id: string): ProgressMessage[] {
    const execution = this.executions.get(id);
    return execution?.messages || [];
  }

  isCompleted(id: string): boolean {
    const execution = this.executions.get(id);
    return execution?.completed || false;
  }

  exists(id: string): boolean {
    return this.executions.has(id);
  }
}

// Export singleton instance
export const progressStore = new ProgressStore();
export type { ProgressMessage };

