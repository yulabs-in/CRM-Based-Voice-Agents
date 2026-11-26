import { act } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it, vi } from "vitest";
import { Users } from "lucide-react";
import { EmptyState } from "@/components/app/EmptyState";
import { ErrorState } from "@/components/app/ErrorState";
import { CardSkeleton, TableSkeleton } from "@/components/app/TableSkeleton";

function renderInDom(ui: React.ReactElement) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => {
    root.render(ui);
  });
  return {
    container,
    cleanup: () => {
      act(() => root.unmount());
      container.remove();
    },
  };
}

describe("UI state components", () => {
  it("renders EmptyState with title, description, and primary action", () => {
    const onAction = vi.fn();
    const { container, cleanup } = renderInDom(
      <EmptyState
        icon={Users}
        title="No contacts yet"
        description="Add your first contact to start calling."
        actionLabel="New contact"
        onAction={onAction}
      />
    );

    expect(container.textContent).toContain("No contacts yet");
    expect(container.textContent).toContain("Add your first contact to start calling.");
    const btn = container.querySelector("button");
    expect(btn?.textContent).toContain("New contact");
    act(() => {
      btn?.click();
    });
    expect(onAction).toHaveBeenCalledTimes(1);
    cleanup();
  });

  it("renders ErrorState with friendly network message and Retry button", () => {
    const onRetry = vi.fn();
    const { container, cleanup } = renderInDom(
      <ErrorState error={new Error("Failed to fetch")} onRetry={onRetry} />
    );

    const alert = container.querySelector('[role="alert"]');
    expect(alert).not.toBeNull();
    expect(container.textContent).toContain("Could not reach the server. Check your connection and try again.");
    const btn = container.querySelector("button");
    expect(btn?.textContent).toContain("Try again");
    act(() => {
      btn?.click();
    });
    expect(onRetry).toHaveBeenCalledTimes(1);
    cleanup();
  });

  it("renders TableSkeleton and CardSkeleton with busy attributes", () => {
    const { container, cleanup } = renderInDom(
      <div>
        <TableSkeleton rows={3} columns={2} />
        <CardSkeleton count={2} />
      </div>
    );
    expect(container.querySelector('[aria-label="Loading table"]')?.getAttribute("aria-busy")).toBe("true");
    expect(container.querySelector('[aria-label="Loading cards"]')?.getAttribute("aria-busy")).toBe("true");
    cleanup();
  });
});
