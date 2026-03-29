import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import type { MemoryType, SourceType } from "../types.js";

export type CollectedProjectSource = {
  sourceType: SourceType;
  sourceRef: string;
  title: string;
  content: string;
  uri: string;
  memoryType: MemoryType;
};

export function collectProjectSources(
  projectRoot: string,
): CollectedProjectSource[] {
  const sources: CollectedProjectSource[] = [];

  sources.push(
    ...collectMarkdownFiles(path.join(projectRoot, ".omx"), projectRoot).map(
      (file) => readProjectSource(projectRoot, file, "conversation", "summary"),
    ),
  );

  const readmePath = path.join(projectRoot, "README.md");
  if (fs.existsSync(readmePath)) {
    sources.push(
      readProjectSource(projectRoot, readmePath, "document", "summary"),
    );
  }

  sources.push(
    ...collectMarkdownFiles(path.join(projectRoot, "docs"), projectRoot).map(
      (file) => {
        const isDecisionDocument = path
          .basename(file, path.extname(file))
          .toLowerCase()
          .includes("decision");

        return readProjectSource(
          projectRoot,
          file,
          isDecisionDocument ? "decision" : "document",
          isDecisionDocument ? "decision" : "summary",
        );
      },
    ),
  );

  const gitLogPath = path.join(projectRoot, "git-log.txt");
  if (fs.existsSync(gitLogPath)) {
    sources.push(readProjectSource(projectRoot, gitLogPath, "document", "fact"));
  }

  return sources;
}

function collectMarkdownFiles(
  rootDir: string,
  projectRoot: string,
): string[] {
  if (!fs.existsSync(rootDir)) {
    return [];
  }

  return walkFiles(rootDir)
    .filter((file) => path.extname(file).toLowerCase() === ".md")
    .filter((file) => isWithinProject(projectRoot, file))
    .sort((left, right) => left.localeCompare(right));
}

function walkFiles(rootDir: string): string[] {
  const entries = fs
    .readdirSync(rootDir, { withFileTypes: true })
    .sort((left, right) => left.name.localeCompare(right.name));

  const files: string[] = [];

  for (const entry of entries) {
    const nextPath = path.join(rootDir, entry.name);

    if (entry.isDirectory()) {
      files.push(...walkFiles(nextPath));
      continue;
    }

    if (entry.isFile()) {
      files.push(nextPath);
    }
  }

  return files;
}

function isWithinProject(projectRoot: string, filePath: string): boolean {
  const relativePath = path.relative(projectRoot, filePath);
  return relativePath !== "" && !relativePath.startsWith("..");
}

function readProjectSource(
  projectRoot: string,
  filePath: string,
  sourceType: SourceType,
  memoryType: MemoryType,
): CollectedProjectSource {
  const content = fs.readFileSync(filePath, "utf8").trim();
  const relativePath = toSourceRef(projectRoot, filePath);

  const source = {
    sourceType,
    sourceRef: relativePath,
    title: path.basename(filePath, path.extname(filePath)),
    content,
    uri: pathToFileURL(filePath).toString(),
    memoryType,
  };

  if (source.content.length === 0) {
    throw new Error(`Refusing to ingest empty approved source: ${relativePath}`);
  }

  return source;
}

function toSourceRef(projectRoot: string, filePath: string): string {
  return path.relative(projectRoot, filePath).split(path.sep).join("/");
}
