// @vitest-environment node
import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { once } from "node:events";

it("reuses unchanged desired deployments but submits a new identity after runtime configuration changes", async () => {
  const image = `registry.example.com/scheduler:reviewed@sha256:${"a".repeat(64)}`;
  let runtimeEnv = "AUDIOBOOKSHELF_URL=${{vault.production.AUDIOBOOKSHELF_URL}}";
  const keys: string[] = [];
  const server = createServer(async (request, response) => {
    response.setHeader("content-type", "application/json");
    const path = request.url?.split("?")[0];
    if (path === "/api/application.one") {
      response.end(
        JSON.stringify({
          sourceType: "docker",
          dockerImage: image,
          autoDeploy: false,
          registryId: "registry",
          username: null,
          password: null,
          registryUrl: null,
          labelsSwarm: { "otel.service.version": "reviewed" },
          env: runtimeEnv,
        }),
      );
    } else if (path === "/api/application.deploy") {
      let body = "";
      for await (const chunk of request) body += String(chunk);
      const parsed: unknown = JSON.parse(body);
      if (
        parsed &&
        typeof parsed === "object" &&
        "idempotencyKey" in parsed &&
        typeof parsed.idempotencyKey === "string"
      ) {
        keys.push(parsed.idempotencyKey);
        response.end(JSON.stringify({ deploymentId: "deployment" }));
      } else {
        response.writeHead(400).end();
      }
    } else if (path === "/api/deployment.all") {
      response.end(JSON.stringify([{ deploymentId: "deployment", status: "done" }]));
    } else {
      response.writeHead(404).end();
    }
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Expected local HTTP listener");
  const run = async () => {
    const child = spawn("bash", ["scripts/dokploy-deploy-image.sh", image], {
      env: {
        ...process.env,
        DOKPLOY_URL: `http://127.0.0.1:${address.port}`,
        DOKPLOY_API_KEY: "fixture",
        DOKPLOY_APPLICATION_ID: "scheduler",
        GITHUB_SHA: "reviewed",
      },
      stdio: ["ignore", "ignore", "pipe"],
    });
    const [code] = await once(child, "exit");
    expect(code).toBe(0);
  };
  try {
    await run();
    await run();
    runtimeEnv += "\nAUDIOBOOKSHELF_API_KEY=${{vault.production.AUDIOBOOKSHELF_API_KEY}}";
    await run();
    expect(keys).toHaveLength(3);
    expect(keys[0]).toBe(keys[1]);
    expect(keys[2]).not.toBe(keys[1]);
  } finally {
    server.close();
    await once(server, "close");
  }
});
