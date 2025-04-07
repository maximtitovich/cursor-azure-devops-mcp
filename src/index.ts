#!/usr/bin/env node

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { azureDevOpsService } from './azure-devops-service.js';
import { configManager } from './config-manager.js';
import { createConnection } from 'net';

/**
 * Helper function to safely handle response serialization
 * preventing circular reference errors
 */
export function safeResponse(result: any) {
  // If the result is already a string, return it
  if (typeof result === 'string') {
    return result;
  }

  // Special case for file content responses with nested content property
  if (result && typeof result.content === 'string') {
    try {
      // Try to parse the content string which might be a stringified object with circular refs
      const parsedContent = JSON.parse(result.content);

      // If parsing succeeded and content contains buffer data, extract what we need
      if (parsedContent && parsedContent._readableState && parsedContent._readableState.buffer) {
        // Extract buffer data and convert to actual content when possible
        const bufferData = parsedContent._readableState.buffer;

        // If we have buffer data with a "data" property, try to convert it to actual content
        if (
          Array.isArray(bufferData) &&
          bufferData.length > 0 &&
          bufferData[0].type === 'Buffer' &&
          Array.isArray(bufferData[0].data)
        ) {
          try {
            // Convert buffer data to actual content
            const bufferBytes = Buffer.from(bufferData[0].data);

            // Determine if it's likely text content based on content type or binary detection
            const isLikelyText =
              !result.isBinary &&
              (!result.contentType ||
                result.contentType.includes('text') ||
                result.contentType.includes('json') ||
                result.contentType.includes('html') ||
                result.contentType.includes('xml') ||
                result.contentType.includes('javascript') ||
                result.contentType.includes('typescript'));

            // Return structured response with both the converted content and metadata
            return JSON.stringify(
              {
                content: isLikelyText
                  ? bufferBytes.toString('utf-8')
                  : '[Binary content - displaying first 1000 bytes as hex]',
                hexContent: isLikelyText ? null : bufferBytes.toString('hex').substring(0, 2000),
                isBinary: result.isBinary,
                contentType: result.contentType,
                size: result.size || bufferBytes.length,
                length: result.length || bufferBytes.length,
                position: result.position || 0,
              },
              null,
              2
            );
          } catch (bufferError) {
            // Fall back to returning the raw buffer data
            return JSON.stringify(
              {
                buffer: bufferData,
                error: 'Failed to convert buffer to content',
                errorDetails: bufferError instanceof Error ? bufferError.message : 'Unknown error',
                size: result.size || 0,
                length: result.length || 0,
                position: result.position || 0,
                contentType: result.contentType,
                isBinary: result.isBinary,
              },
              null,
              2
            );
          }
        }

        // Fallback to original approach if buffer format is different
        const sanitizedContent = {
          buffer: bufferData,
          size: result.size || 0,
          length: result.length || 0,
          position: result.position || 0,
          contentType: result.contentType,
          isBinary: result.isBinary,
          error: result.error,
        };
        return JSON.stringify(sanitizedContent, null, 2);
      }
    } catch (parseError) {
      // If parsing fails, the content might not be JSON or might be corrupted
      // Continue with the normal safe stringify process
    }
  }

  try {
    // Try to JSON stringify normally first
    return JSON.stringify(result, null, 2);
  } catch (error) {
    // If normal stringify fails, use a more robust approach
    const seen = new WeakSet();
    try {
      return JSON.stringify(
        result,
        (key, value) => {
          // Skip these problematic keys that often cause circular references
          if (
            key === '_httpMessage' ||
            key === 'socket' ||
            key === 'connection' ||
            key === 'agent' ||
            key === 'parser' ||
            key === 'client' ||
            key === '_events' ||
            key === '_eventsCount' ||
            key === '_readableState' ||
            key === '_writableState'
          ) {
            return '[Circular]';
          }

          // Special handling for Buffer data - convert to string if possible
          if (
            key === 'buffer' &&
            Array.isArray(value) &&
            value.length > 0 &&
            value[0].type === 'Buffer'
          ) {
            try {
              const bufferBytes = Buffer.from(value[0].data);
              // Return converted text for smaller buffers, hexdump for larger ones
              if (bufferBytes.length < 10000) {
                return {
                  content: bufferBytes.toString('utf-8'),
                  bytesLength: bufferBytes.length,
                };
              } else {
                return {
                  content: '[Large buffer - first 1000 bytes shown]',
                  hexContent: bufferBytes.toString('hex').substring(0, 2000),
                  bytesLength: bufferBytes.length,
                };
              }
            } catch (bufferErr) {
              // Return truncated buffer array if conversion fails
              return value.slice(0, 1000);
            }
          }

          if (typeof value === 'object' && value !== null) {
            if (seen.has(value)) {
              return '[Circular]';
            }
            seen.add(value);
          }
          return value;
        },
        2
      );
    } catch (secondError) {
      // If all else fails, convert to a simple error message with more details
      return JSON.stringify({
        error: 'Failed to serialize response',
        message: error instanceof Error ? error.message : 'Unknown error',
        type: result ? typeof result : 'undefined',
        hasContent: result && result.content ? true : false,
        contentType: result && result.contentType ? result.contentType : 'unknown',
      });
    }
  }
}

// Create MCP server
const server = new McpServer({
  name: 'cursor-azure-devops-mcp',
  version: '1.0.3',
  description: 'MCP Server for Azure DevOps integration with Cursor IDE',
});

// Register Azure DevOps tools
server.tool('azure_devops_projects', 'List all projects', {}, async () => {
  try {
    const result = await azureDevOpsService.getProjects();
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(result, null, 2),
        },
      ],
    };
  } catch (error) {
    console.error('Error executing azure_devops_projects:', error);
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({ error: String(error) }, null, 2),
        },
      ],
    };
  }
});

server.tool(
  'azure_devops_work_item',
  'Get a work item by ID',
  {
    id: z.number().describe('Work item ID'),
  },
  async ({ id }) => {
    try {
      const result = await azureDevOpsService.getWorkItem(id);
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(result, null, 2),
          },
        ],
      };
    } catch (error) {
      console.error(`Error executing azure_devops_work_item for ID ${id}:`, error);
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({ error: String(error) }, null, 2),
          },
        ],
      };
    }
  }
);

server.tool(
  'azure_devops_work_items',
  'Get multiple work items by IDs',
  {
    ids: z.array(z.number()).describe('Array of work item IDs'),
  },
  async ({ ids }) => {
    try {
      const result = await azureDevOpsService.getWorkItems(ids);
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(result, null, 2),
          },
        ],
      };
    } catch (error) {
      console.error(`Error executing azure_devops_work_items for IDs ${ids.join(', ')}:`, error);
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({ error: String(error) }, null, 2),
          },
        ],
      };
    }
  }
);

server.tool(
  'azure_devops_repositories',
  'List all repositories',
  {
    project: z.string().optional().describe('Project name'),
  },
  async ({ project }) => {
    try {
      const result = await azureDevOpsService.getRepositories(project || '');
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(result, null, 2),
          },
        ],
      };
    } catch (error) {
      console.error(
        `Error executing azure_devops_repositories for project ${project || 'default'}:`,
        error
      );
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({ error: String(error) }, null, 2),
          },
        ],
      };
    }
  }
);

server.tool(
  'azure_devops_pull_requests',
  'List all pull requests for a repository',
  {
    repositoryId: z.string().describe('Repository ID'),
    project: z.string().optional().describe('Project name'),
  },
  async ({ repositoryId, project }) => {
    try {
      const result = await azureDevOpsService.getPullRequests(repositoryId, project || '');
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(result, null, 2),
          },
        ],
      };
    } catch (error) {
      console.error(
        `Error executing azure_devops_pull_requests for repository ${repositoryId}:`,
        error
      );
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({ error: String(error) }, null, 2),
          },
        ],
      };
    }
  }
);

server.tool(
  'azure_devops_pull_request_by_id',
  'Get a pull request by ID',
  {
    repositoryId: z.string().describe('Repository ID'),
    pullRequestId: z.number().describe('Pull request ID'),
    project: z.string().optional().describe('Project name'),
  },
  async ({ repositoryId, pullRequestId, project }) => {
    try {
      const result = await azureDevOpsService.getPullRequestById(
        repositoryId,
        pullRequestId,
        project || ''
      );
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(result, null, 2),
          },
        ],
      };
    } catch (error) {
      console.error(
        `Error executing azure_devops_pull_request_by_id for repository ${repositoryId} PR #${pullRequestId}:`,
        error
      );
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({ error: String(error) }, null, 2),
          },
        ],
      };
    }
  }
);

server.tool(
  'azure_devops_pull_request_threads',
  'Get threads from a pull request',
  {
    repositoryId: z.string().describe('Repository ID'),
    pullRequestId: z.number().describe('Pull request ID'),
    project: z.string().describe('Project name'),
  },
  async ({ repositoryId, pullRequestId, project }) => {
    const result = await azureDevOpsService.getPullRequestThreads(
      repositoryId,
      pullRequestId,
      project
    );
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(result, null, 2),
        },
      ],
    };
  }
);

// New tool for work item attachments
server.tool(
  'azure_devops_work_item_attachments',
  'Get attachments for a specific work item',
  {
    id: z.number().describe('Work item ID'),
  },
  async ({ id }) => {
    const result = await azureDevOpsService.getWorkItemAttachments(id);
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(result, null, 2),
        },
      ],
    };
  }
);

// New tool for work item links
server.tool(
  'azure_devops_work_item_links',
  'Get links for a specific work item',
  {
    id: z.number().describe('Work item ID'),
  },
  async ({ id }) => {
    const result = await azureDevOpsService.getWorkItemLinks(id);
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(result, null, 2),
        },
      ],
    };
  }
);

// New tool for linked work items with full details
server.tool(
  'azure_devops_linked_work_items',
  'Get all linked work items with their full details',
  {
    id: z.number().describe('Work item ID'),
  },
  async ({ id }) => {
    const result = await azureDevOpsService.getLinkedWorkItems(id);
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(result, null, 2),
        },
      ],
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
    project: z.string().describe('Project name'),
  },
  async ({ repositoryId, pullRequestId, project }) => {
    const result = await azureDevOpsService.getPullRequestChanges(
      repositoryId,
      pullRequestId,
      project
    );

    return {
      content: [
        {
          type: 'text',
          text: safeResponse(result),
        },
      ],
    };
  }
);

// New tool for getting content of large files in pull requests by chunks
server.tool(
  'azure_devops_pull_request_file_content',
  'Get the content of a specific file in a pull request. By default returns the complete file as plain text. Set returnPlainText=false to get content in chunks with metadata. Has a 5-minute timeout for large files.',
  {
    repositoryId: z.string().describe('Repository ID'),
    pullRequestId: z.number().describe('Pull request ID'),
    filePath: z.string().describe('File path'),
    objectId: z.string().describe('Object ID of the file version'),
    startPosition: z
      .number()
      .optional()
      .describe('Starting position in the file (bytes) - only used when returnPlainText=false')
      .default(0),
    length: z
      .number()
      .optional()
      .describe('Length to read (bytes) - only used when returnPlainText=false')
      .default(100000),
    project: z.string().optional().describe('Project name'),
    returnPlainText: z
      .boolean()
      .optional()
      .describe(
        'When true (default), returns complete file as plain text; when false, returns JSON with chunk details'
      )
      .default(true),
  },
  async (
    {
      repositoryId,
      pullRequestId,
      filePath,
      objectId,
      startPosition,
      length,
      project,
      returnPlainText,
    },
    _context
  ) => {
    try {
      if (returnPlainText) {
        // Get the complete file content
        const content = await azureDevOpsService.getCompletePullRequestFileContent(
          repositoryId,
          pullRequestId,
          filePath,
          objectId,
          project
        );

        // Return in the proper MCP format
        return {
          content: [
            {
              type: 'text',
              text: content,
            },
          ],
        };
      } else {
        // Get the file content in chunks with metadata
        const result = await azureDevOpsService.getPullRequestFileContent(
          repositoryId,
          pullRequestId,
          filePath,
          objectId,
          startPosition,
          length,
          project
        );

        // Format the response properly
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(result),
            },
          ],
        };
      }
    } catch (error) {
      console.error('Error retrieving PR file content:', error);
      return {
        content: [
          {
            type: 'text',
            text: `Error: ${error instanceof Error ? error.message : String(error)}`,
          },
        ],
      };
    }
  }
);

// New tool for getting file content directly from a branch
server.tool(
  'azure_devops_branch_file_content',
  'Get the content of a file directly from a branch. By default returns the complete file as plain text. Set returnPlainText=false to get content in chunks with metadata. Has a 5-minute timeout for large files.',
  {
    repositoryId: z.string().describe('Repository ID'),
    branchName: z.string().describe('Branch name'),
    filePath: z.string().describe('File path'),
    startPosition: z
      .number()
      .optional()
      .describe('Starting position in the file (bytes) - only used when returnPlainText=false')
      .default(0),
    length: z
      .number()
      .optional()
      .describe('Length to read (bytes) - only used when returnPlainText=false')
      .default(100000),
    project: z.string().optional().describe('Project name'),
    returnPlainText: z
      .boolean()
      .optional()
      .describe(
        'When true (default), returns complete file as plain text; when false, returns JSON with chunk details'
      )
      .default(true),
  },
  async (
    { repositoryId, branchName, filePath, startPosition, length, project, returnPlainText },
    _context
  ) => {
    try {
      if (returnPlainText) {
        // Get the complete file content
        const content = await azureDevOpsService.getCompleteFileFromBranch(
          repositoryId,
          filePath,
          branchName,
          project
        );

        // Return in the proper MCP format
        return {
          content: [
            {
              type: 'text',
              text: content,
            },
          ],
        };
      } else {
        // Get the file content in chunks with metadata
        const result = await azureDevOpsService.getFileFromBranch(
          repositoryId,
          filePath,
          branchName,
          startPosition,
          length,
          project
        );

        // Format the response properly
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(result),
            },
          ],
        };
      }
    } catch (error) {
      console.error('Error retrieving branch file content:', error);
      return {
        content: [
          {
            type: 'text',
            text: `Error: ${error instanceof Error ? error.message : String(error)}`,
          },
        ],
      };
    }
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
    status: z.string().optional().describe('Comment status (e.g., "active", "fixed")'),
  },
  async params => {
    const result = await azureDevOpsService.createPullRequestComment(params);
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(result, null, 2),
        },
      ],
    };
  }
);

// New tool for work item comments
server.tool(
  'azure_devops_work_item_comments',
  'Get comments for a specific work item',
  {
    id: z.number().describe('Work item ID'),
  },
  async ({ id }) => {
    try {
      const result = await azureDevOpsService.getWorkItemComments(id);
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(result, null, 2),
          },
        ],
      };
    } catch (error) {
      console.error(`Error executing azure_devops_work_item_comments for ID ${id}:`, error);
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({ error: String(error) }, null, 2),
          },
        ],
      };
    }
  }
);

// Test Plans
server.tool(
  'azure_devops_test_plans',
  'List all test plans for a project',
  {
    project: z.string().describe('Project name'),
  },
  async ({ project }) => {
    try {
      const result = await azureDevOpsService.getTestPlans(project);
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(result, null, 2),
          },
        ],
      };
    } catch (error) {
      console.error('Error executing azure_devops_test_plans:', error);
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({ error: String(error) }, null, 2),
          },
        ],
      };
    }
  }
);

server.tool(
  'azure_devops_test_plan',
  'Get a test plan by ID',
  {
    project: z.string().describe('Project name'),
    testPlanId: z.number().describe('Test plan ID'),
  },
  async ({ project, testPlanId }) => {
    try {
      const result = await azureDevOpsService.getTestPlan(project, testPlanId);
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(result, null, 2),
          },
        ],
      };
    } catch (error) {
      console.error('Error executing azure_devops_test_plan:', error);
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({ error: String(error) }, null, 2),
          },
        ],
      };
    }
  }
);

// Test Suites
server.tool(
  'azure_devops_test_suites',
  'List all test suites for a test plan',
  {
    project: z.string().describe('Project name'),
    testPlanId: z.number().describe('Test plan ID'),
  },
  async ({ project, testPlanId }) => {
    try {
      const result = await azureDevOpsService.getTestSuites(testPlanId, project);
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(result, null, 2),
          },
        ],
      };
    } catch (error) {
      console.error('Error executing azure_devops_test_suites:', error);
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({ error: String(error) }, null, 2),
          },
        ],
      };
    }
  }
);

server.tool(
  'azure_devops_test_suite',
  'Get a test suite by ID',
  {
    project: z.string().describe('Project name'),
    testPlanId: z.number().describe('Test plan ID'),
    testSuiteId: z.number().describe('Test suite ID'),
  },
  async ({ project, testPlanId, testSuiteId }) => {
    try {
      const result = await azureDevOpsService.getTestSuite(project, testPlanId, testSuiteId);
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(result, null, 2),
          },
        ],
      };
    } catch (error) {
      console.error('Error executing azure_devops_test_suite:', error);
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({ error: String(error) }, null, 2),
          },
        ],
      };
    }
  }
);

// Test Cases
server.tool(
  'azure_devops_test_cases',
  'List all test cases for a test suite',
  {
    project: z.string().describe('Project name'),
    testPlanId: z.number().describe('Test plan ID'),
    testSuiteId: z.number().describe('Test suite ID'),
  },
  async ({ project, testPlanId, testSuiteId }) => {
    try {
      const result = await azureDevOpsService.getTestCases(project, testPlanId, testSuiteId);
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(result, null, 2),
          },
        ],
      };
    } catch (error) {
      console.error('Error executing azure_devops_test_cases:', error);
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({ error: String(error) }, null, 2),
          },
        ],
      };
    }
  }
);

// Start server
async function main() {
  // Load configuration from all sources (command line, IDE settings, env vars, defaults)
  const _config = configManager.loadConfig();

  // Display the configuration (sensitive data redacted)
  configManager.printConfig();

  // Check if Azure DevOps configuration is valid
  if (!configManager.isAzureDevOpsConfigValid()) {
    console.error('Azure DevOps configuration is missing or invalid.');
    console.error(
      'Please provide organizationUrl and token via command line, IDE settings, or environment variables.'
    );
    process.exit(1);
  }

  try {
    console.error('Starting Azure DevOps MCP Server with stdio transport...');

    // Initialize Azure DevOps API connection
    try {
      await azureDevOpsService.initialize();
      console.error('Azure DevOps API connection initialized successfully');
    } catch (error) {
      console.error('Failed to initialize Azure DevOps API connection:', error);
      process.exit(1);
    }

    // Create transport and connect
    const transport = new StdioServerTransport();
    await server.connect(transport);

    console.error('Azure DevOps MCP Server running on stdio');
    console.error('Available tools:');
    console.error('- azure_devops_projects: List all projects');
    console.error('- azure_devops_work_item: Get a work item by ID');
    console.error('- azure_devops_work_items: Get multiple work items by IDs');
    console.error('- azure_devops_repositories: List all repositories');
    console.error('- azure_devops_pull_requests: List all pull requests for a repository');
    console.error('- azure_devops_pull_request_by_id: Get a pull request by ID');
    console.error('- azure_devops_pull_request_threads: Get threads (comments) for a pull request');
    console.error('- azure_devops_work_item_attachments: Get attachments for a work item');
    console.error('- azure_devops_work_item_links: Get links for a work item');
    console.error(
      '- azure_devops_linked_work_items: Get all linked work items with their full details'
    );
    console.error(
      '- azure_devops_pull_request_changes: Get detailed code changes for a pull request'
    );
    console.error(
      '- azure_devops_pull_request_file_content: Get content of a specific file in chunks (for large files)'
    );
    console.error(
      '- azure_devops_branch_file_content: Get content of a file directly from a branch'
    );
    console.error('- azure_devops_create_pr_comment: Create a comment on a pull request');
    console.error('- azure_devops_work_item_comments: Get comments for a specific work item');
    console.error('- azure_devops_test_plans: List all test plans for a project');
    console.error('- azure_devops_test_plan: Get a test plan by ID');
    console.error('- azure_devops_test_suites: List all test suites for a test plan');
    console.error('- azure_devops_test_suite: Get a test suite by ID');
    console.error('- azure_devops_test_cases: List all test cases for a test suite');
  } catch (error) {
    console.error('Error starting server:', error);
    process.exit(1);
  }
}

// Handle termination signals
process.on('SIGINT', () => {
  console.error('Received SIGINT, shutting down...');
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.error('Received SIGTERM, shutting down...');
  process.exit(0);
});

// Run the server
main().catch(error => {
  console.error('Unhandled error:', error);
  process.exit(1);
});
