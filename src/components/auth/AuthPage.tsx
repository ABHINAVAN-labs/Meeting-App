"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Lenis from "lenis";
import { createClient } from "@/utils/supabase/client";
import { getAuthCallbackUrl } from "@/lib/authRedirect";
import { safeGetClientSession } from "@/lib/supabaseClientAuth";
import AuthForm from "@/components/auth/AuthForm";
import { authRequest, type AuthMode } from "@/lib/authApi";

type AuthPageProps = {
  initialMode: AuthMode;
};

type FormErrors = {
  name?: string;
  email?: string;
  password?: string;
  submit?: string;
};

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function AuthPage({ initialMode }: AuthPageProps) {
  const router = useRouter();
  const [supabase] = useState(() => createClient());
  const [mode, setMode] = useState<AuthMode>(initialMode);
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [oauthLoading, setOauthLoading] = useState<"google" | "github" | null>(null);
  const [errors, setErrors] = useState<FormErrors>({});
  const [values, setValues] = useState({ name: "", email: "", password: "" });

  useEffect(() => {
    const lenis = new Lenis({ smoothWheel: true, duration: 1.05 });

    let frame = 0;
    const raf = (time: number) => {
      lenis.raf(time);
      frame = requestAnimationFrame(raf);
    };

    frame = requestAnimationFrame(raf);
    return () => {
      cancelAnimationFrame(frame);
      lenis.destroy();
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    const normalizeClientSession = async () => {
      try {
        const {
          data: { session },
        } = await safeGetClientSession(supabase);

        if (cancelled || !session) {
          return;
        }
      } catch {}
    };

    normalizeClientSession();

    return () => {
      cancelled = true;
    };
  }, [supabase]);

  const modePath = useMemo(() => (mode === "login" ? "/sign-in" : "/sign-up"), [mode]);

  useEffect(() => {
    window.history.replaceState(null, "", modePath);
  }, [modePath]);

  const validate = () => {
    const nextErrors: FormErrors = {};

    if (mode === "signup" && !values.name.trim()) {
      nextErrors.name = "Name is required.";
    }

    if (!values.email.trim()) {
      nextErrors.email = "Email is required.";
    } else if (!EMAIL_REGEX.test(values.email)) {
      nextErrors.email = "Enter a valid email address.";
    }

    if (!values.password.trim()) {
      nextErrors.password = "Password is required.";
    }

    return nextErrors;
  };

  const onSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const validationErrors = validate();
    if (Object.keys(validationErrors).length > 0) {
      setErrors(validationErrors);
      return;
    }

    setLoading(true);
    setErrors({});

    try {
      const authResult = await authRequest(mode, {
        email: values.email.trim(),
        password: values.password,
        ...(mode === "signup" ? { name: values.name.trim() } : {}),
      });

      if (mode === "signup" && !(authResult as { session?: unknown }).session) {
        setMode("login");
        setValues((current) => ({ ...current, password: "" }));
        setErrors({
          submit: "Account created. Please verify your email, then sign in.",
        });
        return;
      }

      router.push("/dashboard");
      router.refresh();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Authentication failed.";
      setErrors({ submit: message });
    } finally {
      setLoading(false);
    }
  };

  const onModeChange = (nextMode: AuthMode) => {
    setMode(nextMode);
    setErrors({});
  };

  const onValueChange = (field: "name" | "email" | "password", value: string) => {
    setValues((current) => ({ ...current, [field]: value }));
    setErrors((current) => ({ ...current, [field]: undefined, submit: undefined }));
  };

  const onOAuth = async (provider: "google" | "github") => {
    setErrors({});
    setOauthLoading(provider);
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider,
        options: {
          redirectTo: getAuthCallbackUrl(),
        },
      });
      if (error) {
        setErrors({ submit: error.message });
        setOauthLoading(null);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "OAuth login failed.";
      setErrors({ submit: message });
      setOauthLoading(null);
    }
  };

  return (
    <main className="relative min-h-screen overflow-hidden bg-[#05070f] px-4 py-10 sm:px-6">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute inset-0 animate-gradient-shift bg-[linear-gradient(130deg,#060a16_0%,#0a2638_45%,#1d1a45_100%)] bg-[length:260%_260%]" />
        <div className="absolute -left-28 top-10 h-80 w-80 animate-blob-float rounded-full bg-cyan-500/32 blur-[90px]" />
        <div className="absolute -right-24 bottom-8 h-96 w-96 animate-blob-float-delayed rounded-full bg-indigo-500/28 blur-[100px]" />
        <div className="absolute left-[40%] top-[62%] h-72 w-72 animate-blob-drift rounded-full bg-teal-500/22 blur-[90px]" />
        <div className="absolute left-[62%] top-[18%] h-64 w-64 animate-blob-sway rounded-full bg-blue-500/20 blur-[85px]" />
      </div>
      <div className="relative mx-auto flex min-h-[calc(100vh-5rem)] w-full max-w-6xl items-center justify-center">
        <section className="flex w-full items-center justify-center">
          <AuthForm
            mode={mode}
            loading={loading}
            oauthLoading={oauthLoading}
            showPassword={showPassword}
            values={values}
            errors={errors}
            onModeChange={onModeChange}
            onSubmit={onSubmit}
            onValueChange={onValueChange}
            onTogglePassword={() => setShowPassword((current) => !current)}
            onOAuth={onOAuth}
          />
        </section>
      </div>
    </main>
  );
}
