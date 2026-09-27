import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SnackbarProvider, useSnackbar } from "./Snackbar";

function Controls() {
  const { notify, dismiss, clear } = useSnackbar();
  return (
    <>
      <button onClick={() => notify({ id: "saved", tone: "success", title: "Saved", message: "Your change is ready." })}>Notify success</button>
      <button onClick={() => notify({ id: "failure", tone: "error", title: "Try again", message: "Check your connection and retry." })}>Notify error</button>
      <button onClick={() => notify({ id: "info", tone: "info", message: "Repository selected." })}>Notify info</button>
      <button onClick={() => notify({ id: "second", tone: "success", message: "Another change is ready." })}>Notify another</button>
      <button onClick={() => dismiss("failure")}>Clear failure</button>
      <button onClick={clear}>Clear notifications</button>
    </>
  );
}

function mount() {
  return render(<SnackbarProvider><Controls /></SnackbarProvider>);
}

describe("Snackbar feedback", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => { cleanup(); vi.useRealTimers(); });

  it("deduplicates stable IDs and supports manual dismissal", () => {
    mount();
    fireEvent.click(screen.getByRole("button", { name: "Notify success" }));
    fireEvent.click(screen.getByRole("button", { name: "Notify success" }));
    expect(screen.getAllByRole("status")).toHaveLength(1);
    expect(screen.getByText("Your change is ready.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Dismiss Saved" }));
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("keeps errors available until they are dismissed or cleared after retry", () => {
    mount();
    fireEvent.click(screen.getByRole("button", { name: "Notify error" }));
    act(() => vi.advanceTimersByTime(60_000));
    expect(screen.getByRole("alert").textContent).toContain("Check your connection and retry.");
    fireEvent.click(screen.getByRole("button", { name: "Clear failure" }));
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("pauses success dismissal while hovered and resumes the remaining time", () => {
    mount();
    fireEvent.click(screen.getByRole("button", { name: "Notify success" }));
    act(() => vi.advanceTimersByTime(2_000));
    fireEvent.mouseEnter(screen.getByRole("status"));
    act(() => vi.advanceTimersByTime(20_000));
    expect(screen.getByRole("status")).toBeTruthy();
    fireEvent.mouseLeave(screen.getByRole("status"));
    act(() => vi.advanceTimersByTime(3_999));
    expect(screen.getByRole("status")).toBeTruthy();
    act(() => vi.advanceTimersByTime(1));
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("pauses automatic dismissal while the dismiss control has keyboard focus", () => {
    mount();
    fireEvent.click(screen.getByRole("button", { name: "Notify info" }));
    const dismiss = screen.getByRole("button", { name: "Dismiss notification" });
    fireEvent.focus(dismiss);
    act(() => vi.advanceTimersByTime(20_000));
    expect(screen.getByRole("status")).toBeTruthy();
    fireEvent.blur(dismiss, { relatedTarget: document.body });
    act(() => vi.advanceTimersByTime(6_000));
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("bounds visible notifications while preserving errors ahead of transient messages", () => {
    mount();
    for (const name of ["Notify success", "Notify error", "Notify info", "Notify another"]) {
      fireEvent.click(screen.getByRole("button", { name }));
    }
    expect(screen.getAllByRole("status")).toHaveLength(2);
    expect(screen.getAllByRole("alert")).toHaveLength(1);
    expect(screen.queryByText("Your change is ready.")).toBeNull();
    expect(screen.getByText("Another change is ready.")).toBeTruthy();
  });

  it("clears account feedback and allows future notifications with fresh dismissal timers", () => {
    mount();
    fireEvent.click(screen.getByRole("button", { name: "Notify success" }));
    fireEvent.click(screen.getByRole("button", { name: "Notify error" }));
    act(() => vi.advanceTimersByTime(2_000));
    fireEvent.click(screen.getByRole("button", { name: "Clear notifications" }));
    expect(screen.queryByRole("status")).toBeNull();
    expect(screen.queryByRole("alert")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Notify success" }));
    act(() => vi.advanceTimersByTime(5_999));
    expect(screen.getByRole("status").textContent).toContain("Your change is ready.");
    expect(screen.queryByRole("alert")).toBeNull();
    act(() => vi.advanceTimersByTime(1));
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("lets isolated components use a stable no-op API outside a provider", () => {
    render(<Controls />);
    fireEvent.click(screen.getByRole("button", { name: "Notify error" }));
    fireEvent.click(screen.getByRole("button", { name: "Clear failure" }));
    fireEvent.click(screen.getByRole("button", { name: "Clear notifications" }));
    expect(screen.queryByRole("alert")).toBeNull();
  });
});
