import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import RepoForm from "./RepoForm";

const repository = { id: 1, full_name: "octocat/project", clone_url: "https://github.com/octocat/project.git", default_branch: "main", private: true, description: "A focused project", language: "TypeScript" };
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status });
const access = { configured: true, installation_url: "https://github.com/apps/repoagent-test/installations/new", manage_url: "https://github.com/settings/installations", installations: [{ id: 12, account: "octocat", repository_selection: "selected", manage_url: "https://github.com/settings/installations/12" }] };
const page = (repositories = [repository], next_page: number | null = null) => ({ repositories, has_more: next_page !== null, next_page, access });

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

  it("sends repository selection to GitHub before showing a picker", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(json({ ...page([]), access: { ...access, installations: [] } })));
    await act(async () => { render(<RepoForm onSubmit={vi.fn()} authenticated accountId={100} busy={false} isSubmitting={false} />); });
    const link = screen.getByRole("link", { name: "Choose repositories on GitHub" });
    expect(link.getAttribute("href")).toBe(access.installation_url);
    expect(link.getAttribute("target")).toBe("_blank");
    expect(link.getAttribute("rel")).toContain("noopener");
    expect(screen.getByText("Only select repositories")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Choose a repository/ })).toBeNull();
    expect((screen.getByRole("button", { name: "Generate Code Change" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("refreshes once after returning from GitHub and clears a removed selection", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(json(page())).mockResolvedValueOnce(json(page([])));
    vi.stubGlobal("fetch", fetchMock);
    await act(async () => { render(<RepoForm onSubmit={vi.fn()} authenticated accountId={100} busy={false} isSubmitting={false} />); });
    fireEvent.click(screen.getByRole("button", { name: /Choose a repository/ }));
    fireEvent.click(screen.getByRole("button", { name: /octocat\/project/ }));
    fireEvent.change(screen.getByLabelText("Describe the code change"), { target: { value: "Update src/App.tsx." } });
    expect((screen.getByRole("button", { name: "Generate Code Change" }) as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(screen.getByRole("link", { name: "Manage access" }));
    await act(async () => {
      fireEvent.focus(window);
      fireEvent(document, new Event("visibilitychange"));
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(screen.getByText(/No writable repositories are connected yet/)).toBeTruthy();
    expect((screen.getByRole("button", { name: "Generate Code Change" }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.queryByRole("button", { name: /octocat\/project/ })).toBeNull();
  });

  it("lets users refresh after adding an installation and loads installation cursors", async () => {
    const second = { ...repository, id: 2, full_name: "team/website", clone_url: "https://github.com/team/website.git" };
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(json({ ...page([]), access: { ...access, installations: [] } }))
      .mockResolvedValueOnce(json({ ...page(), has_more: true, next_cursor: "installation=12&page=2" }))
      .mockResolvedValueOnce(json(page([second])));
    vi.stubGlobal("fetch", fetchMock);
    await act(async () => { render(<RepoForm onSubmit={vi.fn()} authenticated accountId={100} busy={false} isSubmitting={false} />); });
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Refresh access" })); });
    fireEvent.click(screen.getByRole("button", { name: /Choose a repository/ }));
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Load more repositories" })); });
    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual(["/auth/repositories?page=1", "/auth/repositories?page=1", "/auth/repositories?cursor=installation%3D12%26page%3D2"]);
    expect(screen.getByRole("button", { name: /team\/website/ })).toBeTruthy();
  });

  it("does not display broad repository results from an old backend", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(json({ repositories: [repository], has_more: false, next_page: null })));
    await act(async () => { render(<RepoForm onSubmit={vi.fn()} authenticated accountId={100} busy={false} isSubmitting={false} />); });
    expect(screen.getByText("Repository access needs setup")).toBeTruthy();
    expect(screen.getByText(/Deploy the backend update/)).toBeTruthy();
    expect(document.body.textContent).not.toContain("octocat/project");
    expect(screen.queryByRole("button", { name: /Choose a repository/ })).toBeNull();
  });

  it("explains how to restrict an installation that currently allows every repository", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(json({ ...page(), access: { ...access, installations: [{ ...access.installations[0], repository_selection: "all" }] } })));
    await act(async () => { render(<RepoForm onSubmit={vi.fn()} authenticated accountId={100} busy={false} isSubmitting={false} />); });
    expect(screen.getByText(/GitHub currently allows all repositories for octocat/)).toBeTruthy();
    expect(screen.getByText("Only select repositories")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Manage access" }).getAttribute("href")).toBe("https://github.com/settings/installations/12");
  });

  it("locks access controls during a job and ignores unrelated window focus", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(json(page()));
    vi.stubGlobal("fetch", fetchMock);
    await act(async () => { render(<RepoForm onSubmit={vi.fn()} authenticated accountId={100} busy isSubmitting={false} />); });
    fireEvent.click(screen.getByRole("link", { name: "Manage access" }));
    await act(async () => { fireEvent.focus(window); });
    expect((screen.getByRole("button", { name: "Refresh access" }) as HTMLButtonElement).disabled).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
