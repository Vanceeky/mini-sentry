"use client";

import { use, useEffect, useState } from "react";
import { ArrowLeft, ChevronLeft, ChevronRight, Loader2, SatelliteDish } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { TypeBadge } from "@/components/dashboard/type-badge";
import { useSession } from "@/hooks/use-session";
import { formatRelativeTime } from "@/lib/format";
import {
  getProject,
  getStats,
  listErrorGroups,
  type ErrorGroup,
  type ErrorType,
  type Pagination,
  type Project,
  type Stats,
} from "@/lib/api";

type SortKey = "lastSeen" | "firstSeen" | "occurrences";

export default function ProjectPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = use(params);
  const { token } = useSession();

  const [project, setProject] = useState<Project | null>(null);
  const [stats, setStats] = useState<Stats | null>(null);

  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [type, setType] = useState<ErrorType | "all">("all");
  const [sort, setSort] = useState<SortKey>("lastSeen");
  const [page, setPage] = useState(1);

  const [groups, setGroups] = useState<ErrorGroup[] | null>(null);
  const [pagination, setPagination] = useState<Pagination | null>(null);

  useEffect(() => {
    const id = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(id);
  }, [search]);

  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, type, sort]);

  useEffect(() => {
    if (!token) return;
    getProject(token, projectId)
      .then(({ project }) => setProject(project))
      .catch(() => setProject(null));
    getStats(token, projectId)
      .then((s) => setStats(s))
      .catch(() => setStats(null));
  }, [token, projectId]);

  useEffect(() => {
    if (!token) return;
    setGroups(null);
    listErrorGroups(token, projectId, {
      page,
      search: debouncedSearch || undefined,
      type: type === "all" ? undefined : type,
      sort,
    })
      .then(({ data, pagination }) => {
        setGroups(data);
        setPagination(pagination);
      })
      .catch(() => {
        setGroups([]);
        setPagination(null);
      });
  }, [token, projectId, page, debouncedSearch, type, sort]);

  const totalPages = pagination ? Math.max(1, Math.ceil(pagination.total / pagination.limit)) : 1;

  return (
    <div>
      <a
        href="/dashboard"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-3.5" />
        Projects
      </a>

      <h1 className="mt-3 text-2xl font-semibold text-foreground">
        {project?.name ?? <span className="text-muted-foreground">…</span>}
      </h1>

      <div className="mt-6 grid gap-4 sm:grid-cols-4">
        <StatCard label="Error groups" value={stats?.errors} />
        <StatCard label="Total events" value={stats?.events} />
        <StatCard label="Active (24h)" value={stats?.activeGroups} />
        <StatCard
          label="Last error"
          value={stats?.lastErrorAt ? formatRelativeTime(stats.lastErrorAt) : stats ? "—" : undefined}
          isText
        />
      </div>

      <div className="mt-8 flex flex-wrap items-center gap-3">
        <Input
          placeholder="Search messages…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-xs"
        />
        <Select value={type} onValueChange={(v) => setType(v as ErrorType | "all")}>
          <SelectTrigger className="w-40">
            <SelectValue placeholder="Type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All types</SelectItem>
            <SelectItem value="error">error</SelectItem>
            <SelectItem value="unhandledrejection">unhandledrejection</SelectItem>
            <SelectItem value="http">http</SelectItem>
            <SelectItem value="resource">resource</SelectItem>
          </SelectContent>
        </Select>
        <Select value={sort} onValueChange={(v) => setSort(v as SortKey)}>
          <SelectTrigger className="w-44">
            <SelectValue placeholder="Sort" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="lastSeen">Last seen</SelectItem>
            <SelectItem value="firstSeen">First seen</SelectItem>
            <SelectItem value="occurrences">Occurrences</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {groups === null && (
        <div className="mt-16 flex justify-center">
          <Loader2 className="size-5 animate-spin text-muted-foreground" />
        </div>
      )}

      {groups !== null && groups.length === 0 && (
        <div className="mt-8 flex flex-col items-center gap-3 rounded-xl border border-dashed border-border py-16 text-center">
          <SatelliteDish className="size-7 text-muted-foreground" strokeWidth={1.5} />
          <p className="text-sm text-muted-foreground">
            {debouncedSearch || type !== "all"
              ? "No errors match these filters."
              : "No errors yet — once your SDK sends its first event, it'll show up here."}
          </p>
        </div>
      )}

      {groups !== null && groups.length > 0 && (
        <>
          <Table className="mt-6">
            <TableHeader>
              <TableRow>
                <TableHead>Message</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Endpoint</TableHead>
                <TableHead className="text-right">Occurrences</TableHead>
                <TableHead className="text-right">Last seen</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {groups.map((g) => (
                <TableRow key={g.id} className="cursor-pointer">
                  <TableCell className="max-w-xs">
                    <a
                      href={`/dashboard/${projectId}/errors/${g.id}`}
                      className="block truncate font-medium text-foreground hover:text-primary"
                    >
                      {g.message}
                    </a>
                  </TableCell>
                  <TableCell>
                    <TypeBadge type={g.type} />
                  </TableCell>
                  <TableCell className="font-mono text-xs text-muted-foreground">
                    {g.endpoint ?? "—"}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {g.occurrenceCount}
                  </TableCell>
                  <TableCell className="text-right text-muted-foreground">
                    {formatRelativeTime(g.lastSeenAt)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>

          {pagination && totalPages > 1 && (
            <div className="mt-4 flex items-center justify-end gap-3">
              <span className="text-xs text-muted-foreground">
                Page {pagination.page} of {totalPages}
              </span>
              <Button
                variant="outline"
                size="icon-sm"
                disabled={page <= 1}
                onClick={() => setPage((p) => p - 1)}
              >
                <ChevronLeft className="size-4" />
              </Button>
              <Button
                variant="outline"
                size="icon-sm"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => p + 1)}
              >
                <ChevronRight className="size-4" />
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function StatCard({
  label,
  value,
  isText,
}: {
  label: string;
  value: number | string | undefined;
  isText?: boolean;
}) {
  return (
    <Card>
      <CardHeader className="pb-0">
        <CardTitle className="text-xs font-medium text-muted-foreground">{label}</CardTitle>
      </CardHeader>
      <CardContent
        className={
          isText
            ? "text-lg font-semibold text-foreground"
            : "font-display text-2xl font-semibold text-foreground tabular-nums"
        }
      >
        {value === undefined ? <Loader2 className="size-4 animate-spin text-muted-foreground" /> : value}
      </CardContent>
    </Card>
  );
}
