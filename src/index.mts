#!/usr/bin/env node

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import * as os from "os";
import * as fs from "fs";
import * as path from "path";
import { spawnPromise } from "spawn-rx";

// Strategy Pattern for installation methods
interface InstallationStrategy {
  install(name: string, cmd: string, args: string[], env?: string[]): Promise<void>;
  getMethodName(): string;
  getSuccessMessage(): string;
}

class ClaudeCliStrategy implements InstallationStrategy {
  async install(name: string, cmd: string, args: string[], env?: string[]): Promise<void> {
    // First, try to remove any existing server with the same name
    try {
      await spawnPromise("claude", ["mcp", "remove", name], { stdio: "ignore" });
    } catch (e) {
      // Ignore errors - server might not exist
    }

    // Build the claude mcp add command
    const claudeArgs = ["mcp", "add", name, cmd];
    
    // Add arguments if provided
    if (args && args.length > 0) {
      claudeArgs.push("--args");
      claudeArgs.push(...args);
    }

    // Add environment variables if provided
    if (env && env.length > 0) {
      for (const envVar of env) {
        claudeArgs.push("--env");
        claudeArgs.push(envVar);
      }
    }

    // Execute the claude mcp add command
    await spawnPromise("claude", claudeArgs);
  }

  getMethodName(): string {
    return "Claude CLI";
  }

  getSuccessMessage(): string {
    return "Server is now available!";
  }
}

class ClaudeDesktopStrategy implements InstallationStrategy {
  async install(name: string, cmd: string, args: string[], env?: string[]): Promise<void> {
    const configPath =
      process.platform === "win32"
        ? path.join(
            os.homedir(),
            "AppData",
            "Roaming",
            "Claude",
            "claude_desktop_config.json"
          )
        : path.join(
            os.homedir(),
            "Library",
            "Application Support",
            "Claude",
            "claude_desktop_config.json"
          );

    let config: any;
    try {
      config = JSON.parse(fs.readFileSync(configPath, "utf8"));
    } catch (e) {
      config = {};
    }

    const envObj = (env ?? []).reduce((acc, val) => {
      const [key, value] = val.split("=");
      acc[key] = value;

      return acc;
    }, {} as Record<string, string>);

    const newServer = {
      command: cmd,
      args: args,
      ...(env ? { env: envObj } : {}),
    };

    const mcpServers = config.mcpServers ?? {};
    mcpServers[name] = newServer;
    config.mcpServers = mcpServers;
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
  }

  getMethodName(): string {
    return "Claude Desktop config";
  }

  getSuccessMessage(): string {
    return "Tell the user to restart the app";
  }
}

// Strategy detection and selection
async function detectInstallationStrategy(): Promise<InstallationStrategy> {
  if (await hasClaudeCLI()) {
    return new ClaudeCliStrategy();
  }
  return new ClaudeDesktopStrategy();
}

// Global strategy instance - initialized at startup
let installationStrategy: InstallationStrategy;

const server = new Server(
  {
    name: "mcp-installer",
    version: "0.6.0",
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "install_repo_mcp_server",
        description: "Install an MCP server via npx or uvx",
        inputSchema: {
          type: "object",
          properties: {
            name: {
              type: "string",
              description: "The package name of the MCP server",
            },
            args: {
              type: "array",
              items: { type: "string" },
              description: "The arguments to pass along",
            },
            env: {
              type: "array",
              items: { type: "string" },
              description: "The environment variables to set, delimited by =",
            },
          },
          required: ["name"],
        },
      },
      {
        name: "install_local_mcp_server",
        description:
          "Install an MCP server whose code is cloned locally on your computer",
        inputSchema: {
          type: "object",
          properties: {
            path: {
              type: "string",
              description:
                "The path to the MCP server code cloned on your computer",
            },
            args: {
              type: "array",
              items: { type: "string" },
              description: "The arguments to pass along",
            },
            env: {
              type: "array",
              items: { type: "string" },
              description: "The environment variables to set, delimited by =",
            },
          },
          required: ["path"],
        },
      },
    ],
  };
});

async function hasNodeJs() {
  try {
    await spawnPromise("node", ["--version"]);
    return true;
  } catch (e) {
    return false;
  }
}

async function hasUvx() {
  try {
    await spawnPromise("uvx", ["--version"]);
    return true;
  } catch (e) {
    return false;
  }
}

async function hasClaudeCLI() {
  try {
    await spawnPromise("claude", ["--version"]);
    return true;
  } catch (e) {
    return false;
  }
}

async function isNpmPackage(name: string) {
  try {
    await spawnPromise("npm", ["view", name, "version"]);
    return true;
  } catch (e) {
    return false;
  }
}


async function installRepoWithArgs(
  name: string,
  npmIfTrueElseUvx: boolean,
  args?: string[],
  env?: string[]
) {
  // If the name is in a scoped package, we need to remove the scope
  const serverName = /^@.*\//i.test(name) ? name.split("/")[1] : name;

  // Use the pre-selected strategy
  await installationStrategy.install(
    serverName,
    npmIfTrueElseUvx ? "npx" : "uvx",
    [name, ...(args ?? [])],
    env
  );
}


async function attemptNodeInstall(
  directory: string
): Promise<Record<string, string>> {
  await spawnPromise("npm", ["install"], { cwd: directory });

  // Run down package.json looking for bins
  const pkg = JSON.parse(
    fs.readFileSync(path.join(directory, "package.json"), "utf-8")
  );

  if (pkg.bin) {
    return Object.keys(pkg.bin).reduce((acc, key) => {
      acc[key] = path.resolve(directory, pkg.bin[key]);
      return acc;
    }, {} as Record<string, string>);
  }

  if (pkg.main) {
    return { [pkg.name]: path.resolve(directory, pkg.main) };
  }

  return {};
}

async function installLocalMcpServer(
  dirPath: string,
  args?: string[],
  env?: string[]
) {
  if (!fs.existsSync(dirPath)) {
    return {
      content: [
        {
          type: "text",
          text: `Path ${dirPath} does not exist locally!`,
        },
      ],
      isError: true,
    };
  }

  if (fs.existsSync(path.join(dirPath, "package.json"))) {
    const servers = await attemptNodeInstall(dirPath);

    // Install all servers using the pre-selected strategy
    for (const [name, serverPath] of Object.entries(servers)) {
      await installationStrategy.install(
        name,
        "node",
        [serverPath, ...(args ?? [])],
        env
      );
    }

    return {
      content: [
        {
          type: "text",
          text: `Installed the following servers via ${installationStrategy.getMethodName()} successfully! ${Object.keys(
            servers
          ).join(";")} ${installationStrategy.getSuccessMessage()}`,
        },
      ],
    };
  }

  return {
    content: [
      {
        type: "text",
        text: `Can't figure out how to install ${dirPath}`,
      },
    ],
    isError: true,
  };
}

async function installRepoMcpServer(
  name: string,
  args?: string[],
  env?: string[]
) {
  if (!(await hasNodeJs())) {
    return {
      content: [
        {
          type: "text",
          text: `Node.js is not installed, please install it!`,
        },
      ],
      isError: true,
    };
  }

  if (await isNpmPackage(name)) {
    await installRepoWithArgs(name, true, args, env);

    return {
      content: [
        {
          type: "text",
          text: `Installed MCP server via npx using ${installationStrategy.getMethodName()} successfully! ${installationStrategy.getSuccessMessage()}`,
        },
      ],
    };
  }

  if (!(await hasUvx())) {
    return {
      content: [
        {
          type: "text",
          text: `Python uv is not installed, please install it! Tell users to go to https://docs.astral.sh/uv`,
        },
      ],
      isError: true,
    };
  }

  await installRepoWithArgs(name, false, args, env);

  return {
    content: [
      {
        type: "text",
        text: `Installed MCP server via uvx using ${installationStrategy.getMethodName()} successfully! ${installationStrategy.getSuccessMessage()}`,
      },
    ],
  };
}

server.setRequestHandler(CallToolRequestSchema, async (request: any) => {
  try {
    if (request.params.name === "install_repo_mcp_server") {
      const { name, args, env } = request.params.arguments as {
        name: string;
        args?: string[];
        env?: string[];
      };

      return await installRepoMcpServer(name, args, env);
    }

    if (request.params.name === "install_local_mcp_server") {
      const dirPath = request.params.arguments!.path as string;
      const { args, env } = request.params.arguments as {
        args?: string[];
        env?: string[];
      };

      return await installLocalMcpServer(dirPath, args, env);
    }

    throw new Error(`Unknown tool: ${request.params.name}`);
  } catch (err) {
    return {
      content: [
        {
          type: "text",
          text: `Error setting up package: ${err}`,
        },
      ],
      isError: true,
    };
  }
});

async function runServer() {
  // Initialize installation strategy at startup
  installationStrategy = await detectInstallationStrategy();
  
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

runServer().catch(console.error);
