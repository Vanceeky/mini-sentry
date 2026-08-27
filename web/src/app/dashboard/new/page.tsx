"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { motion } from "framer-motion";
import { ArrowRight, Loader2, TriangleAlert } from "lucide-react";
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
import { CodeBlock } from "@/components/landing/code-block";
import { useSession } from "@/hooks/use-session";
import { API_BASE_URL, ApiError, createProject, type NewProject } from "@/lib/api";
import { createProjectSchema, type CreateProjectInput } from "@/lib/validation";

export default function NewProjectPage() {
  const { token } = useSession();
  const [formError, setFormError] = useState<string | null>(null);
  const [created, setCreated] = useState<NewProject | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<CreateProjectInput>({ resolver: zodResolver(createProjectSchema) });

  async function onSubmit(values: CreateProjectInput) {
    if (!token) return;
    setFormError(null);
    try {
      const { project } = await createProject(token, values);
      setCreated(project);
    } catch (err) {
      setFormError(
        err instanceof ApiError ? err.message : "Something went wrong. Try again.",
      );
    }
  }

  if (created) {
    const snippet = `import { init } from "@mini-sentry/sdk";

init({
  apiKey: "${created.apiKey}",
  endpoint: "${API_BASE_URL}/events",
});`;

    return (
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: "easeOut" }}
        className="mx-auto max-w-2xl"
      >
        <h1 className="text-2xl font-semibold text-foreground">
          {created.name} is ready
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Here&rsquo;s your API key and a snippet to drop straight into your app.
        </p>

        <Alert variant="destructive" className="mt-6">
          <TriangleAlert />
          <AlertDescription>
            This key is shown <strong>once</strong>. Copy it now — every later
            view of this project only shows the last 4 characters.
          </AlertDescription>
        </Alert>

        <div className="mt-4">
          <CodeBlock code={created.apiKey} lang="bash" label="API key" />
        </div>

        <h2 className="mt-8 text-sm font-semibold text-foreground">
          Install the SDK
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-[0.85em]">
            npm install @mini-sentry/sdk
          </code>{" "}
          then:
        </p>
        <div className="mt-3">
          <CodeBlock code={snippet} lang="ts" label="index.ts" />
        </div>

        <a href="/dashboard" className="mt-8 inline-block">
          <Button>
            Done — go to dashboard
            <ArrowRight className="size-4" />
          </Button>
        </a>
      </motion.div>
    );
  }

  return (
    <div className="mx-auto max-w-sm">
      <Card>
        <CardHeader>
          <CardTitle className="text-xl">New project</CardTitle>
          <CardDescription>
            One project per app you want to monitor. You&rsquo;ll get a fresh
            API key for it.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form className="flex flex-col gap-4" onSubmit={handleSubmit(onSubmit)} noValidate>
            {formError && (
              <Alert variant="destructive">
                <AlertDescription>{formError}</AlertDescription>
              </Alert>
            )}
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="name">Project name</Label>
              <Input
                id="name"
                placeholder="My Application"
                autoFocus
                {...register("name")}
              />
              {errors.name && (
                <p className="text-xs text-destructive">{errors.name.message}</p>
              )}
            </div>
            <Button type="submit" disabled={isSubmitting} className="mt-2 w-full">
              {isSubmitting && <Loader2 className="size-4 animate-spin" />}
              Create project
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
