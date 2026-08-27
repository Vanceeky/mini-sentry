"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { useSession } from "@/hooks/use-session";
import { ApiError, login as apiLogin } from "@/lib/api";
import { loginSchema, type LoginInput } from "@/lib/validation";

export default function LoginPage() {
  const router = useRouter();
  const { status, login } = useSession();
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginInput>({ resolver: zodResolver(loginSchema) });

  useEffect(() => {
    if (status === "authenticated") router.replace("/dashboard");
  }, [status, router]);

  async function onSubmit(values: LoginInput) {
    setFormError(null);
    try {
      const { token, user } = await apiLogin(values);
      login(token, user);
      router.push("/dashboard");
    } catch (err) {
      if (err instanceof ApiError && err.code === "RATE_LIMITED") {
        const wait = err.retryAfterSeconds;
        setFormError(
          wait
            ? `Too many attempts. Try again in ${wait} second${wait === 1 ? "" : "s"}.`
            : "Too many attempts. Try again shortly.",
        );
        return;
      }
      // Deliberately generic for bad credentials — never says which field was wrong.
      setFormError(
        err instanceof ApiError ? err.message : "Something went wrong. Try again.",
      );
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-xl">Log in</CardTitle>
        <CardDescription>Access your projects and API keys.</CardDescription>
      </CardHeader>
      <CardContent>
        <form className="flex flex-col gap-4" onSubmit={handleSubmit(onSubmit)} noValidate>
          {formError && (
            <Alert variant="destructive">
              <AlertDescription>{formError}</AlertDescription>
            </Alert>
          )}

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="email">Email</Label>
            <Input id="email" type="email" autoComplete="email" {...register("email")} />
            {errors.email && (
              <p className="text-xs text-destructive">{errors.email.message}</p>
            )}
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              type="password"
              autoComplete="current-password"
              {...register("password")}
            />
            {errors.password && (
              <p className="text-xs text-destructive">{errors.password.message}</p>
            )}
          </div>

          <Button type="submit" disabled={isSubmitting} className="mt-2 w-full">
            {isSubmitting && <Loader2 className="size-4 animate-spin" />}
            Log in
          </Button>
        </form>

        <p className="mt-5 text-center text-sm text-muted-foreground">
          No account yet?{" "}
          <a href="/register" className="font-medium text-primary hover:underline">
            Create one
          </a>
        </p>
      </CardContent>
    </Card>
  );
}
