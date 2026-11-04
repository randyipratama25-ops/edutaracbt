"use client";
import { createContext } from "react";
export const FeedbackContext = createContext<{
  online: boolean | null;
  slow: boolean;
  access: "permission" | "session" | null;
  checking: boolean;
  accessError: string;
  checkAccess: () => void;
  dismissAccess: () => void;
}>({
  online: null,
  slow: false,
  access: null,
  checking: false,
  accessError: "",
  checkAccess: () => {},
  dismissAccess: () => {},
});
