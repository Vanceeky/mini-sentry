import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CodeBlock } from "./code-block";

const NPM_INSTALL = `npm install @vanceeq/canary`;

const NPM_INIT = `import { init } from "@vanceeq/canary";

init({
  apiKey: "your_project_key",
  endpoint: "https://your-backend.example.com/api/v1/events",
});`;

const SCRIPT_TAG = `<script src="/canary.min.js"></script>
<script>
  Canary.init({
    apiKey: "your_project_key",
    endpoint: "https://your-backend.example.com/api/v1/events",
  });
</script>`;

const CONFIG_ROWS = [
  { key: "apiKey", type: "string", def: "required", note: "your project's API key, from the create-project screen" },
  { key: "endpoint", type: "string", def: "none", note: "if omitted, events are captured but never sent" },
  { key: "enabled", type: "boolean", def: "true", note: "false puts the SDK in no-op mode" },
];

const CAPTURES = [
  "Uncaught JS errors and unhandled promise rejections",
  "Non-2xx fetch responses and outright network failures",
  "Nothing from XMLHttpRequest — only fetch is wrapped",
];

export function SdkDocs() {
  return (
    <section id="docs" className="border-t border-border bg-background py-24">
      <div className="mx-auto max-w-4xl px-6">
        <span className="font-mono text-xs tracking-widest text-primary uppercase">
          SDK
        </span>
        <h2 className="mt-3 text-3xl font-semibold text-foreground sm:text-4xl">
          Install in under a minute.
        </h2>
        <p className="mt-4 max-w-xl text-muted-foreground">
          Framework-agnostic — no React/Vue/Angular dependency. Pick whichever
          fits your stack; both call the same <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-[0.85em]">init()</code>.
        </p>

        <Tabs defaultValue="npm" className="mt-10">
          <TabsList>
            <TabsTrigger value="npm">npm / bundler</TabsTrigger>
            <TabsTrigger value="script">Script tag</TabsTrigger>
          </TabsList>

          <TabsContent value="npm" className="mt-5 space-y-4">
            <CodeBlock code={NPM_INSTALL} lang="bash" />
            <CodeBlock code={NPM_INIT} lang="ts" label="index.ts" />
          </TabsContent>

          <TabsContent value="script" className="mt-5 space-y-4">
            <CodeBlock code={SCRIPT_TAG} lang="html" label="index.html" />
            <p className="text-sm text-muted-foreground">
              Not on a public CDN yet — run <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-[0.85em]">npm run build -w sdk</code>{" "}
              in the SDK repo, copy the generated{" "}
              <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-[0.85em]">dist/canary.min.js</code>{" "}
              into your own static assets, and reference it from there.
            </p>
          </TabsContent>
        </Tabs>

        <div className="mt-14 grid gap-10 sm:grid-cols-2">
          <div>
            <h3 className="text-sm font-semibold text-foreground">Config</h3>
            <div className="mt-4 overflow-hidden rounded-lg border border-border">
              <table className="w-full text-sm">
                <tbody>
                  {CONFIG_ROWS.map((r, i) => (
                    <tr key={r.key} className={i > 0 ? "border-t border-border" : ""}>
                      <td className="px-3 py-2.5 align-top font-mono text-[0.82rem] text-foreground whitespace-nowrap">
                        {r.key}
                      </td>
                      <td className="px-3 py-2.5 align-top text-muted-foreground">
                        {r.note}
                        <span className="ml-1.5 font-mono text-[0.72rem] text-muted-foreground/70">
                          ({r.type}, default {r.def})
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div>
            <h3 className="text-sm font-semibold text-foreground">What it captures</h3>
            <ul className="mt-4 space-y-2.5">
              {CAPTURES.map((c) => (
                <li key={c} className="flex gap-2.5 text-sm text-muted-foreground">
                  <span className="mt-1.5 size-1 shrink-0 rounded-full bg-primary" />
                  {c}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </section>
  );
}
