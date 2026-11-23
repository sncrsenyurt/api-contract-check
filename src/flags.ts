export class FlagError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FlagError";
  }
}

export type HeaderPair = {
  name: string;
  value: string;
};

export type ParsedArgs =
  | { help: true }
  | {
      help: false;
      spec: string;
      baseUrl: string;
      headers: HeaderPair[];
      outDir: string;
      timeoutMs: number;
      only: string[];
      skip: string[];
    };

const DEFAULT_OUT = "./contract-out";
const DEFAULT_TIMEOUT_MS = 30_000;

export function usage(): string {
  return [
    "api-contract-check <spec> --base-url <url> [options]",
    "",
    "--base-url <url>        where the api is running",
    "--header <name:value>   extra request header, can be repeated",
    "--out <dir>             report directory, default ./contract-out",
    "--timeout <ms>          request timeout in milliseconds, default 30000",
    "--only <id or METHOD /path>   run just these, can be repeated",
    "--skip <id or METHOD /path>   leave these out, can be repeated",
  ].join("\n");
}

export function parseFlags(argv: string[]): ParsedArgs {
  if (argv.includes("--help") || argv.includes("-h")) {
    return { help: true };
  }

  let spec: string | undefined;
  let baseUrl: string | undefined;
  let outDir = DEFAULT_OUT;
  let timeoutMs = DEFAULT_TIMEOUT_MS;
  const headers: HeaderPair[] = [];
  const only: string[] = [];
  const skip: string[] = [];

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];

    if (arg === "--base-url" || arg.startsWith("--base-url=")) {
      const value = readValue(argv, arg, i, "--base-url");
      i = value.next;
      baseUrl = checkBaseUrl(value.text);
      continue;
    }

    if (arg === "--header" || arg.startsWith("--header=")) {
      const value = readValue(argv, arg, i, "--header");
      i = value.next;
      headers.push(splitHeader(value.text));
      continue;
    }

    if (arg === "--out" || arg.startsWith("--out=")) {
      const value = readValue(argv, arg, i, "--out");
      i = value.next;
      if (!value.text.trim()) throw new FlagError("--out needs a directory");
      outDir = value.text;
      continue;
    }

    if (arg === "--timeout" || arg.startsWith("--timeout=")) {
      const value = readValue(argv, arg, i, "--timeout");
      i = value.next;
      timeoutMs = checkTimeout(value.text);
      continue;
    }

    if (arg === "--only" || arg.startsWith("--only=")) {
      const value = readValue(argv, arg, i, "--only");
      i = value.next;
      if (!value.text.trim()) throw new FlagError("--only needs an operation");
      only.push(value.text.trim());
      continue;
    }

    if (arg === "--skip" || arg.startsWith("--skip=")) {
      const value = readValue(argv, arg, i, "--skip");
      i = value.next;
      if (!value.text.trim()) throw new FlagError("--skip needs an operation");
      skip.push(value.text.trim());
      continue;
    }

    if (arg.startsWith("-")) {
      throw new FlagError(`unknown flag ${arg}`);
    }

    if (spec !== undefined) {
      throw new FlagError(`unexpected argument ${arg}`);
    }

    spec = arg;
  }

  if (!spec) throw new FlagError("missing spec path or url");
  if (!baseUrl) throw new FlagError("missing --base-url");

  return { help: false, spec, baseUrl, headers, outDir, timeoutMs, only, skip };
}

function readValue(
  argv: string[],
  arg: string,
  index: number,
  flag: string,
): { text: string; next: number } {
  const eq = `${flag}=`;
  if (arg.startsWith(eq)) {
    const text = arg.slice(eq.length);
    if (!text) throw new FlagError(`${flag} needs a value`);
    return { text, next: index };
  }

  const text = argv[index + 1];
  if (text === undefined) throw new FlagError(`${flag} needs a value`);
  return { text, next: index + 1 };
}

function checkBaseUrl(value: string): string {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new FlagError(`--base-url is not a url: ${value}`);
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new FlagError("--base-url must be http or https");
  }

  return value;
}

function checkTimeout(value: string): number {
  if (!/^\d+$/.test(value) || Number(value) === 0) {
    throw new FlagError("--timeout must be a positive whole number of milliseconds");
  }
  return Number(value);
}

function splitHeader(raw: string): HeaderPair {
  // bearer tokens contain colons, so only the first one splits the name off
  const colon = raw.indexOf(":");
  if (colon <= 0) throw new FlagError("--header must look like name:value");

  const name = raw.slice(0, colon).trim();
  const value = raw.slice(colon + 1).trim();
  if (!name || /\s/.test(name)) {
    throw new FlagError("--header must look like name:value");
  }

  return { name, value };
}
