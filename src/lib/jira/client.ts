import "server-only";
import { env, isJiraConfigured } from "@/lib/env";
import type { Experiment } from "@/lib/types";

/** Where approved experiments become stories: SC Marketing, under the Marketing Loop epic. */
const PROJECT_KEY = "SCM";
const PARENT_EPIC = "SCM-123";
const LABEL = "ml-experiment";
/** SCM requires Strategic Horizon on create; "H1 70%" is the project default. */
const STRATEGIC_HORIZON = { customfield_10076: { id: "10050" } };

export interface JiraStatus {
  key: string;
  name: string;
  category: string;
}

async function jira<T>(path: string, init: RequestInit = {}): Promise<T> {
  if (!isJiraConfigured()) throw new Error("Jira is not configured (JIRA_EMAIL / JIRA_API_TOKEN or the Confluence equivalents)");
  const auth = Buffer.from(`${env.jiraEmail}:${env.jiraApiToken}`).toString("base64");
  const res = await fetch(`${env.jiraBaseUrl}/rest/api/3${path}`, {
    ...init,
    headers: { Authorization: `Basic ${auth}`, Accept: "application/json", "Content-Type": "application/json", ...init.headers },
    cache: "no-store",
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`Jira ${res.status} on ${path}: ${(await res.text()).slice(0, 300)}`);
  return (res.status === 204 ? undefined : await res.json()) as T;
}

/** Current status of each linked item. Missing or unreadable items are left out. */
export async function getStatuses(keys: string[]): Promise<Map<string, JiraStatus>> {
  const results = await Promise.allSettled(
    keys.map(async (key) => {
      const issue = await jira<{ key: string; fields: { status: { name: string; statusCategory: { key: string } } } }>(
        `/issue/${encodeURIComponent(key)}?fields=status`,
      );
      return { key: issue.key, name: issue.fields.status.name, category: issue.fields.status.statusCategory.key };
    }),
  );
  return new Map(results.flatMap((r) => (r.status === "fulfilled" ? [[r.value.key, r.value] as const] : [])));
}

const paragraph = (label: string, text: string) => ({
  type: "paragraph",
  content: [
    { type: "text", text: `${label}: `, marks: [{ type: "strong" }] },
    { type: "text", text },
  ],
});

/** Creates the Jira story for an approved experiment and returns its key. */
export async function createExperimentStory(e: Experiment, boardUrl: string): Promise<string> {
  const lines = [
    paragraph("Hypothesis", e.hypothesis),
    ...(e.action ? [paragraph("Do", e.action)] : []),
    paragraph(
      "Measure",
      `${e.target_metric_key ?? "no metric"}${e.expected_change_pct !== null ? `, target ${e.expected_change_pct > 0 ? "+" : ""}${e.expected_change_pct}%` : ""}${e.check_date ? `, check ${e.check_date}` : ""}`,
    ),
    {
      type: "paragraph",
      content: [
        { type: "text", text: "Marketing Loop experiment. Moving this item moves the experiment on the " },
        { type: "text", text: "Experiments board", marks: [{ type: "link", attrs: { href: boardUrl } }] },
        { type: "text", text: " (and vice versa)." },
      ],
    },
  ];
  const created = await jira<{ key: string }>("/issue", {
    method: "POST",
    body: JSON.stringify({
      fields: {
        project: { key: PROJECT_KEY },
        issuetype: { name: "Story" },
        parent: { key: PARENT_EPIC },
        summary: `Experiment: ${e.title}`.slice(0, 250),
        labels: [LABEL],
        description: { type: "doc", version: 1, content: lines },
        ...STRATEGIC_HORIZON,
      },
    }),
  });
  return created.key;
}

/** Moves the item to the first available target status. Returns the status it ends in. */
export async function transitionTo(key: string, targets: string[]): Promise<string | null> {
  if (!targets.length) return null;
  const wanted = targets.map((t) => t.toLowerCase());
  const current = (await getStatuses([key])).get(key);
  if (current && wanted.includes(current.name.toLowerCase())) return current.name;

  const { transitions } = await jira<{ transitions: { id: string; to: { name: string } }[] }>(
    `/issue/${encodeURIComponent(key)}/transitions`,
  );
  const match = wanted.map((w) => transitions.find((t) => t.to.name.toLowerCase() === w)).find(Boolean);
  if (!match) {
    throw new Error(`${key} can't move to ${targets.join(" / ")} from ${current?.name ?? "its current status"} in Jira`);
  }
  await jira(`/issue/${encodeURIComponent(key)}/transitions`, {
    method: "POST",
    body: JSON.stringify({ transition: { id: match.id } }),
  });
  return match.to.name;
}

export const jiraIssueUrl = (key: string) => `${env.jiraBaseUrl}/browse/${key}`;
