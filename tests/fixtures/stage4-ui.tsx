"use client";
import { useEffect,useState } from "react";
import { DashboardShell } from "../../components/layout/dashboard-shell";
import { BankPanel } from "../../components/bank/panel";
import { AssessmentPanel } from "../../components/assessment/panel";
export default function Fixture(){const [mode,setMode]=useState("bank");useEffect(()=>{setMode(new URLSearchParams(location.search).get("mode")||"bank");},[]);return <DashboardShell role="admin" name="Petugas Pengujian"><h1>{mode==="bank"?"Bank soal":"Koreksi dan moderasi"}</h1>{mode==="bank"?<BankPanel/>:<AssessmentPanel/>}</DashboardShell>;}
