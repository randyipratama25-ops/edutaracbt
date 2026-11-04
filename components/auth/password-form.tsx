"use client";
import {ValidatedForm} from "../feedback/validated-form";
import {FeedbackMessage} from "../feedback/state";
import Link from "next/link";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { Eye, EyeOff } from "lucide-react";
import { Button } from "../ui/button";
import { newPasswordSchema } from "../../lib/auth/password";
import {
  accountRequest,
  AccountRequestError,
} from "../../lib/auth/account-request";
import {
  initializeReset,
  checkResetSession,
  type ResetSession,
} from "../../lib/auth/reset-session";
import { homeCallback } from "../../lib/auth/home-callback";
type Phase =
  | "checking"
  | "redirecting"
  | "ready"
  | "saving"
  | "complete"
  | "blocked";
type Feedback = { kind: "error" | "success" | "warning"; text: string } | null;
export function PasswordForm() {
  const [phase, setPhase] = useState<Phase>("checking"),
    [feedback, setFeedback] = useState<Feedback>(null),
    [canRetry, setCanRetry] = useState(false),
    [mismatch, setMismatch] = useState(false),
    [invalidPassword, setInvalidPassword] = useState(false);
  const [showPassword, setShowPassword] = useState(false),
    [showConfirm, setShowConfirm] = useState(false);
  const initialization = useRef<{
    promise: Promise<ResetSession> | null;
    controller: AbortController;
    subscribers: number;
  }>({ promise: null, controller: new AbortController(), subscribers: 0 });
  const operation = useRef<AbortController | null>(null),
    generation = useRef(0),
    lock = useRef(false);
  const passwordInput = useRef<HTMLInputElement>(null),
    confirmInput = useRef<HTMLInputElement>(null),
    feedbackNode = useRef<HTMLParagraphElement>(null);
  useEffect(() => {
    const scope = initialization.current,
      lifetime = generation,
      request = operation;
    scope.subscribers++;
    let active = true;
    if (!scope.promise)
      scope.promise = initializeReset(scope.controller).catch(() => ({
        phase: "blocked",
        message:
          "Sesi belum dapat diverifikasi. Gunakan tautan terbaru atau masuk kembali.",
        retry: false,
      }));
    void scope.promise.then((result) => {
      if (active) {
        setPhase(result.phase);
        setCanRetry(result.retry);
        setFeedback(
          result.phase === "blocked"
            ? { kind: "error", text: result.message }
            : null,
        );
      }
    });
    function callbackChanged() {
      if (
        window.location.pathname === "/auth/reset" &&
        homeCallback(
          window.location.search,
          window.location.hash,
          "/auth/reset",
        ).kind !== "none"
      )
        window.location.reload();
    }
    window.addEventListener("hashchange", callbackChanged);
    window.addEventListener("popstate", callbackChanged);
    return () => {
      active = false;
      lifetime.current++;
      scope.subscribers--;
      window.removeEventListener("hashchange", callbackChanged);
      window.removeEventListener("popstate", callbackChanged);
      // Strict Mode reconnects before this microtask; a real unmount cancels client work.
      queueMicrotask(() => {
        if (scope.subscribers === 0) {
          scope.controller.abort();
          request.current?.abort();
        }
      });
    };
  }, []);
  function focusFeedback() {
    requestAnimationFrame(() => {
      if (!document.querySelector('[role="dialog"]'))
        feedbackNode.current?.focus();
    });
  }
  async function retrySession() {
    if (lock.current) return;
    lock.current = true;
    setPhase("checking");
    setFeedback(null);
    const seq = generation.current,
      controller = new AbortController();
    operation.current = controller;
    try {
      const result = await checkResetSession(controller);
      if (seq === generation.current) {
        setPhase(result.phase);
        setCanRetry(true);
      }
    } catch (error) {
      if (seq === generation.current) {
        setPhase("blocked");
        setFeedback({
          kind: "error",
          text:
            error instanceof Error
              ? error.message
              : "Sesi belum dapat diperiksa.",
        });
      }
    } finally {
      lock.current = false;
      if (operation.current === controller) operation.current = null;
    }
  }
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (lock.current || phase !== "ready") return;
    const form = e.currentTarget,
      fields = new FormData(form),
      password = String(fields.get("password") || ""),
      parsed = newPasswordSchema.safeParse(password);
    if (!parsed.success) {
      setInvalidPassword(true);
      setFeedback({ kind: "error", text: parsed.error.issues[0].message });
      passwordInput.current?.focus();
      return;
    }
    if (password !== fields.get("confirm")) {
      setMismatch(true);
      setFeedback({ kind: "error", text: "Konfirmasi password tidak sama." });
      confirmInput.current?.focus();
      return;
    }
    lock.current = true;
    setPhase("saving");
    setFeedback(null);
    setMismatch(false);
    setInvalidPassword(false);
    setShowPassword(false);
    setShowConfirm(false);
    const seq = generation.current,
      controller = new AbortController();
    operation.current = controller;
    try {
      const data = await accountRequest(
        "password",
        { password: parsed.data },
        controller,
      );
      if (seq !== generation.current) return;
      if (
        typeof data.message !== "string" ||
        !data.message.trim() ||
        data.message.length > 500 ||
        (data.signed_out !== undefined && typeof data.signed_out !== "boolean")
      )
        throw new AccountRequestError(
          "Hasil perubahan password belum dapat dipastikan. Coba masuk dengan password baru sebelum mengulang.",
        );
      form.reset();
      setPhase("complete");
      setCanRetry(false);
      setFeedback({
        kind: data.signed_out === false ? "warning" : "success",
        text: data.message,
      });
      focusFeedback();
    } catch (error) {
      if (seq === generation.current) {
        const editable =
          error instanceof AccountRequestError &&
          (error.status === 422 || error.status === 429);
        setPhase(editable ? "ready" : "blocked");
        if (error instanceof AccountRequestError && error.status === 422)
          setInvalidPassword(true);
        setCanRetry(false);
        setFeedback({
          kind: "error",
          text:
            error instanceof Error
              ? error.message
              : "Hasil perubahan password belum dapat dipastikan. Coba masuk dengan password baru.",
        });
        focusFeedback();
      }
    } finally {
      lock.current = false;
      if (operation.current === controller) operation.current = null;
    }
  }
  const disabled = phase !== "ready";
  function edited() {
    setMismatch(false);
    setInvalidPassword(false);
    setFeedback(null);
  }
  return (
    <ValidatedForm
      method="post"
      action="/api/auth/password"
      onSubmit={submit}
      className="stack reset-form"
      aria-busy={
        phase === "checking" || phase === "saving" || phase === "redirecting"
      }
    >
      {(phase === "checking" || phase === "redirecting") && (
        <FeedbackMessage tone="loading" role="status">
          {phase === "checking"
            ? "Memeriksa tautan dan sesi akun…"
            : "Membuka verifikasi tautan…"}
        </FeedbackMessage>
      )}
      <label htmlFor="new-password">
        Password baru
        <span className="password-field">
          <input
            ref={passwordInput}
            id="new-password"
            name="password"
            type={showPassword ? "text" : "password"}
            onChange={edited}
            disabled={disabled}
            aria-invalid={invalidPassword || undefined}
            aria-describedby="password-policy password-feedback"
            minLength={12}
            maxLength={128}
            required
            autoComplete="new-password"
          />
          <button
            type="button"
            className="password-toggle"
            disabled={disabled}
            aria-label={
              showPassword
                ? "Sembunyikan password baru"
                : "Tampilkan password baru"
            }
            aria-controls="new-password"
            aria-pressed={showPassword}
            onClick={() => setShowPassword((value) => !value)}
          >
            {showPassword ? (
              <EyeOff size={19} aria-hidden="true" />
            ) : (
              <Eye size={19} aria-hidden="true" />
            )}
          </button>
        </span>
      </label>
      <p id="password-policy" className="muted reset-policy">
        Gunakan 12–128 karakter. Hindari password yang mudah ditebak.
      </p>
      <label htmlFor="confirm-password">
        Ulangi password
        <span className="password-field">
          <input
            ref={confirmInput}
            id="confirm-password"
            name="confirm"
            type={showConfirm ? "text" : "password"}
            onChange={edited}
            disabled={disabled}
            aria-invalid={mismatch || undefined}
            aria-describedby="password-feedback"
            minLength={12}
            maxLength={128}
            required
            autoComplete="new-password"
          />
          <button
            type="button"
            className="password-toggle"
            disabled={disabled}
            aria-label={
              showConfirm
                ? "Sembunyikan konfirmasi password"
                : "Tampilkan konfirmasi password"
            }
            aria-controls="confirm-password"
            aria-pressed={showConfirm}
            onClick={() => setShowConfirm((value) => !value)}
          >
            {showConfirm ? (
              <EyeOff size={19} aria-hidden="true" />
            ) : (
              <Eye size={19} aria-hidden="true" />
            )}
          </button>
        </span>
      </label>
      {phase !== "complete" && (
        <Button disabled={disabled}>
          {phase === "saving" ? "Menyimpan…" : "Simpan password"}
        </Button>
      )}
      <FeedbackMessage tone={feedback?.kind === "success" ? "success" : feedback?.kind === "warning" ? "validation" : "error"}
        ref={feedbackNode}
        id="password-feedback"
        tabIndex={-1}
        role={
          feedback?.kind === "error" || feedback?.kind === "warning"
            ? "alert"
            : "status"
        }
      >
        {feedback?.text}
      </FeedbackMessage>
      {phase === "blocked" && canRetry && (
        <Button
          type="button"
          variant="outline"
          onClick={() => void retrySession()}
        >
          Periksa sesi lagi
        </Button>
      )}
      <Button asChild variant={phase === "complete" ? "default" : "outline"}>
        <Link href="/login">
          {phase === "complete"
            ? "Masuk dengan password baru"
            : "Kembali ke login"}
        </Link>
      </Button>
    </ValidatedForm>
  );
}
