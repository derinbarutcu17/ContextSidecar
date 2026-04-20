import { SynthKitApiClient } from "@synthkit/sdk-ts";

const client = new SynthKitApiClient({ baseUrl: "http://127.0.0.1:8787" });

const main = async () => {
  const project = await client.createProject({ name: "SDK demo" });
  await client.ingestText(project.id, { text: "We need a brief with citations.", title: "Notes" });
  const bundle = await client.synthesize(project.id, { mode: "brief", title: "SDK demo synthesis" });
  console.log(bundle);
};

main();

