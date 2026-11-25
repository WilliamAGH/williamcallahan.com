import { describe, expect, it } from "vitest";
import { resolveGatewayClientHost } from "@/lib/ai/openai-compatible/gateway-client-host.mjs";

const CONTAINER_ID_HOST_NAME = "3f9c2a7b81d4";
const missingMarker = (): string => {
  throw Object.assign(new Error("missing"), { code: "ENOENT" });
};

function resolveWith(args: {
  platformHostName: string;
  readMarker: (path: string) => string;
  containerized: boolean;
}) {
  const reports: string[] = [];
  const clientHost = resolveGatewayClientHost({
    platformHostName: () => args.platformHostName,
    readMarker: args.readMarker,
    containerized: args.containerized,
    report: (message) => reports.push(message),
  });
  return { clientHost, reports };
}

describe("gateway client host", () => {
  it("sends the lowercased short host name on a native run", () => {
    expect(
      resolveWith({
        platformHostName: "Build-Node-3.tail.example.net",
        readMarker: missingMarker,
        containerized: false,
      }),
    ).toEqual({ clientHost: "build-node-3", reports: [] });
    expect(
      resolveWith({
        platformHostName: "-build_node.local",
        readMarker: missingMarker,
        containerized: false,
      }).clientHost,
    ).toBeNull();
  });

  it("sends the mounted node name instead of the container id", () => {
    expect(
      resolveWith({
        platformHostName: CONTAINER_ID_HOST_NAME,
        readMarker: () => "swarm-worker-2\n",
        containerized: true,
      }),
    ).toEqual({ clientHost: "swarm-worker-2", reports: [] });
  });

  it("omits the header and reports one error when the container has no marker", () => {
    const { clientHost, reports } = resolveWith({
      platformHostName: CONTAINER_ID_HOST_NAME,
      readMarker: missingMarker,
      containerized: true,
    });
    expect(clientHost).toBeNull();
    expect(reports).toHaveLength(1);
  });

  it("omits the header when the marker is not one lowercase DNS label", () => {
    expect(
      resolveWith({
        platformHostName: CONTAINER_ID_HOST_NAME,
        readMarker: () => "Swarm-Worker-2\n",
        containerized: true,
      }).clientHost,
    ).toBeNull();
  });
});
