import { afterEach, expect, it, vi } from "vitest";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.resetModules();
});

it("routes OAuth, jobs, polling, and previews to Render with cookies and CSRF", async () => {
  vi.resetModules();
  vi.stubEnv("VITE_API_URL", "https://repoagent.onrender.com/");
  vi.stubEnv("VITE_API_BASE_URL", "https://old.example");
  const replies = [
    {authenticated:true, configured:true, user:{id:100,login:"octocat"},csrf_token:"test-csrf"},
    {id:42,status:"queued"},
    {id:42,status:"completed",diff:"- before\n+ after"},
    {status:"building"},
    {status:"ready",before_url:"https://before.preview.example/",after_url:"https://after.preview.example/"},
    {message:"Changes pushed successfully"},
  ];
  const fetchMock = vi.fn().mockImplementation(async () => new Response(JSON.stringify(replies.shift()), {status:200,headers:{"Content-Type":"application/json"}}));
  vi.stubGlobal("fetch", fetchMock);
  const auth = await import("./auth");
  const api = await import("./api");
  const preview = await import("./preview");
  const signal = new AbortController().signal;

  expect(api.githubLoginUrl).toBe("https://repoagent.onrender.com/auth/github/login");
  await auth.getGitHubSession(signal);
  await api.createJob({repo_url:"https://github.com/octocat/project.git",task:"Change the title"},signal);
  await api.getJob(42,signal);
  await preview.startPreview(42,signal);
  await preview.fetchPreview(42,signal);
  await api.approveJob(42,signal,"Update the login title");

  expect(fetchMock.mock.calls.map(([url])=>url)).toEqual([
    "https://repoagent.onrender.com/auth/session",
    "https://repoagent.onrender.com/jobs/",
    "https://repoagent.onrender.com/jobs/42",
    "https://repoagent.onrender.com/jobs/42/preview",
    "https://repoagent.onrender.com/jobs/42/preview",
    "https://repoagent.onrender.com/jobs/42/approve",
  ]);
  for (const [,options] of fetchMock.mock.calls) {
    expect(options.credentials).toBe("include");
    if(options.method==="POST") expect(new Headers(options.headers).get("X-CSRF-Token")).toBe("test-csrf");
  }
  expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toEqual({repo_url:"https://github.com/octocat/project.git",task:"Change the title"});
  expect(JSON.parse(fetchMock.mock.calls[5][1].body)).toEqual({commit_message:"Update the login title"});
});
