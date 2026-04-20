import { startMcpHttpServer, startMcpServer } from "./server.js";

export { createMcpServer, startMcpHttpServer, startMcpServer } from "./server.js";

const isMain = import.meta.url === new URL(process.argv[1] ?? "", "file:").href;

if (isMain) {
  const main = async () => {
    await startMcpServer();
  };

  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
