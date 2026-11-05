import React, { act } from "react";
import { create } from "react-test-renderer";
import { expect, it, vi } from "vitest";
import { TaskTabs } from "../components/ui/task-tabs";

it("switches panels by keyboard and preserves mounted draft content", async () => {
  vi.stubGlobal("React", React);
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const focus = vi.fn();
  let root;
  try {
    await act(async () => {
      root = create(React.createElement(TaskTabs, {
        label: "Pengaturan",
        items: [
          { id: "general", label: "Umum", content: React.createElement("input", { defaultValue: "Draf" }) },
          { id: "mail", label: "Email", content: React.createElement("p", null, "Uji SMTP") },
        ],
      }), { createNodeMock: () => ({ focus }) });
    });
    const tabs = root.root.findAllByProps({ role: "tab" });
    const panels = root.root.findAllByProps({ role: "tabpanel" });
    const draft = root.root.findByType("input");
    expect(panels.map(panel => panel.props.hidden)).toEqual([false, true]);
    await act(async () => tabs[0].props.onKeyDown({ key: "ArrowRight", preventDefault() {} }));
    expect(focus).toHaveBeenCalledOnce();
    expect(tabs.map(tab => tab.props["aria-selected"])).toEqual([false, true]);
    expect(panels.map(panel => panel.props.hidden)).toEqual([true, false]);
    await act(async () => tabs[0].props.onClick());
    expect(root.root.findByType("input")).toBe(draft);
  } finally {
    if (root) await act(async () => root.unmount());
    vi.unstubAllGlobals();
  }
});
