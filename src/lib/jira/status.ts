/**
 * How Experiments board columns line up with the SCM Jira workflow (board "SCM Master Data":
 * To Do → Plan → Do → Check → Done). Kept dependency-free so it can be unit-tested.
 *
 *   Jira status                     Experiment column
 *   Backlog, Ready To Do (To Do)    Plan   (approved)
 *   Planning, In Progress           Do     (running)   — anything that has left To Do
 *   In Review                       Check  (checking)
 *   Done                            Act    (done)
 *   Close (Won't Do)                Act    (abandoned)
 */
import type { ExperimentStatus } from "../types.ts";

export type Column = "plan" | "do" | "check" | "act";

/** Work-in-progress limit for each of the Plan, Do and Check columns. */
export const WIP_LIMIT = 3;

export function columnOf(status: ExperimentStatus): Column | null {
  switch (status) {
    case "proposed":
    case "approved":
      return "plan";
    case "running":
      return "do";
    case "checking":
      return "check";
    case "done":
    case "adopted":
    case "adapted":
    case "abandoned":
      return "act";
    default:
      return null; // rejected
  }
}

const TO_DO = new Set(["backlog", "ready to do", "to do", "open"]);
const CHECK = new Set(["in review", "check"]);
const WONT_DO = new Set(["close", "closed", "won't do", "wont do", "cancelled", "canceled"]);

/** The experiment status a Jira status implies. `category` is Jira's statusCategory.key. */
export function experimentStatusForJira(statusName: string, category: string): ExperimentStatus {
  const name = statusName.trim().toLowerCase();
  if (WONT_DO.has(name)) return "abandoned";
  if (CHECK.has(name)) return "checking";
  if (category === "done") return "done";
  if (TO_DO.has(name)) return "approved";
  // Planning, In Progress or any other in-flight status: the item has left To Do.
  return category === "new" && !name.includes("plan") ? "approved" : "running";
}

/**
 * The status to apply when Jira reports `jira`: only when it implies a different column,
 * so finer-grained board decisions (adopted vs adapted vs done) are never overwritten.
 */
export function syncedStatus(current: ExperimentStatus, statusName: string, category: string): ExperimentStatus | null {
  const implied = experimentStatusForJira(statusName, category);
  return columnOf(implied) === columnOf(current) ? null : implied;
}

/** Jira status names to move an item to when the experiment moves (first available wins). */
export function jiraTargetsFor(status: ExperimentStatus): string[] {
  switch (status) {
    case "running":
      return ["In Progress"];
    case "checking":
      return ["In Review"];
    case "done":
    case "adopted":
    case "adapted":
      return ["Done"];
    case "abandoned":
    case "rejected":
      return ["Close", "Closed", "Won't Do"];
    default:
      return [];
  }
}
