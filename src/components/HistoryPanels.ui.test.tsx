import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ActivityEvent, FriendlyError, Job } from "../lib/types";
import ActivityPanel from "./ActivityPanel";
import HistoryPanel from "./HistoryPanel";

const jobs: Job[] = [
  { id: 42, repo_url: "https://github.com/octocat/project.git", task: "Update the login title.", status: "completed", diff: "-old\n+new", ai_result: null, created_at: 1_720_000_000, pushed_at: 1_720_000_005 },
  { id: 43, repo_url: "https://github.com/octocat/website.git", task: "Adjust spacing.", status: "queued", diff: null, ai_result: null, created_at: 1_720_000_100 },
];
const error: FriendlyError = {
  kind: "service-unavailable", title: "Connection interrupted",
  message: "Check your connection and try again.", retryable: true,
};

afterEach(cleanup);

describe("Saved job history", () => {
  it("opens a selected job and distinguishes pushed changes from waiting jobs", () => {
    const onSelect = vi.fn();
    render(<HistoryPanel jobs={jobs} selectedId="42" loading={false} error={null} onSelect={onSelect} onRefresh={vi.fn()} />);
    const selected = screen.getByRole("button", { name: "Open job 42: octocat/project" });
    expect(selected.getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByText("Pushed")).toBeTruthy();
    expect(screen.getByText("Queued")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Open job 43: octocat/website" }));
    expect(onSelect).toHaveBeenCalledExactlyOnceWith(jobs[1]);
    expect(document.querySelector("time")?.getAttribute("datetime")).toBe(new Date(1_720_000_000_000).toISOString());
  });

  it("disables navigation and refresh during a protected operation", () => {
    const onSelect = vi.fn(), onRefresh = vi.fn();
    render(<HistoryPanel jobs={jobs} loading={false} error={null} onSelect={onSelect} onRefresh={onRefresh} disabled />);
    fireEvent.click(screen.getByRole("button", { name: "Open job 42: octocat/project" }));
    fireEvent.click(screen.getByRole("button", { name: "Refresh job history" }));
    expect(onSelect).not.toHaveBeenCalled();
    expect(onRefresh).not.toHaveBeenCalled();
  });

  it("provides separate loading, empty, and retry states", () => {
    const onRefresh = vi.fn();
    const props = { jobs: [], error: null, onSelect: vi.fn(), onRefresh };
    const { rerender } = render(<HistoryPanel {...props} loading />);
    expect(screen.getByRole("status").textContent).toContain("Loading your jobs");
    expect(screen.queryByText("Your work starts here.")).toBeNull();
    rerender(<HistoryPanel {...props} loading={false} />);
    expect(screen.getByText("Your work starts here.")).toBeTruthy();
    rerender(<HistoryPanel {...props} loading={false} error={error} />);
    fireEvent.click(screen.getByRole("button", { name: "Retry job history" }));
    expect(onRefresh).toHaveBeenCalledOnce();
    expect(screen.queryByText("Your work starts here.")).toBeNull();
  });

  it("handles older job records without timestamps", () => {
    render(<HistoryPanel jobs={[{ ...jobs[0], created_at: undefined }]} loading={false} error={null} onSelect={vi.fn()} onRefresh={vi.fn()} />);
    expect(screen.getByText("Date unavailable")).toBeTruthy();
  });
});

describe("Account activity", () => {
  it("shows saved account events and timestamps", () => {
    const activity: ActivityEvent[] = [
      { id: 1, kind: "login", message: "Signed in with GitHub.", job_id: null, created_at: 1_720_000_000 },
      { id: 2, kind: "job_pushed", message: "Changes pushed successfully.", job_id: 42, created_at: 1_720_000_100 },
    ];
    const onRefresh = vi.fn();
    render(<ActivityPanel activity={activity} loading={false} error={null} onRefresh={onRefresh} />);
    expect(screen.getByText("Signed in")).toBeTruthy();
    expect(screen.getByText("Pushed to GitHub")).toBeTruthy();
    expect(screen.getByText("Job #42")).toBeTruthy();
    expect(document.querySelectorAll("time")).toHaveLength(2);
    fireEvent.click(screen.getByRole("button", { name: "Refresh account activity" }));
    expect(onRefresh).toHaveBeenCalledOnce();
  });

  it("handles unknown event kinds without interpreting event content as markup", () => {
    render(<ActivityPanel activity={[{
      id: 1, kind: "constructor", message: "<strong>Plain text update</strong>", job_id: null, created_at: 1_720_000_000,
    }]} loading={false} error={null} onRefresh={vi.fn()} />);
    expect(screen.getByText("Account update")).toBeTruthy();
    expect(screen.getByText("<strong>Plain text update</strong>").tagName).toBe("P");
  });

  it("shows friendly retry feedback when activity cannot be loaded", () => {
    const onRefresh = vi.fn();
    render(<ActivityPanel activity={[]} loading={false} error={error} onRefresh={onRefresh} />);
    fireEvent.click(screen.getByRole("button", { name: "Retry account activity" }));
    expect(onRefresh).toHaveBeenCalledOnce();
    expect(screen.queryByText("No activity yet.")).toBeNull();
  });
});
