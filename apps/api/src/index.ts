import { startApiServer } from "./server.js";

export { createAppServer, startApiServer } from "./server.js";

const isMain = import.meta.url === new URL(process.argv[1] ?? "", "file:").href;

if (isMain) {
  const main = async () => {
    const server = await startApiServer();
    console.error(`SynthKit API listening on ${server.rootPath}`);
  };

  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
