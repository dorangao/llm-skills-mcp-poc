import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createSkillsMcpServer } from "./server.js";

const server = createSkillsMcpServer();
const transport = new StdioServerTransport();

await server.connect(transport);
