import React, { act } from "react";
import { create } from "react-test-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("next/link",()=>({default:({children,...props})=>React.createElement("a",props,children)}));
vi.mock("next/navigation",()=>({usePathname:()=>"/dashboard/exams"}));
vi.mock("../components/auth/logout-button",()=>({LogoutButton:()=>null}));
vi.mock("../components/ui/dialog",()=>({Dialog:({open,children})=>open?React.createElement("section",null,children):null}));
import { DashboardNavigation, DashboardShell } from "../components/layout/dashboard-shell";
import { QuestionNavigation } from "../components/attempts/question-navigation";
let root;
beforeEach(()=>{globalThis.IS_REACT_ACT_ENVIRONMENT=true;vi.stubGlobal("React",React);});
afterEach(async()=>{if(root)await act(async()=>root.unmount());vi.unstubAllGlobals();});
describe("role-aware navigation and question map",()=>{
 it("shows all Admin destinations and exactly one active page",async()=>{
  await act(async()=>{root=create(React.createElement(DashboardNavigation,{role:"admin",pathname:"/dashboard/exams"}));});
  const links=root.root.findAllByType("a");expect(links).toHaveLength(13);expect(links.filter(a=>a.props["aria-current"]==="page").map(a=>a.props.href)).toEqual(["/dashboard/exams"]);
 });
 it("does not expose administration destinations to teachers",async()=>{
  await act(async()=>{root=create(React.createElement(DashboardNavigation,{role:"teacher",pathname:"/dashboard"}));});
  const hrefs=root.root.findAllByType("a").map(a=>a.props.href);
  for(const name of ["rooms","settings","audit","jobs"])expect(hrefs).not.toContain(`/dashboard/${name}`);
  expect(hrefs).toContain("/dashboard/users");
 });
 it("opens mobile navigation and closes it after choosing a destination",async()=>{
  await act(async()=>{root=create(React.createElement(DashboardShell,{role:"teacher",name:"Guru Uji"},React.createElement("h1",null,"Halaman")));});
  await act(async()=>root.root.findByProps({"aria-label":"Buka navigasi"}).props.onClick());
  expect(root.root.findAllByProps({"aria-label":"Navigasi utama"})).toHaveLength(2);
  const links=root.root.findAllByType("a").filter(a=>a.props.href==="/dashboard/exams");
  await act(async()=>links.at(-1).props.onClick());expect(root.root.findAllByProps({"aria-label":"Navigasi utama"})).toHaveLength(1);
 });
 it("gives every question a text status and supports keyboard-native buttons",async()=>{
  const select=vi.fn();await act(async()=>{root=create(React.createElement(QuestionNavigation,{items:[{id:"a",state:"empty",flagged:false},{id:"b",state:"partial",flagged:true},{id:"c",state:"complete",flagged:false}],index:0,onSelect:select}));});
  const buttons=root.root.findAllByType("button");expect(buttons[1].props["aria-label"]).toContain("Belum lengkap, ditandai ragu");
  expect(buttons[0].props["aria-current"]).toBe("step");await act(async()=>buttons[2].props.onClick());expect(select).toHaveBeenCalledWith(2);
 });
});
