/**
 * Names the machine that sends each LLM gateway request in `X-LGW-Client-Host`.
 *
 * The gateway attributes a request-log row to its sending machine only through this header.
 * A native run sends its own short host name. Inside the web or scheduler image (both set
 * `RUNNING_IN_DOCKER=true`) the container's host name is its container id, which names the
 * replica rather than the machine, so the value comes only from the node-name marker the
 * deployment bind-mounts; a missing or invalid marker omits the header and logs one error. The
 * header is diagnostic, so an unusable value never fails a request. Plain `.mjs` so the Node
 * scripts and the TypeScript app share this one owner.
 */
import { Buffer } from "node:buffer";
import { closeSync, constants, fstatSync, openSync, readSync } from "node:fs";
import { hostname } from "node:os";
import { env, stderr } from "node:process";
import { z } from "zod/v4";

export const CLIENT_HOST_HEADER = "X-LGW-Client-Host";
/** Root-owned file holding the Swarm node's short host name, bind-mounted into deployed tasks. */
export const NODE_NAME_MARKER_PATH = "/run/aventure/node-name";
const NODE_NAME_MARKER_MAX_BYTES = 64;
/** The gateway contract admits one DNS label: no leading or trailing hyphen, at most 63 bytes. */
const clientHostSchema = z.string().regex(/^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/);

/** @param {unknown} error */
function errnoCode(error) {
  return typeof error === "object" && error !== null && "code" in error ? String(error.code) : "";
}

/**
 * Reads at most 65 bytes of a regular file; a pipe, directory or device is refused before any read.
 * @param {string} path
 * @returns {string}
 */
function readBoundedMarker(path) {
  const fd = openSync(path, constants.O_RDONLY | constants.O_NONBLOCK);
  try {
    if (!fstatSync(fd).isFile())
      throw Object.assign(new Error("not a regular file"), { code: "ENOTREG" });
    const buffer = Buffer.alloc(NODE_NAME_MARKER_MAX_BYTES + 1);
    return buffer.toString("latin1", 0, readSync(fd, buffer, 0, buffer.length, 0));
  } finally {
    closeSync(fd);
  }
}

/**
 * The sending machine: the marker's node name when it is mounted; null when the marker is invalid
 * or missing inside the image; else the platform host name cut at its first dot and lowercased,
 * or null when that is not a DNS label.
 * @param {{
 *   platformHostName: () => string,
 *   readMarker: (path: string) => string,
 *   containerized: boolean,
 *   report: (message: string) => void,
 * }} runtime
 * @returns {string | null}
 */
export function resolveGatewayClientHost({ platformHostName, readMarker, containerized, report }) {
  /** @param {string} reason */
  const omitted = (reason) => {
    report(
      `[GatewayClientHost] ERROR marker ${NODE_NAME_MARKER_PATH} ignored because ${reason}; requests omit ${CLIENT_HOST_HEADER}. Provision the file (one lowercase DNS label, readable by the app user) and recreate the task.`,
    );
    return null;
  };
  let markerText;
  try {
    markerText = readMarker(NODE_NAME_MARKER_PATH);
  } catch (error) {
    const code = errnoCode(error);
    if (code === "ENOENT") {
      if (containerized) return omitted("it is not mounted in this container");
      const shortHostName = platformHostName().split(".")[0]?.toLowerCase() ?? "";
      return clientHostSchema.safeParse(shortHostName).success ? shortHostName : null;
    }
    return omitted(
      code === "ENOTREG" ? "it is not a regular file" : `it is unreadable (${code || "error"})`,
    );
  }
  if (markerText.length > NODE_NAME_MARKER_MAX_BYTES)
    return omitted(`it is longer than ${NODE_NAME_MARKER_MAX_BYTES} bytes`);
  const nodeName = markerText.endsWith("\n") ? markerText.slice(0, -1) : markerText;
  return clientHostSchema.safeParse(nodeName).success
    ? nodeName
    : omitted(
        "it must hold one lowercase DNS label (a-z, 0-9, hyphen) and at most one trailing line feed",
      );
}

/** @type {{ clientHost: string | null } | undefined} */
let processReading;

/**
 * Headers to add to every gateway request; resolved on first use and kept for the process's life.
 * @returns {Record<string, string>}
 */
export function gatewayClientHostHeaders() {
  processReading ??= {
    clientHost: resolveGatewayClientHost({
      platformHostName: hostname,
      readMarker: readBoundedMarker,
      containerized: env.RUNNING_IN_DOCKER === "true",
      report: (message) => stderr.write(`${message}\n`),
    }),
  };
  return processReading.clientHost ? { [CLIENT_HOST_HEADER]: processReading.clientHost } : {};
}
