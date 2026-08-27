"use client";

import { use, useEffect, useState } from "react";
import { ArrowLeft, ChevronLeft, ChevronRight, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { CodeBlock } from "@/components/landing/code-block";
import { TypeBadge } from "@/components/dashboard/type-badge";
import { useSession } from "@/hooks/use-session";
import { formatRelativeTime } from "@/lib/format";
import {
  getErrorGroup,
  type ErrorGroupDetail,
  type Occurrence,
  type Pagination,
} from "@/lib/api";

export default function ErrorGroupPage({
  params,
}: {
  params: Promise<{ projectId: string; groupId: string }>;
}) {
  const { projectId, groupId } = use(params);
  const { token } = useSession();

  const [group, setGroup] = useState<ErrorGroupDetail | null>(null);
  const [occurrences, setOccurrences] = useState<Occurrence[] | null>(null);
  const [pagination, setPagination] = useState<Pagination | null>(null);
  const [page, setPage] = useState(1);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    if (!token) return;
    setOccurrences(null);
    getErrorGroup(token, projectId, groupId, { page })
      .then(({ group, occurrences }) => {
        setGroup(group);
        setOccurrences(occurrences.data);
        setPagination(occurrences.pagination);
      })
      .catch(() => setNotFound(true));
  }, [token, projectId, groupId, page]);

  const totalPages = pagination ? Math.max(1, Math.ceil(pagination.total / pagination.limit)) : 1;

  if (notFound) {
    return (
      <div className="py-16 text-center text-sm text-muted-foreground">
        This error group doesn&rsquo;t exist, or belongs to a different project.
      </div>
    );
  }

  return (
    <div>
      <a
        href={`/dashboard/${projectId}`}
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-3.5" />
        Back to errors
      </a>

      {!group ? (
        <div className="mt-16 flex justify-center">
          <Loader2 className="size-5 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <>
          <div className="mt-3 flex items-start gap-3">
            <TypeBadge type={group.type} />
            <h1 className="text-xl font-semibold text-foreground">{group.message}</h1>
          </div>

          <dl className="mt-5 grid grid-cols-2 gap-x-8 gap-y-3 text-sm sm:grid-cols-4">
            {group.endpoint && (
              <Field label="Endpoint" value={group.endpoint} mono />
            )}
            {group.statusCode && (
              <Field label="Status" value={String(group.statusCode)} mono />
            )}
            <Field label="Environment" value={group.environment} />
            <Field label="Occurrences" value={String(group.occurrenceCount)} />
            <Field label="First seen" value={formatRelativeTime(group.firstSeenAt)} />
            <Field label="Last seen" value={formatRelativeTime(group.lastSeenAt)} />
          </dl>

          {group.stack && (
            <div className="mt-8">
              <h2 className="mb-2 text-sm font-semibold text-foreground">Stack trace</h2>
              {group.filename && (
                <p className="mb-1.5 font-mono text-xs text-muted-foreground">
                  {group.filename}
                  {group.line ? `:${group.line}` : ""}
                  {group.column ? `:${group.column}` : ""}
                </p>
              )}
              <CodeBlock code={group.stack} lang="text" label="stack" />
            </div>
          )}

          <h2 className="mt-8 mb-2 text-sm font-semibold text-foreground">Occurrences</h2>

          {occurrences === null ? (
            <div className="flex justify-center py-10">
              <Loader2 className="size-5 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Time</TableHead>
                    <TableHead>URL</TableHead>
                    <TableHead>Method</TableHead>
                    <TableHead className="text-right">Status</TableHead>
                    <TableHead>Browser</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {occurrences.map((o) => (
                    <TableRow key={o.id}>
                      <TableCell className="whitespace-nowrap text-muted-foreground">
                        {formatRelativeTime(o.timestamp)}
                      </TableCell>
                      <TableCell className="max-w-56 truncate font-mono text-xs">
                        {o.url}
                      </TableCell>
                      <TableCell className="font-mono text-xs">{o.method ?? "—"}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {o.statusCode ?? "—"}
                      </TableCell>
                      <TableCell className="max-w-40 truncate text-xs text-muted-foreground">
                        {o.browser}
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
        </>
      )}
    </div>
  );
}

function Field({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className={mono ? "font-mono text-sm text-foreground" : "text-sm text-foreground"}>
        {value}
      </dd>
    </div>
  );
}
