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
  return APPROVED_PROJECT_SOURCES.flatMap((source) => {
    const filePath = path.join(projectRoot, source.sourceRef);

    if (!fs.existsSync(filePath)) {
      return [];
    }

    return [
      readProjectSource(
        projectRoot,
        filePath,
        source.sourceType,
        source.memoryType,
      ),
    ];
  });
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

const APPROVED_PROJECT_SOURCES: ReadonlyArray<{
  sourceRef: string;
  sourceType: SourceType;
  memoryType: MemoryType;
}> = [
  {
    sourceRef: ".omx/context/session-1.md",
    sourceType: "conversation",
    memoryType: "summary",
  },
  {
    sourceRef: "README.md",
    sourceType: "document",
    memoryType: "summary",
  },
  {
    sourceRef: "docs/decision-log.md",
    sourceType: "decision",
    memoryType: "decision",
  },
  {
    sourceRef: "git-log.txt",
    sourceType: "document",
    memoryType: "fact",
  },
];
