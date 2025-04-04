# Cursor Azure DevOps MCP Server

[![CI](https://github.com/maximtitovich/cursor-azure-devops-mcp/actions/workflows/ci.yml/badge.svg)](https://github.com/maximtitovich/cursor-azure-devops-mcp/actions/workflows/ci.yml)
[![Publish](https://github.com/maximtitovich/cursor-azure-devops-mcp/actions/workflows/publish.yml/badge.svg)](https://github.com/maximtitovich/cursor-azure-devops-mcp/actions/workflows/publish.yml)
[![Version Bump](https://github.com/maximtitovich/cursor-azure-devops-mcp/actions/workflows/version-bump.yml/badge.svg)](https://github.com/maximtitovich/cursor-azure-devops-mcp/actions/workflows/version-bump.yml)
[![npm version](https://img.shields.io/npm/v/cursor-azure-devops-mcp)](https://www.npmjs.com/package/cursor-azure-devops-mcp)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

A Model Context Protocol (MCP) server for integrating Azure DevOps with Cursor IDE. This tool allows Claude AI in Cursor to interact with Azure DevOps, providing access to projects, work items, repositories, and pull requests.

## Features

- Get Azure DevOps projects
- Retrieve work items by ID
- Fetch multiple work items
- List repositories in a project
- Get pull requests for a repository
- View pull request details and threads
- Retrieve work item attachments (images, PDFs, and other files)
- Get work item comments with metadata (including mentions and reactions)
- Get detailed code changes for pull requests (view file contents before and after changes)
- Create comments on pull requests (with support for replying to existing comments)

## Installation

### Global Installation

```bash
npm install -g cursor-azure-devops-mcp
```

### Local Installation

```bash
npm install cursor-azure-devops-mcp
```

## Configuration

The server can be configured using multiple sources, with the following priority:

1. Command line arguments
2. VSCode/Cursor IDE settings
3. Environment variables / `.env` file
4. Default values

### Command Line Arguments

You can configure the server using command line arguments:

```bash
npx cursor-azure-devops-mcp --azure-org-url=https://dev.azure.com/your-organization --azure-token=your-token --azure-project=YourProject
```

Available options:

| Option | Alias | Description |
|--------|-------|-------------|
| `--azure-org-url` | `--org` | Azure DevOps organization URL |
| `--azure-token` | `--token` | Azure DevOps personal access token |
| `--azure-project` | `--project` | Default Azure DevOps project name |
| `--port` | `-p` | Server port (for HTTP mode) |
| `--host` | `-h` | Server hostname (for HTTP mode) |
| `--log-level` | `--log` | Logging level (error, warn, info, debug) |
| `--help` | `-?` | Show help |

### VSCode/Cursor IDE Settings

You can configure the server in your VSCode or Cursor IDE settings:

1. Global settings: `~/.vscode/settings.json` or `~/.cursor/settings.json`
2. Workspace settings: `.vscode/settings.json` or `.cursor/settings.json`

Example settings:

```json
{
  "azureDevOps.organization": "your-organization",
  "azureDevOps.token": "your-personal-access-token",
  "azureDevOps.project": "YourProject",
  "cursor-azure-devops-mcp": {
    "port": 3000,
    "logLevel": "info"
  }
}
```

### Environment Variables

Create a `.env` file in your project root with the following variables:

```
AZURE_DEVOPS_ORG_URL=https://dev.azure.com/your-organization
AZURE_DEVOPS_TOKEN=your-personal-access-token
AZURE_DEVOPS_PROJECT=YourProject
PORT=3000
LOG_LEVEL=info
```

You can also copy the provided `.env.example` file:

```bash
cp .env.example .env
```

Then edit the file with your Azure DevOps credentials.

## Usage

### Running with npx

The easiest way to use this MCP server is with npx:

```bash
npx cursor-azure-devops-mcp
```

### Setting up in Cursor IDE (Version 0.46.9+)

Cursor IDE supports two methods for connecting to MCP servers: Command mode and SSE mode.

#### Option 1: Command Mode (Recommended)

The Command mode runs the MCP server as a process directly from Cursor. This is the **most reliable method** and should be your first choice:

1. Open Cursor IDE
2. Go to Settings > Features > MCP Servers
3. Click "Add New MCP Server"
4. Enter a name for your server (e.g., "Azure DevOps")
5. Select "command" from the dropdown
6. Enter the command to run the server:
   ```
   cursor-azure-devops-mcp
   ```
   
   If you haven't installed it globally, you can use npx:
   ```
   npx cursor-azure-devops-mcp
   ```

7. Click "Add"

**Important**: When using Command mode, the server will automatically use your environment variables from your system or from a `.env` file in your current working directory. Make sure your `.env` file is properly set up with your Azure DevOps credentials.

**Troubleshooting Command Mode**:

If you encounter the error "server.setRequestHandler is not a function" or similar errors:
1. Make sure you have the latest version of the package installed
2. Try reinstalling the package: `npm install -g cursor-azure-devops-mcp`
3. Check that your `.env` file is correctly set up with your Azure DevOps credentials

#### Option 2: SSE Mode (Alternative)

**Note**: SSE mode is more prone to connection issues. If you're experiencing problems, please use Command mode instead.

The SSE mode connects to an HTTP server with Server-Sent Events:

1. First, start the HTTP server with SSE support:
   ```bash
   npm run sse-server
   ```
   or
   ```bash
   npx cursor-azure-devops-mcp-sse
   ```
   This will start a server on port 3000 by default.

2. Open Cursor IDE
3. Go to Settings > Features > MCP Servers
4. Click "Add New MCP Server"
5. Enter a name for your server (e.g., "Azure DevOps SSE")
6. Select "sse" from the dropdown
7. Enter the SSE endpoint URL:
   ```
   http://localhost:3000/sse
   ```
8. Click "Add"

### Windows Users

If you're using Windows and experiencing issues with the command mode, try this format:

```
cmd /k npx cursor-azure-devops-mcp
```

### mcp.json installation

```
    "azure-devops": {
      "command": "cmd",
      "args": [
        "/c",
        "npx",
        "cursor-azure-devops-mcp",
        "--azure-org-url",
        "https://your-organization.visualstudio.com",
        "--azure-token",
        "your-personal-access-token",
        "--azure-project",
        "your-project"
      ]
    }
```

### Using in Your Code

```javascript
const { McpServer } = require('@modelcontextprotocol/sdk/server/mcp.js');
const { registerTools } = require('cursor-azure-devops-mcp');
const azureDevOpsService = require('cursor-azure-devops-mcp/lib/azure-devops-service');

// Create MCP server
const server = new McpServer({
  name: 'cursor-azure-devops-mcp',
  version: '1.0.0'
});

// Register Azure DevOps tools with the server
registerTools(server, azureDevOpsService);

// Connect to your transport of choice
// ...
```

## Available Tools

| Tool Name                           | Description                         | Required Parameters                                                   |
| ----------------------------------- | ----------------------------------- | --------------------------------------------------------------------- |
| `azure_devops_projects`             | Get all projects                    | None                                                                  |
| `azure_devops_work_item`            | Get a specific work item            | `id` (number)                                                         |
| `azure_devops_work_items`           | Get multiple work items             | `ids` (array of numbers)                                              |
| `azure_devops_repositories`         | Get repositories for a project      | `project` (string)                                                    |
| `azure_devops_pull_requests`        | Get pull requests from a repository | `repositoryId` (string), `project` (string)                           |
| `azure_devops_pull_request_by_id`   | Get a specific pull request         | `repositoryId` (string), `pullRequestId` (number), `project` (string) |
| `azure_devops_pull_request_threads` | Get threads from a pull request     | `repositoryId` (string), `pullRequestId` (number), `project` (string) |
| `azure_devops_work_item_attachments`| Get attachments for a work item     | `id` (number)                                                         |
| `azure_devops_work_item_comments`   | Get comments for a work item        | `id` (number)                                                         |
| `azure_devops_pull_request_changes` | Get detailed PR code changes        | `repositoryId` (string), `pullRequestId` (number), `project` (string) |
| `azure_devops_pull_request_file_content` | Get content of a specific file in a pull request | `repositoryId` (string), `pullRequestId` (number), `filePath` (string), `objectId` (string), `project` (string), optional: `returnPlainText` (boolean), `startPosition` (number), `length` (number) |
| `azure_devops_branch_file_content` | Get file content directly from a branch | `repositoryId` (string), `branchName` (string), `filePath` (string), `project` (string), optional: `returnPlainText` (boolean), `startPosition` (number), `length` (number) |
| `azure_devops_create_pr_comment`    | Create a comment on a pull request  | `repositoryId` (string), `pullRequestId` (number), `project` (string), `content` (string), and other optional parameters |

### File Content Tools

The file content tools (`azure_devops_pull_request_file_content` and `azure_devops_branch_file_content`) provide robust ways to access file content from repositories and pull requests:

- **Complete file retrieval**: By default, returns the complete file as plain text (set `returnPlainText=true` or omit this parameter)
- **Chunked access**: When `returnPlainText=false`, allows accessing large files in chunks by specifying start position and length
- **Parallel chunk retrieval**: Large files are retrieved using multiple parallel requests for better performance
- **5-minute timeout**: Extended timeout to ensure even large files can be retrieved completely
- **Automatic fallback**: If direct object ID access fails, the system will try accessing by branch name
- **Binary file detection**: Binary files are detected and handled appropriately
- **Circular reference handling**: Prevents JSON serialization errors due to circular references
- **Error reporting**: Detailed error messages are provided when file access fails

#### Example Usage:

**Get complete file as plain text (default):**
```json
{
  "repositoryId": "your-repo-id",
  "pullRequestId": 123,
  "filePath": "src/path/to/file.ts",
  "objectId": "file-object-id",
  "project": "YourProject"
}
```

**Get file in chunks with metadata:**
```json
{
  "repositoryId": "your-repo-id",
  "branchName": "main",
  "filePath": "src/path/to/file.ts",
  "project": "YourProject",
  "returnPlainText": false,
  "startPosition": 0,
  "length": 100000
}
```

When accessing large files or files in complex repositories, you may need to:

1. First try `azure_devops_pull_request_file_content` with the object ID from the PR changes and default `returnPlainText=true` to get the complete file
2. If that fails, use `azure_devops_branch_file_content` with the branch name from the PR details
3. For very large binary files, you may need to set `returnPlainText=false` and break down your requests into smaller chunks

## Development

### Prerequisites

- Node.js 18 or higher
- npm or yarn
- Azure DevOps account with a personal access token

### Setup

1. Clone the repository

   ```bash
   git clone https://github.com/yourusername/cursor-azure-devops-mcp.git
   cd cursor-azure-devops-mcp
   ```

2. Install dependencies

   ```bash
   npm install
   ```

3. Create a `.env` file with your Azure DevOps credentials

   ```bash
   cp .env.example .env
   ```

4. Build the TypeScript code
   ```bash
   npm run build
   ```

5. Start the development server
   ```bash
   npm run dev
   ```

### Code Quality

The project uses ESLint and Prettier to maintain code quality and consistent formatting:

1. Format code using Prettier:
   ```bash
   npm run format
   ```

2. Check if code is properly formatted:
   ```bash
   npm run format:check
   ```

3. Lint code using ESLint:
   ```bash
   npm run lint
   ```

4. Fix auto-fixable linting issues:
   ```bash
   npm run lint:fix
   ```

5. Run both format check and linting:
   ```bash
   npm run check
   ```

### TypeScript Implementation

This project is implemented in TypeScript using the latest MCP SDK features:

- Uses ESM modules for better compatibility
- Leverages Zod for schema validation
- Provides proper type definitions
- Follows modern JavaScript/TypeScript best practices

### Testing

To test the connection to Azure DevOps:

```bash
npm run test-connection
```