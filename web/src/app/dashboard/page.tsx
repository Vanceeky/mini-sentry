"use client";

import { useEffect, useState } from "react";
import { FolderGit2, KeyRound, Loader2, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { RevealGroup, RevealItem } from "@/components/landing/reveal";
import { useSession } from "@/hooks/use-session";
import { listProjects, type Project } from "@/lib/api";

export default function DashboardPage() {
  const { token } = useSession();
  const [projects, setProjects] = useState<Project[] | null>(null);

  useEffect(() => {
    if (!token) return;
    listProjects(token)
      .then(({ projects }) => setProjects(projects))
      .catch(() => setProjects([]));
  }, [token]);

  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Projects</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Each project has its own API key for the SDK.
          </p>
        </div>
        <a href="/dashboard/new">
          <Button>
            <Plus className="size-4" />
            New project
          </Button>
        </a>
      </div>

      {projects === null && (
        <div className="mt-16 flex justify-center">
          <Loader2 className="size-5 animate-spin text-muted-foreground" />
        </div>
      )}

      {projects !== null && projects.length === 0 && (
        <div className="mt-8 flex flex-col items-center gap-3 rounded-xl border border-dashed border-border py-16 text-center">
          <FolderGit2 className="size-7 text-muted-foreground" strokeWidth={1.5} />
          <p className="text-sm text-muted-foreground">
            No projects yet — create one to get an API key.
          </p>
          <a href="/dashboard/new">
            <Button size="sm">
              <Plus className="size-4" />
              New project
            </Button>
          </a>
        </div>
      )}

      {projects !== null && projects.length > 0 && (
        <RevealGroup className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {projects.map((p) => (
            <RevealItem key={p.id}>
              <a href={`/dashboard/${p.id}`} className="block">
                <Card className="transition-colors hover:border-primary/40">
                  <CardHeader>
                    <CardTitle className="text-base">{p.name}</CardTitle>
                  </CardHeader>
                  <CardContent className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <KeyRound className="size-3.5" />
                    <span className="font-mono">
                      {p.apiKeyLastFour ? `mnst_···${p.apiKeyLastFour}` : "no key"}
                    </span>
                  </CardContent>
                </Card>
              </a>
            </RevealItem>
          ))}
        </RevealGroup>
      )}
    </div>
  );
}
