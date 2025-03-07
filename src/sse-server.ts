#!/usr/bin/env node

import express from 'express';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import { z } from 'zod';
import { azureDevOpsService } from './azure-devops-service.js';
import { config } from './config.js';

// Create Express app
const app = express();
const PORT = config.server.port;

// Define a type that extends McpServer to include transport property
interface ExtendedMcpServer extends McpServer {
  transport?: SSEServerTransport;
  closeHandler?: () => void;
}

// Store active MCP servers
const servers: ExtendedMcpServer[] = [];

// Enable CORS for all requests
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
  
  // Handle OPTIONS requests immediately
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  
  next();
});

// Serve basic info at root
app.get('/', (req, res) => {
  res.send(`
    <h1>Azure DevOps MCP Server</h1>
    <p>Status: Running</p>
    <p>SSE endpoint: <a href="/sse">/sse</a></p>
    <p>Version: ${config.version}</p>
    <p>Active connections: ${servers.length}</p>
  `);
});

// SSE endpoint - this is what Cursor connects to
app.get('/sse', async (req, res) => {
  console.log('New SSE connection request from:', req.headers['user-agent']);
  
  // NOTE: Do NOT set headers manually here - the SSEServerTransport will do this
  
  try {
    // Create transport with message endpoint
    const transport = new SSEServerTransport('/message', res);
    
    // Create and configure MCP server
    const server: ExtendedMcpServer = new McpServer({
      name: 'cursor-azure-devops-mcp',
      version: '1.0.0',
      description: 'Azure DevOps integration for Cursor IDE'
    });
    
    // Register Azure DevOps tools
    server.tool(
      'azure_devops_projects',
      'Get projects from Azure DevOps',
      {},
      async () => {
        const result = await azureDevOpsService.getProjects();
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(result, null, 2)
            }
          ]
        };
      }
    );
    
    server.tool(
      'azure_devops_work_item',
      'Get a specific work item by ID',
      {
        id: z.number().describe('Work item ID')
      },
      async ({ id }) => {
        const result = await azureDevOpsService.getWorkItem(id);
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(result, null, 2)
            }
          ]
        };
      }
    );
    
    server.tool(
      'azure_devops_work_items',
      'Get multiple work items by IDs',
      {
        ids: z.array(z.number()).describe('Array of work item IDs')
      },
      async ({ ids }) => {
        const result = await azureDevOpsService.getWorkItems(ids);
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(result, null, 2)
            }
          ]
        };
      }
    );
    
    server.tool(
      'azure_devops_repositories',
      'Get repositories for a project',
      {
        project: z.string().describe('Project name')
      },
      async ({ project }) => {
        const result = await azureDevOpsService.getRepositories(project);
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(result, null, 2)
            }
          ]
        };
      }
    );
    
    server.tool(
      'azure_devops_pull_requests',
      'Get pull requests from a repository',
      {
        repositoryId: z.string().describe('Repository ID'),
        project: z.string().describe('Project name')
      },
      async ({ repositoryId, project }) => {
        const result = await azureDevOpsService.getPullRequests(repositoryId, project);
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(result, null, 2)
            }
          ]
        };
      }
    );
    
    server.tool(
      'azure_devops_pull_request_by_id',
      'Get a specific pull request by ID',
      {
        repositoryId: z.string().describe('Repository ID'),
        pullRequestId: z.number().describe('Pull request ID'),
        project: z.string().describe('Project name')
      },
      async ({ repositoryId, pullRequestId, project }) => {
        const result = await azureDevOpsService.getPullRequestById(repositoryId, pullRequestId, project);
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(result, null, 2)
            }
          ]
        };
      }
    );
    
    server.tool(
      'azure_devops_pull_request_threads',
      'Get threads from a pull request',
      {
        repositoryId: z.string().describe('Repository ID'),
        pullRequestId: z.number().describe('Pull request ID'),
        project: z.string().describe('Project name')
      },
      async ({ repositoryId, pullRequestId, project }) => {
        const result = await azureDevOpsService.getPullRequestThreads(repositoryId, pullRequestId, project);
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(result, null, 2)
            }
          ]
        };
      }
    );
    
    // New tool for work item attachments
    server.tool(
      'azure_devops_work_item_attachments',
      'Get attachments for a specific work item',
      {
        id: z.number().describe('Work item ID')
      },
      async ({ id }) => {
        const result = await azureDevOpsService.getWorkItemAttachments(id);
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(result, null, 2)
            }
          ]
        };
      }
    );
    
    // New tool for pull request changes with file contents
    server.tool(
      'azure_devops_pull_request_changes',
      'Get detailed code changes for a pull request',
      {
        repositoryId: z.string().describe('Repository ID'),
        pullRequestId: z.number().describe('Pull request ID'),
        project: z.string().describe('Project name')
      },
      async ({ repositoryId, pullRequestId, project }) => {
        const result = await azureDevOpsService.getPullRequestChanges(repositoryId, pullRequestId, project);
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(result, null, 2)
            }
          ]
        };
      }
    );
    
    // New tool for creating pull request comments
    server.tool(
      'azure_devops_create_pr_comment',
      'Create a comment on a pull request',
      {
        repositoryId: z.string().describe('Repository ID'),
        pullRequestId: z.number().describe('Pull request ID'),
        project: z.string().describe('Project name'),
        content: z.string().describe('Comment text'),
        threadId: z.number().optional().describe('Thread ID (if adding to existing thread)'),
        filePath: z.string().optional().describe('File path (if commenting on a file)'),
        lineNumber: z.number().optional().describe('Line number (if commenting on a specific line)'),
        parentCommentId: z.number().optional().describe('Parent comment ID (if replying to a comment)'),
        status: z.string().optional().describe('Comment status (e.g., "active", "fixed")')
      },
      async (params) => {
        const result = await azureDevOpsService.createPullRequestComment(params);
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(result, null, 2)
            }
          ]
        };
      }
    );
    
    // Handle server close
    server.closeHandler = () => {
      console.log('SSE connection closed');
      const index = servers.indexOf(server);
      if (index !== -1) {
        servers.splice(index, 1);
      }
    };
    
    // Store transport reference
    server.transport = transport;
    
    // Add to active servers
    servers.push(server);
    
    // Connect the MCP server to the transport
    await server.connect(transport);
    
    console.log('Azure DevOps MCP Server connected to SSE transport');
    console.log('Session ID:', transport.sessionId);
    
    // Handle client disconnect
    req.on('close', () => {
      console.log('Client disconnected');
      if (server.closeHandler) {
        server.closeHandler();
      }
    });
  } catch (error) {
    console.error('Error initializing MCP server:', error);
    // Don't try to send a response, it might already be in use
    console.error('Detailed error:', error instanceof Error ? error.stack : String(error));
  }
});

// Message endpoint for receiving messages from the client
app.post('/message', async (req, res) => {
  console.log('Received message from client');
  
  const sessionId = req.query.sessionId as string;
  if (!sessionId) {
    console.error('Missing sessionId parameter');
    return res.status(400).send('Missing sessionId parameter');
  }
  
  // Find the transport for this session
  const server = servers.find(s => s.transport && s.transport.sessionId === sessionId);
  if (!server || !server.transport) {
    console.error('Session not found:', sessionId);
    return res.status(404).send('Session not found');
  }
  
  try {
    // Handle the message
    await server.transport.handlePostMessage(req, res);
  } catch (error) {
    console.error('Error handling message:', error);
    // Only try to send error if headers haven't been sent
    if (!res.headersSent) {
      res.status(500).send('Error handling message: ' + (error instanceof Error ? error.message : String(error)));
    } else {
      console.error('Could not send error to client, headers already sent');
    }
  }
});

// Initialize Azure DevOps connection
async function initializeAzureDevOps() {
  try {
    await azureDevOpsService.testConnection();
    console.log('Azure DevOps API connection initialized successfully');
    return true;
  } catch (error) {
    console.error('Error connecting to Azure DevOps API:', error);
    console.error('Please check your .env configuration');
    return false;
  }
}

// Start HTTP server
async function startServer() {
  // Initialize Azure DevOps connection
  const initialized = await initializeAzureDevOps();
  if (!initialized) {
    console.error('Failed to initialize Azure DevOps connection. Exiting...');
    process.exit(1);
  }
  
  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    console.log(`SSE endpoint: http://localhost:${PORT}/sse`);
    console.log(`Message endpoint: http://localhost:${PORT}/message`);
  });
}

// Handle termination signals
process.on('SIGINT', () => {
  console.log('Received SIGINT, shutting down...');
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('Received SIGTERM, shutting down...');
  process.exit(0);
});

// Start the server
console.log('Starting Azure DevOps MCP Server with SSE transport...');
startServer().catch(error => {
  console.error('Fatal error starting server:', error);
  process.exit(1);
}); 