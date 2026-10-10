import { test } from "node:test";
import assert from "node:assert/strict";
import { columnOf, experimentStatusForJira, jiraTargetsFor, syncedStatus } from "./status.ts";

test("Jira statuses map to experiment columns", () => {
  assert.equal(experimentStatusForJira("Backlog", "new"), "approved");
  assert.equal(experimentStatusForJira("Ready To Do", "new"), "approved");
  assert.equal(experimentStatusForJira("Planning", "new"), "running"); // left To Do
  assert.equal(experimentStatusForJira("In Progress", "indeterminate"), "running");
  assert.equal(experimentStatusForJira("In Review", "indeterminate"), "checking");
  assert.equal(experimentStatusForJira("Done", "done"), "checking"); // build finished → measure
  assert.equal(experimentStatusForJira("Close", "done"), "abandoned");
});

test("sync only moves an experiment when the Jira column differs", () => {
  assert.equal(syncedStatus("approved", "In Progress", "indeterminate"), "running");
  assert.equal(syncedStatus("running", "In Review", "indeterminate"), "checking");
  assert.equal(syncedStatus("running", "Done", "done"), "checking");
  assert.equal(syncedStatus("checking", "Done", "done"), null);
  // decided experiments stay decided when the build is Done
  assert.equal(syncedStatus("adopted", "Done", "done"), null);
  assert.equal(syncedStatus("done", "Done", "done"), null);
  assert.equal(syncedStatus("checking", "Close", "done"), "abandoned");
  assert.equal(syncedStatus("running", "Planning", "new"), null);
  // reopened in Jira → back to Plan
  assert.equal(syncedStatus("done", "Ready To Do", "new"), "approved");
});

test("board moves map to Jira targets", () => {
  assert.deepEqual(jiraTargetsFor("running"), ["In Progress"]);
  assert.deepEqual(jiraTargetsFor("checking"), ["In Review"]);
  assert.deepEqual(jiraTargetsFor("adapted"), ["Done"]);
  assert.equal(jiraTargetsFor("abandoned")[0], "Close");
  assert.deepEqual(jiraTargetsFor("approved"), []);
  assert.equal(columnOf("rejected"), null);
});
