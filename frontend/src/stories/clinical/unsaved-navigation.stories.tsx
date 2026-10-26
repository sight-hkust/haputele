import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { useEffect, useState } from "react";
import { expect, fn, userEvent, waitFor, within } from "storybook/test";
import { confirmPendingChanges, useUnsavedChanges } from "@/lib/use-unsaved-changes";

type Page = "A" | "B" | "form";

function entryUrl(page: Page) {
  const url = new URL(window.location.href);
  url.searchParams.set("guard-entry", page);
  return url.href;
}

function Draft({ navigate }: { navigate: (page: Page) => void }) {
  const [value, setValue] = useState("");
  const [dirty, setDirty] = useState(false);
  const { confirmLeave, markSaved } = useUnsavedChanges(dirty);
  return (
    <form onSubmit={(event) => event.preventDefault()} className="space-y-4">
      <label className="block text-sm font-medium">
        Draft correction
        <input
          className="block rounded-lg border border-slate-300 p-3 text-base"
          value={value}
          onChange={(event) => {
            setValue(event.target.value);
            setDirty(true);
          }}
        />
      </label>
      <button type="button" onClick={() => confirmLeave()}>
        Discard but stay (no-op exit)
      </button>
      <button type="button" onClick={() => window.history.go(-2)}>
        Back two entries
      </button>
      <button type="button" onClick={() => window.history.go(2)}>
        Forward two entries
      </button>
      <button
        type="button"
        onClick={() => {
          markSaved();
          setDirty(false);
          window.history.back();
        }}
      >
        Save and Back
      </button>
      <button
        type="button"
        onClick={() => {
          markSaved();
          setDirty(false);
          navigate("B");
        }}
      >
        Save and redirect
      </button>
      <button type="button" onClick={() => confirmPendingChanges()}>
        Sign out but stay (no-op request)
      </button>
      <button type="button" onClick={() => window.history.go(-window.history.length)}>
        Back beyond available history
      </button>
      <button
        type="button"
        onClick={async () => {
          if (!confirmLeave(entryUrl("A"))) return;
          const { promise, resolve } = Promise.withResolvers<void>();
          window.setTimeout(resolve, 50);
          await promise;
          navigate("A");
        }}
      >
        Cancel after a slow route transition
      </button>
      <a href="#patient-context">View patient context</a>
      <div id="patient-context">Patient history</div>
      <a
        href={entryUrl("A")}
        onClick={(event) => {
          event.preventDefault();
          navigate("A");
        }}
      >
        Patients
      </a>
    </form>
  );
}

function NavigationHarness({
  directEntry = false,
  forwardHistory = false,
}: {
  directEntry?: boolean;
  forwardHistory?: boolean;
}) {
  const [page, setPage] = useState<Page | null>(null);
  const [observedPops, setObservedPops] = useState(0);
  useEffect(() => {
    const originalUrl = window.location.href;
    const originalState = window.history.state;
    window.history.replaceState(
      { ...originalState, regressionEntry: forwardHistory ? "form" : "A" },
      "",
      entryUrl(forwardHistory ? "form" : "A"),
    );
    if (!directEntry) {
      window.history.pushState(
        { ...window.history.state, regressionEntry: "B" },
        "",
        entryUrl("B"),
      );
      window.history.pushState(
        { ...window.history.state, regressionEntry: forwardHistory ? "A" : "form" },
        "",
        entryUrl(forwardHistory ? "A" : "form"),
      );
    } else {
      window.history.replaceState(
        { ...window.history.state, regressionEntry: "form" },
        "",
        entryUrl("form"),
      );
    }
    // This bubble listener represents the router seam: rejected traversals and
    // their restoration must both be hidden from downstream route listeners.
    const pop = () => {
      setObservedPops((count) => count + 1);
      setPage(new URL(window.location.href).searchParams.get("guard-entry") as Page);
    };
    window.addEventListener("popstate", pop);
    if (forwardHistory) window.history.go(-2);
    else setPage("form");
    return () => {
      window.removeEventListener("popstate", pop);
      window.history.replaceState(originalState, "", originalUrl);
    };
  }, [directEntry, forwardHistory]);
  const navigate = (destination: Page) => {
    window.history.pushState(
      { ...window.history.state, regressionEntry: destination },
      "",
      entryUrl(destination),
    );
    setPage(destination);
  };
  return (
    <section className="space-y-4 rounded-2xl border border-slate-200 bg-white p-4 text-slate-900">
      <h1 className="text-lg font-semibold">Unsaved navigation regression</h1>
      <output aria-label="Current page">{page ?? "initializing"}</output>
      <output aria-label="Router pop events">{observedPops}</output>
      {page === "form" ? (
        <Draft navigate={navigate} />
      ) : (
        <button type="button" onClick={() => window.history.forward()}>
          Forward
        </button>
      )}
    </section>
  );
}

const meta = {
  title: "Clinical/Safety/Unsaved navigation",
  component: NavigationHarness,
  parameters: {
    layout: "centered",
    docs: {
      description: {
        component:
          "Uses the production React draft guard and actual browser history, with window.navigation disabled. A/B/form entries retain their own opaque history state. The router-seam listener must see neither a rejected multi-entry traversal nor its exact restoration. Native traversals to same-document entries created before tracking are deliberately unsupported because legacy history does not expose their distance; application initialization installs tracking before app routes are created. No drafts enter browser storage.",
      },
    },
  },
  beforeEach: (context) => {
    const descriptor = Object.getOwnPropertyDescriptor(window, "navigation");
    if (context.parameters.legacyNavigation !== false) {
      Object.defineProperty(window, "navigation", { configurable: true, value: undefined });
    }
    const originalConfirm = window.confirm;
    return () => {
      window.confirm = originalConfirm;
      if (descriptor) Object.defineProperty(window, "navigation", descriptor);
      else Reflect.deleteProperty(window, "navigation");
    };
  },
} satisfies Meta<typeof NavigationHarness>;
export default meta;
type Story = StoryObj<typeof meta>;

export const MultiEntryStayThenDiscard: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const input = await canvas.findByRole("textbox", { name: "Draft correction" });
    await userEvent.type(input, "Corrected draft");
    const confirm = fn(() => false);
    window.confirm = confirm;
    await userEvent.click(canvas.getByRole("button", { name: "Back two entries" }));
    await waitFor(() => {
      expect(confirm).toHaveBeenCalledTimes(1);
      expect(new URL(window.location.href).searchParams.get("guard-entry")).toBe("form");
      expect(canvas.getByLabelText("Current page")).toHaveTextContent("form");
      expect(canvas.getByLabelText("Router pop events")).toHaveTextContent("0");
      expect(input).toHaveValue("Corrected draft");
    });
    confirm.mockReturnValue(true);
    await userEvent.click(canvas.getByRole("button", { name: "Back two entries" }));
    await waitFor(() => {
      expect(canvas.getByLabelText("Current page")).toHaveTextContent("A");
      expect(new URL(window.location.href).searchParams.get("guard-entry")).toBe("A");
      expect(window.history.state.regressionEntry).toBe("A");
      expect(confirm).toHaveBeenCalledTimes(2);
    });
  },
};

export const NoOpDiscardAndSignoutRearm: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const input = await canvas.findByRole("textbox", { name: "Draft correction" });
    const confirm = fn(() => true);
    window.confirm = confirm;
    await userEvent.type(input, "First draft");
    await userEvent.click(canvas.getByRole("button", { name: "Discard but stay (no-op exit)" }));
    await userEvent.type(input, " corrected");
    confirm.mockReturnValue(false);
    await userEvent.click(canvas.getByRole("link", { name: "Patients" }));
    await expect(confirm).toHaveBeenCalledTimes(2);
    await expect(input).toHaveValue("First draft corrected");
    confirm.mockReturnValue(true);
    await userEvent.click(
      canvas.getByRole("button", { name: "Sign out but stay (no-op request)" }),
    );
    // The authentication request may finish asynchronously. Its accepted
    // confirmation suppresses a duplicate beforeunload for the same attempt.
    const unload = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(unload);
    await expect(unload.defaultPrevented).toBe(false);
    await userEvent.type(input, " again");
    confirm.mockReturnValue(false);
    await userEvent.click(canvas.getByRole("link", { name: "Patients" }));
    await expect(confirm).toHaveBeenCalledTimes(4);
    await expect(input).toHaveValue("First draft corrected again");
  },
};

export const SaveThenBackHasNoSentinel: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const input = await canvas.findByRole("textbox", { name: "Draft correction" });
    const confirm = fn(() => false);
    window.confirm = confirm;
    const historyLength = window.history.length;
    await userEvent.type(input, "Saved correction");
    await expect(window.history.length).toBe(historyLength);
    await userEvent.click(canvas.getByRole("button", { name: "Save and Back" }));
    await waitFor(() => {
      expect(canvas.getByLabelText("Current page")).toHaveTextContent("B");
      expect(new URL(window.location.href).searchParams.get("guard-entry")).toBe("B");
      expect(confirm).not.toHaveBeenCalled();
    });
    await userEvent.click(canvas.getByRole("button", { name: "Forward" }));
    await userEvent.type(await canvas.findByRole("textbox", { name: "Draft correction" }), "Next");
    await userEvent.click(canvas.getByRole("button", { name: "Save and redirect" }));
    await waitFor(() => expect(canvas.getByLabelText("Current page")).toHaveTextContent("B"));
    await expect(confirm).not.toHaveBeenCalled();
  },
};

export const DirectEntryNoOpBackDoesNotDisarm: Story = {
  args: { directEntry: true },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const input = await canvas.findByRole("textbox", { name: "Draft correction" });
    const confirm = fn(() => false);
    window.confirm = confirm;
    await userEvent.type(input, "Direct entry draft");
    await userEvent.click(canvas.getByRole("button", { name: "Back beyond available history" }));
    await userEvent.type(input, " corrected");
    await userEvent.click(canvas.getByRole("link", { name: "Patients" }));
    await expect(confirm).toHaveBeenCalledTimes(1);
    await expect(input).toHaveValue("Direct entry draft corrected");
    await expect(canvas.getByLabelText("Current page")).toHaveTextContent("form");
  },
};

export const MultiEntryForwardStayThenDiscard: Story = {
  args: { forwardHistory: true },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const input = await canvas.findByRole("textbox", { name: "Draft correction" });
    await userEvent.type(input, "Forward draft");
    const confirm = fn(() => false);
    window.confirm = confirm;
    const observedPops = canvas.getByLabelText("Router pop events").textContent;
    await userEvent.click(canvas.getByRole("button", { name: "Forward two entries" }));
    await waitFor(() => {
      expect(confirm).toHaveBeenCalledTimes(1);
      expect(new URL(window.location.href).searchParams.get("guard-entry")).toBe("form");
      expect(canvas.getByLabelText("Router pop events")).toHaveTextContent(observedPops ?? "");
      expect(input).toHaveValue("Forward draft");
    });
    confirm.mockReturnValue(true);
    await userEvent.click(canvas.getByRole("button", { name: "Forward two entries" }));
    await waitFor(() => {
      expect(canvas.getByLabelText("Current page")).toHaveTextContent("A");
      expect(new URL(window.location.href).searchParams.get("guard-entry")).toBe("A");
      expect(window.history.state.regressionEntry).toBe("A");
      expect(confirm).toHaveBeenCalledTimes(2);
    });
  },
};

export const NativeFragmentPreservesProtection: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const input = await canvas.findByRole("textbox", { name: "Draft correction" });
    await userEvent.type(input, "Correction survives context browsing");
    const confirm = fn(() => false);
    window.confirm = confirm;
    const prior = window.history.state.__haputeleHistoryPosition;
    await userEvent.click(canvas.getByRole("link", { name: "View patient context" }));
    await waitFor(() => {
      expect(window.location.hash).toBe("#patient-context");
      expect(window.history.state.__haputeleHistoryPosition.realm).toBe(prior.realm);
      expect(window.history.state.__haputeleHistoryPosition.index).toBe(prior.index + 1);
    });
    await expect(confirm).not.toHaveBeenCalled();
    await userEvent.click(canvas.getByRole("button", { name: "Back two entries" }));
    await waitFor(() => {
      expect(confirm).toHaveBeenCalledOnce();
      expect(window.location.hash).toBe("#patient-context");
      expect(canvas.getByLabelText("Current page")).toHaveTextContent("form");
      expect(input).toHaveValue("Correction survives context browsing");
    });
    confirm.mockReturnValue(true);
    await userEvent.click(canvas.getByRole("button", { name: "Back two entries" }));
    await waitFor(() => {
      expect(canvas.getByLabelText("Current page")).toHaveTextContent("B");
      expect(confirm).toHaveBeenCalledTimes(2);
    });
  },
};

export const SlowExplicitCancelPromptsOnce: Story = {
  parameters: { legacyNavigation: false },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const input = await canvas.findByRole("textbox", { name: "Draft correction" });
    await userEvent.type(input, "Unsaved clinical correction");
    const confirm = fn(() => true);
    window.confirm = confirm;
    await userEvent.click(
      canvas.getByRole("button", { name: "Cancel after a slow route transition" }),
    );
    await waitFor(() => expect(canvas.getByLabelText("Current page")).toHaveTextContent("A"));
    await expect(confirm).toHaveBeenCalledOnce();
  },
};
