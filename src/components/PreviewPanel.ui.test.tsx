import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import PreviewPanel from "./PreviewPanel";
import { fetchPreview, startPreview } from "../lib/preview";
vi.mock("../lib/preview", async importOriginal => {
 const actual = await importOriginal<typeof import("../lib/preview")>();
 return {...actual,fetchPreview:vi.fn(),startPreview:vi.fn()};
});
const job={id:42,status:"completed" as const,diff:"-old\n+new",ai_result:null};
const ready={status:"ready" as const,before_url:"http://current.localhost:8000/",after_url:"http://updated.localhost:8000/"};
async function mount(value:typeof job|null=job){await act(async()=>{render(<PreviewPanel job={value}/>);});}
describe("visual preview review",()=>{
 beforeEach(()=>{vi.useFakeTimers();vi.mocked(fetchPreview).mockResolvedValue(ready);vi.mocked(startPreview).mockResolvedValue({status:"building"});});
 afterEach(()=>{cleanup();vi.useRealTimers();vi.clearAllMocks();});
 it("does not fetch or invent rendered previews before a completed job",async()=>{
  await mount(null);
  expect(fetchPreview).not.toHaveBeenCalled();
  expect(screen.getByText("A side-by-side look at what changes")).toBeTruthy();
  expect(document.querySelector("iframe")).toBeNull();
 });
 it("shows isolated current and updated frames with no same-origin or popup privileges",async()=>{
  await mount();
  const before=screen.getByTitle("Current repository UI"),after=screen.getByTitle("Updated repository UI");
  expect(before.getAttribute("src")).toBe(ready.before_url);
  expect(after.getAttribute("src")).toBe(ready.after_url);
  expect(before.getAttribute("sandbox")).toBe("allow-scripts");
  expect(before.getAttribute("referrerpolicy")).toBe("no-referrer");
  fireEvent.click(screen.getByRole("button",{name:"Updated"}));
  expect(screen.queryByTitle("Current repository UI")).toBeNull();
  expect(screen.getByTitle("Updated repository UI")).toBeTruthy();
 });
 it("sends page paths to both versions and refuses external navigation",async()=>{
  await mount();
  fireEvent.change(screen.getByLabelText("Page path"),{target:{value:"/login"}});
  fireEvent.click(screen.getByRole("button",{name:"Open page in both previews"}));
  expect(screen.getByTitle("Current repository UI").getAttribute("src")).toBe(ready.before_url+"login");
  expect(screen.getByTitle("Updated repository UI").getAttribute("src")).toBe(ready.after_url+"login");
  fireEvent.change(screen.getByLabelText("Page path"),{target:{value:"//evil.test"}});
  fireEvent.click(screen.getByRole("button",{name:"Open page in both previews"}));
  expect(screen.getByText("Use a page path such as / or /login.")).toBeTruthy();
  expect(screen.getByTitle("Updated repository UI").getAttribute("src")).toBe(ready.after_url+"login");
 });
 it("builds once and polls until the actual preview pair is ready",async()=>{
  vi.mocked(fetchPreview).mockResolvedValueOnce({status:"idle"}).mockResolvedValueOnce({status:"building"}).mockResolvedValueOnce(ready);
  await mount();
  expect(startPreview).toHaveBeenCalledTimes(1);
  expect(screen.getByText("Preparing both versions of your app")).toBeTruthy();
  await act(async()=>{await vi.advanceTimersByTimeAsync(5000);});
  expect(screen.getByTitle("Updated repository UI")).toBeTruthy();
  await act(async()=>{await vi.advanceTimersByTimeAsync(10000);});
  expect(fetchPreview).toHaveBeenCalledTimes(3);
 });
 it("keeps unsupported projects honest and offers retry",async()=>{
  vi.mocked(fetchPreview).mockResolvedValue({status:"unsupported",message:"This repository has no supported web app."});
  await mount();
  expect(screen.getByText("This repository has no supported web app.")).toBeTruthy();
  expect(document.querySelector("iframe")).toBeNull();
  expect(screen.getByRole("button",{name:"Try preview again"})).toBeTruthy();
 });
});
