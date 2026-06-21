import { appendFile, mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

function sanitizeFileSegment(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9-_]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80) || "item";
}

export class StructuredRunLogger {
  readonly runId: string;
  readonly directory: string;
  readonly eventsPath: string;
  private queue: Promise<void>;

  constructor(scope: string, campaignId: number) {
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    this.runId = `${scope}-campaign-${campaignId}-${stamp}`;
    this.directory = join(process.cwd(), "storage", "discovery-logs", this.runId);
    this.eventsPath = join(this.directory, "events.jsonl");
    this.queue = mkdir(this.directory, { recursive: true }).then(async () => {
      await writeFile(
        join(this.directory, "meta.json"),
        JSON.stringify(
          {
            runId: this.runId,
            scope,
            campaignId,
            startedAt: new Date().toISOString()
          },
          null,
          2
        ),
        "utf8"
      );
    });
  }

  append(event: Record<string, unknown>): void {
    this.queue = this.queue.then(() =>
      appendFile(this.eventsPath, `${JSON.stringify(event)}\n`, "utf8")
    );
  }

  writeHtmlArtifact(label: string, html: string, meta?: Record<string, unknown>): string {
    const filename = `${Date.now()}-${sanitizeFileSegment(label)}.html`;
    const filePath = join(this.directory, filename);
    this.queue = this.queue.then(async () => {
      await writeFile(filePath, html, "utf8");
      if (meta) {
        await appendFile(
          this.eventsPath,
          `${JSON.stringify({
            at: new Date().toISOString(),
            kind: "html_artifact",
            label,
            path: filePath,
            meta
          })}\n`,
          "utf8"
        );
      }
    });
    return filePath;
  }

  writeJsonArtifact(label: string, payload: unknown, meta?: Record<string, unknown>): string {
    const filename = `${Date.now()}-${sanitizeFileSegment(label)}.json`;
    const filePath = join(this.directory, filename);
    this.queue = this.queue.then(async () => {
      await writeFile(filePath, JSON.stringify(payload, null, 2), "utf8");
      await appendFile(
        this.eventsPath,
        `${JSON.stringify({
          at: new Date().toISOString(),
          kind: "json_artifact",
          label,
          path: filePath,
          meta
        })}\n`,
        "utf8"
      );
    });
    return filePath;
  }

  async flush(): Promise<void> {
    await this.queue;
  }
}
