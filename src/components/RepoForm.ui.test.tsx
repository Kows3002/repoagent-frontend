import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import RepoForm from "./RepoForm";

const repository = { id: 1, full_name: "octocat/project", clone_url: "https://github.com/octocat/project.git", default_branch: "main", private: true, description: "A focused project", language: "TypeScript" };
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status });
const page = (repositories = [repository], next_page: number | null = null) => ({ repositories, has_more: next_page !== null, next_page });

describe("connected repository form", () => {
  afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

  it("requires a selected repository and a task, then submits without a token", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(json(page())));
    const submit = vi.fn().mockResolvedValue(true);
    await act(async () => { render(<RepoForm onSubmit={submit} authenticated accountId={100} busy={false} isSubmitting={false} />); });
    const generate = screen.getByRole("button", { name: "Generate Code Change" }) as HTMLButtonElement;
    expect(generate.disabled).toBe(true);
    expect(screen.queryByLabelText(/Personal Access Token/)).toBeNull();
    expect(screen.queryByLabelText(/Repository URL/)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /Choose a repository/ }));
    fireEvent.click(screen.getByRole("button", { name: /octocat\/project/ }));
    expect(screen.getByText("Private")).toBeTruthy();
    expect(screen.getByText("main")).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Describe the code change"), { target: { value: "  Update src/App.tsx title.  " } });
    expect(generate.disabled).toBe(false);
    await act(async () => { fireEvent.click(generate); });
    expect(submit).toHaveBeenCalledWith({ repo_url: repository.clone_url, task: "Update src/App.tsx title." });
  });

  it("searches loaded repositories and loads additional account pages", async () => {
    const second = { ...repository, id: 2, full_name: "octocat/design-system", clone_url: "https://github.com/octocat/design-system.git", private: false };
    const fetchMock = vi.fn().mockResolvedValueOnce(json(page([repository], 2))).mockResolvedValueOnce(json(page([second])));
    vi.stubGlobal("fetch", fetchMock);
    await act(async () => { render(<RepoForm onSubmit={vi.fn()} authenticated accountId={100} busy={false} isSubmitting={false} />); });
    fireEvent.click(screen.getByRole("button", { name: /Choose a repository/ }));
    fireEvent.change(screen.getByLabelText("Search repositories"), { target: { value: "design" } });
    expect(screen.getByText("No matching repositories in the loaded list.")).toBeTruthy();
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Load more repositories" })); });
    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual(["/auth/repositories?page=1", "/auth/repositories?page=2"]);
    expect(screen.getByRole("button", { name: /octocat\/design-system/ })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /octocat\/project/ })).toBeNull();
    fireEvent.keyDown(screen.getByLabelText("Search repositories"), { key: "Escape" });
    expect(screen.queryByRole("region", { name: "Repository picker" })).toBeNull();
  });

  it("renders a safe expired-session error from repository loading", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(json({ detail: "Not authenticated internal-secret" }, 401)));
    await act(async () => { render(<RepoForm onSubmit={vi.fn()} authenticated accountId={100} busy={false} isSubmitting={false} />); });
    expect(within(screen.getByRole("alert")).getByText("Sign in to continue")).toBeTruthy();
    expect(document.body.textContent).not.toContain("internal-secret");
    expect((screen.getByRole("button", { name: "Generate Code Change" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("allows task drafting while signed out and never fetches repositories", () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    render(<RepoForm onSubmit={vi.fn()} authenticated={false} busy={false} isSubmitting={false} />);
    fireEvent.change(screen.getByLabelText("Describe the code change"), { target: { value: "Draft my change." } });
    expect((screen.getByLabelText("Describe the code change") as HTMLTextAreaElement).value).toBe("Draft my change.");
    expect((screen.getByRole("button", { name: "Generate Code Change" }) as HTMLButtonElement).disabled).toBe(true);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("clears the selected repository when the connected account changes", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(json(page())).mockResolvedValueOnce(json(page([]))));
    const submit = vi.fn();
    let view!: ReturnType<typeof render>;
    await act(async () => { view = render(<RepoForm onSubmit={submit} authenticated accountId={100} busy={false} isSubmitting={false} />); });
    fireEvent.click(screen.getByRole("button", { name: /Choose a repository/ }));
    fireEvent.click(screen.getByRole("button", { name: /octocat\/project/ }));
    fireEvent.change(screen.getByLabelText("Describe the code change"), { target: { value: "Update my title." } });
    await act(async () => { view.rerender(<RepoForm onSubmit={submit} authenticated accountId={200} busy={false} isSubmitting={false} />); });
    expect(screen.getByRole("button", { name: /Choose a repository/ })).toBeTruthy();
    expect((screen.getByRole("button", { name: "Generate Code Change" }) as HTMLButtonElement).disabled).toBe(true);
  });
});
