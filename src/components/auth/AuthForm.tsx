"use client";

import { Eye, EyeOff } from "lucide-react";
import { motion } from "framer-motion";
import type { AuthMode } from "@/lib/authApi";
import type { FormEvent } from "react";

type AuthFormProps = {
  mode: AuthMode;
  loading: boolean;
  oauthLoading: "google" | "github" | null;
  showPassword: boolean;
  values: {
    name: string;
    email: string;
    password: string;
  };
  errors: {
    name?: string;
    email?: string;
    password?: string;
    submit?: string;
  };
  onModeChange: (mode: AuthMode) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onValueChange: (field: "name" | "email" | "password", value: string) => void;
  onTogglePassword: () => void;
  onOAuth: (provider: "google" | "github") => void;
};

const inputClassName =
  "w-full rounded-xl border border-white/20 bg-white/10 px-4 py-3 text-slate-100 placeholder:text-slate-400 outline-none transition-all duration-300 focus:border-cyan-400/80 focus:bg-white/15 focus:ring-4 focus:ring-cyan-400/20";

const fieldErrorClassName = "mt-1 text-xs text-rose-300";

export default function AuthForm({
  mode,
  loading,
  oauthLoading,
  showPassword,
  values,
  errors,
  onModeChange,
  onSubmit,
  onValueChange,
  onTogglePassword,
  onOAuth,
}: AuthFormProps) {
  const isLogin = mode === "login";
  const isOAuthBusy = oauthLoading !== null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 24, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.55, ease: "easeOut" }}
      className="w-full max-w-xl rounded-3xl border border-white/20 bg-white/10 p-6 shadow-[0_30px_90px_rgba(0,0,0,0.45)] backdrop-blur-2xl sm:p-8"
    >
      <motion.p
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1, duration: 0.4 }}
        className="text-sm font-medium text-cyan-200/90"
      >
        Trusted by 5000+ learners
      </motion.p>
      <motion.h1
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.15, duration: 0.4 }}
        className="mt-2 text-3xl font-semibold text-white"
      >
        {isLogin ? "Welcome back to Lumina" : "Create your Lumina account"}
      </motion.h1>
      <motion.p
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2, duration: 0.4 }}
        className="mt-2 text-sm text-slate-300"
      >
        {isLogin ? "Sign in to join your next education meeting." : "Start learning and collaborating in minutes."}
      </motion.p>

      <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <motion.button
          whileHover={{ y: -2, scale: 1.01 }}
          whileTap={{ scale: 0.99 }}
          type="button"
          onClick={() => onOAuth("google")}
          disabled={isOAuthBusy}
          className="inline-flex items-center justify-center gap-2 rounded-xl border border-white/25 bg-white/12 px-4 py-3 text-sm font-semibold text-white transition hover:bg-white/20 disabled:cursor-not-allowed disabled:opacity-70"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
            <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.08 5.08 0 0 1-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
            <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77a6.53 6.53 0 0 1-3.71 1.06 6.21 6.21 0 0 1-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23z" />
            <path fill="#FBBC05" d="M5.84 14.09A6.54 6.54 0 0 1 5.49 12c0-.73.13-1.43.35-2.09V7.07H2.18A11 11 0 0 0 1 12c0 1.78.43 3.45 1.18 4.93z" />
            <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1A11 11 0 0 0 2.18 7.07l3.66 2.84A6.21 6.21 0 0 1 12 5.38z" />
          </svg>
          {oauthLoading === "google" ? "Redirecting..." : "Continue with Google"}
        </motion.button>
        <motion.button
          whileHover={{ y: -2, scale: 1.01 }}
          whileTap={{ scale: 0.99 }}
          type="button"
          onClick={() => onOAuth("github")}
          disabled={isOAuthBusy}
          className="inline-flex items-center justify-center gap-2 rounded-xl border border-white/25 bg-white/12 px-4 py-3 text-sm font-semibold text-white transition hover:bg-white/20 disabled:cursor-not-allowed disabled:opacity-70"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <path d="M12 2C6.48 2 2 6.58 2 12.22c0 4.5 2.87 8.32 6.84 9.67.5.1.68-.22.68-.49 0-.24-.01-1.04-.01-1.89-2.78.62-3.37-1.21-3.37-1.21-.45-1.19-1.11-1.5-1.11-1.5-.91-.64.07-.63.07-.63 1 .08 1.53 1.08 1.53 1.08.89 1.58 2.34 1.12 2.91.86.09-.67.35-1.12.64-1.38-2.22-.26-4.55-1.14-4.55-5.06 0-1.12.39-2.03 1.03-2.75-.1-.26-.45-1.3.1-2.72 0 0 .84-.28 2.75 1.05A9.3 9.3 0 0 1 12 6.9c.85 0 1.7.12 2.5.35 1.9-1.33 2.75-1.05 2.75-1.05.54 1.42.2 2.46.1 2.72.64.72 1.03 1.63 1.03 2.75 0 3.93-2.33 4.8-4.56 5.05.36.32.68.94.68 1.9 0 1.37-.01 2.47-.01 2.81 0 .27.18.59.69.49A10.23 10.23 0 0 0 22 12.22C22 6.58 17.52 2 12 2z" />
          </svg>
          {oauthLoading === "github" ? "Redirecting..." : "Continue with GitHub"}
        </motion.button>
      </div>

      <div className="relative my-6">
        <div className="absolute inset-0 flex items-center">
          <div className="w-full border-t border-white/20" />
        </div>
        <div className="relative z-10 flex justify-center">
          <span className="inline-flex rounded-full bg-slate-700/90 px-4 py-1 text-xs text-slate-100 backdrop-blur-md">
            or continue with email
          </span>
        </div>
      </div>

      <motion.form
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.25, duration: 0.45 }}
        className="space-y-4"
        onSubmit={onSubmit}
        noValidate
      >
        {!isLogin && (
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-200" htmlFor="name">Name</label>
            <input
              id="name"
              type="text"
              autoComplete="name"
              value={values.name}
              onChange={(event) => onValueChange("name", event.target.value)}
              className={inputClassName}
              placeholder="Enter your full name"
            />
            {errors.name && <p className={fieldErrorClassName}>{errors.name}</p>}
          </div>
        )}

        <div>
          <label className="mb-1 block text-sm font-medium text-slate-200" htmlFor="email">Email</label>
          <input
            id="email"
            type="email"
            autoComplete="email"
            value={values.email}
            onChange={(event) => onValueChange("email", event.target.value)}
            className={inputClassName}
            placeholder="you@example.com"
          />
          {errors.email && <p className={fieldErrorClassName}>{errors.email}</p>}
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-slate-200" htmlFor="password">Password</label>
          <div className="relative">
            <input
              id="password"
              type={showPassword ? "text" : "password"}
              autoComplete={isLogin ? "current-password" : "new-password"}
              value={values.password}
              onChange={(event) => onValueChange("password", event.target.value)}
              className={`${inputClassName} pr-11`}
              placeholder="Enter your password"
            />
            <button
              type="button"
              onClick={onTogglePassword}
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg p-2 text-slate-300 transition hover:bg-white/15 hover:text-white"
              aria-label={showPassword ? "Hide password" : "Show password"}
            >
              {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          </div>
          {errors.password && <p className={fieldErrorClassName}>{errors.password}</p>}
        </div>

        {isLogin && (
          <button type="button" className="text-sm font-semibold text-cyan-300 transition hover:text-cyan-200">
            Forgot password?
          </button>
        )}

        {errors.submit && (
          <div className="rounded-xl border border-rose-400/40 bg-rose-400/15 px-3 py-2 text-sm text-rose-200">
            {errors.submit}
          </div>
        )}

        <motion.button
          whileHover={{ scale: 1.02, boxShadow: "0 14px 34px rgba(34, 211, 238, 0.35)" }}
          whileTap={{ scale: 0.99 }}
          transition={{ duration: 0.2 }}
          type="submit"
          disabled={loading}
          className="flex w-full items-center justify-center gap-2 rounded-xl border border-cyan-300/30 bg-gradient-to-r from-cyan-500 to-blue-500 px-4 py-3 font-medium text-white transition disabled:cursor-not-allowed disabled:from-cyan-700 disabled:to-blue-700"
        >
          {loading && (
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/50 border-t-white" aria-hidden="true" />
          )}
          {loading ? "Please wait..." : isLogin ? "Sign in" : "Create account"}
        </motion.button>
      </motion.form>

      <p className="mt-5 text-sm text-slate-300">
        {isLogin ? "Don’t have an account?" : "Already have an account?"}{" "}
        <button
          type="button"
          onClick={() => onModeChange(isLogin ? "signup" : "login")}
          className="font-semibold text-cyan-300 transition hover:text-cyan-200"
        >
          {isLogin ? "Sign up" : "Sign in"}
        </button>
      </p>
    </motion.div>
  );
}

