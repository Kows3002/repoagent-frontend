import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import App from "./App";
import { setSessionCsrfToken } from "./lib/auth";
const USER={id:1,github_id:100,username:"octocat",avatar_url:null};
const REPO={id:21,full_name:"octocat/project",clone_url:"https://github.com/octocat/project.git",private:true,default_branch:"main",description:"A test project",language:"TypeScript"};
const TASK='Modify ONLY src/App.tsx. Replace "Old title" with "New title".';
const DIFF='diff --git a/src/App.tsx b/src/App.tsx\n--- a/src/App.tsx\n+++ b/src/App.tsx\n@@ -1 +1 @@\n-Old title\n+New title';
let signedIn=true;
let jobFetch=vi.fn();
function response(data:unknown,status=200){return new Response(JSON.stringify(data),{status,headers:{"Content-Type":"application/json"}});}
const completed={id:42,status:"completed",diff:DIFF,ai_result:"Target file located."};
async function mount(){
 // Let session and repository requests finish before interacting with the form.
 // Keep React's scheduler on real timers during this initialization.
 render(<App/>);
 if(signedIn){
  await screen.findByRole("button",{name:/GitHub repository.*Choose a repository/i},{timeout:10000});
 }else{
  await screen.findByRole("link",{name:/Continue with GitHub/},{timeout:10000});
 }
}
async function fill(){
 fireEvent.click(screen.getByRole("button",{name:/GitHub repository.*Choose a repository/i}));
 fireEvent.click(screen.getByRole("button",{name:/octocat\/project/i}));
 fireEvent.change(screen.getByLabelText("Describe the code change"),{target:{value:TASK}});
}
async function generate(){await act(async()=>{fireEvent.click(screen.getByRole("button",{name:"Generate Code Change"}));});}
describe("RepoAgent signed-in workflow",()=>{
 beforeEach(()=>{
  vi.useRealTimers();signedIn=true;setSessionCsrfToken(null);
  window.history.replaceState({},"","/");
  jobFetch=vi.fn().mockRejectedValue(new TypeError("Unexpected request"));
  vi.stubGlobal("fetch",vi.fn(async(url:string,options?:RequestInit)=>{
   if(url==="/auth/session")return response({authenticated:signedIn,configured:true,user:signedIn?{...USER,login:USER.username,name:"Octocat"}:null,csrf_token:signedIn?"test-csrf":undefined});
   if(url.startsWith("/auth/repositories"))return response({repositories:[REPO],has_more:false,next_page:null});
   if(url==="/auth/logout"){signedIn=false;return new Response(null,{status:204});}
   if(url.endsWith("/preview"))return response({status:"unsupported",message:"This fixture has no visual app."});
   return jobFetch(url,options);
  }));
 });
 afterEach(()=>{cleanup();if(vi.isFakeTimers())vi.clearAllTimers();vi.useRealTimers();vi.restoreAllMocks();vi.unstubAllGlobals();setSessionCsrfToken(null);});
 it("shows the GitHub account and repository picker without a token field",async()=>{
  await mount();
  expect(screen.getAllByText(USER.username).length).toBeGreaterThan(0);
  expect(document.querySelector('input[type="password"]')).toBeNull();
  expect(screen.queryByLabelText("GitHub Personal Access Token")).toBeNull();
  expect((screen.getByRole("button",{name:"Generate Code Change"}) as HTMLButtonElement).disabled).toBe(true);
  expect(screen.getByRole("heading",{name:"See the change. Before you ship."})).toBeTruthy();
 });
 it("offers GitHub sign-in and prevents generating while signed out",async()=>{
  signedIn=false;await mount();
  expect(screen.getByRole("link",{name:/Continue with GitHub/}).getAttribute("href")).toBe("/auth/github/login");
  expect((screen.getByRole("button",{name:"Generate Code Change"}) as HTMLButtonElement).disabled).toBe(true);
  expect(jobFetch).not.toHaveBeenCalled();
 });
 it("sends only selected repository and task with session credentials and CSRF",async()=>{
  jobFetch.mockResolvedValue(response({id:42,status:"queued"}));
  await mount();await fill();await generate();
  const [path,options]=jobFetch.mock.calls[0];
  expect(path).toBe("/jobs/");
  expect(JSON.parse(options.body)).toEqual({repo_url:REPO.clone_url,task:TASK});
  expect(options.credentials).toBe("include");
  expect(new Headers(options.headers).get("X-CSRF-Token")).toBe("test-csrf");
  expect(JSON.stringify(options)).not.toContain("github_token");
 });
 it("polls real stages, reveals the diff, and pushes only after explicit approval",async()=>{
  jobFetch.mockResolvedValueOnce(response({id:42,status:"queued"})).mockResolvedValueOnce(response({id:42,status:"analyzing"})).mockResolvedValueOnce(response({id:42,status:"generating"})).mockResolvedValueOnce(response(completed)).mockResolvedValueOnce(response({message:"Changes pushed successfully"}));
  await mount();await fill();
  vi.useFakeTimers({toFake:["setTimeout","clearTimeout"]});
  await generate();
  expect(screen.queryByRole("button",{name:"Approve & Push to GitHub"})).toBeNull();
  await act(async()=>{await vi.advanceTimersByTimeAsync(7500);});
  expect(screen.getByRole("table",{name:"Unified diff for src/App.tsx"})).toBeTruthy();
  expect(jobFetch).toHaveBeenCalledTimes(4);
  await act(async()=>{fireEvent.click(screen.getByRole("button",{name:"Approve & Push to GitHub"}));});
  expect(jobFetch.mock.calls[4][0]).toBe("/jobs/42/approve");
  expect(screen.getByRole("heading",{name:"Changes pushed successfully"})).toBeTruthy();
  await act(async()=>{await vi.advanceTimersByTimeAsync(10000);});
  expect(jobFetch).toHaveBeenCalledTimes(5);
 });
 it("shows safe push errors and leaves the reviewed diff available",async()=>{
  jobFetch.mockResolvedValueOnce(response(completed)).mockResolvedValueOnce(response({detail:"Permission denied: secret-token"},403));
  await mount();await fill();await generate();
  await act(async()=>{fireEvent.click(screen.getByRole("button",{name:"Approve & Push to GitHub"}));});
  expect(document.body.textContent).not.toContain("secret-token");
  expect(screen.getByRole("table",{name:"Unified diff for src/App.tsx"})).toBeTruthy();
  expect(screen.queryByRole("heading",{name:"Changes pushed successfully"})).toBeNull();
 });
 it("never reports an unconfirmed or empty push as success",async()=>{
  jobFetch.mockResolvedValueOnce(response(completed)).mockResolvedValueOnce(response({message:"Nothing to commit"}));
  await mount();await fill();await generate();
  await act(async()=>{fireEvent.click(screen.getByRole("button",{name:"Approve & Push to GitHub"}));});
  expect(screen.getByRole("heading",{name:"Nothing changed"})).toBeTruthy();
  expect(screen.queryByRole("heading",{name:"Changes pushed successfully"})).toBeNull();
 });
 it("shows failed jobs without displaying raw backend output",async()=>{
  jobFetch.mockResolvedValue(response({id:42,status:"failed",ai_result:"ERROR secret-token: file not found"}));
  await mount();await fill();await generate();
  expect(screen.getByRole("heading",{name:"AI couldn't locate the file"})).toBeTruthy();
  expect(document.body.textContent).not.toContain("secret-token");
  expect((screen.getByRole("button",{name:"Generate Code Change"}) as HTMLButtonElement).disabled).toBe(false);
 });
 it("handles empty diffs and never offers approval",async()=>{
  jobFetch.mockResolvedValue(response({...completed,diff:""}));
  await mount();await fill();await generate();
  expect(screen.getByRole("heading",{name:"Nothing changed"})).toBeTruthy();
  expect(screen.queryByRole("button",{name:"Approve & Push to GitHub"})).toBeNull();
 });
 it("handles permanent polling failure without locking the form",async()=>{
  jobFetch.mockResolvedValueOnce(response({id:42,status:"queued"})).mockResolvedValueOnce(response({detail:"Job not found"},404));
  await mount();await fill();
  vi.useFakeTimers({toFake:["setTimeout","clearTimeout"]});
  await generate();
  await act(async()=>{await vi.advanceTimersByTimeAsync(2500);});
  expect(screen.getByRole("heading",{name:"Job is no longer available"})).toBeTruthy();
  expect((screen.getByRole("button",{name:"Generate Code Change"}) as HTMLButtonElement).disabled).toBe(false);
 });
 it("clears the job and previews after signing out",async()=>{
  jobFetch.mockResolvedValue(response(completed));
  await mount();await fill();await generate();
  await act(async()=>{fireEvent.click(screen.getByRole("button",{name:"Sign out"}));});
  expect(screen.getByRole("link",{name:/Continue with GitHub/})).toBeTruthy();
  expect(screen.queryByRole("button",{name:"Approve & Push to GitHub"})).toBeNull();
 });
 it("keeps workflow help accessible with GitHub sign-in instructions",async()=>{
  HTMLDialogElement.prototype.showModal=vi.fn(function(this:HTMLDialogElement){this.open=true;});
  HTMLDialogElement.prototype.close=vi.fn(function(this:HTMLDialogElement){this.open=false;});
  await mount();fireEvent.click(screen.getByRole("button",{name:"How it works"}));
  const dialog=screen.getByRole("dialog");
  expect(within(dialog).getByText(/GitHub/i)).toBeTruthy();
  fireEvent.click(within(dialog).getByRole("button",{name:"Close dialog"}));
  expect(screen.queryByRole("dialog")).toBeNull();
 });
});
