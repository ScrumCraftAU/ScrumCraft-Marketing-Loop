"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/env";
import { runLoop } from "@/lib/loop/run";
import type { ExperimentStatus } from "@/lib/types";

export async function runLoopNow() {
  if (!isSupabaseConfigured()) return { ok: false as const, error: "Supabase is not configured yet" };
  const result = await runLoop({ trigger: "manual", triggeredBy: "dashboard" });
  revalidatePath("/", "layout");
  return result;
}

const Status = z.enum(["proposed", "approved", "running", "checking", "adopted", "adapted", "abandoned", "rejected"]);

export async function setExperimentStatus(id: string, status: ExperimentStatus) {
  const next = Status.parse(status);
  const patch: Record<string, unknown> = { status: next };
  if (next === "running") patch.start_date = new Date().toISOString().slice(0, 10);
  const { error } = await db().from("experiments").update(patch).eq("id", z.uuid().parse(id));
  if (error) return { ok: false as const, error: error.message };
  revalidatePath("/experiments");
  return { ok: true as const };
}
