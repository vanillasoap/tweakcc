// Please see the note about writing patches in ./index
//
// MCP Startup Optimization Patch
// Based on: https://cuipengfei.is-a.dev/blog/2026/01/24/claude-code-mcp-startup-optimization/
//
// This patch modifies Claude Code's MCP connection behavior:
// - MCP_CONNECTION_NONBLOCKING: Don't block startup waiting for all MCPs to connect
// - MCP_SERVER_CONNECTION_BATCH_SIZE: Connect more servers in parallel (default: 3)

import { showDiff, LocationResult } from './index';

/**
 * Find the MCP non-blocking check location.
 *
 * Pattern: !someVar(process.env.MCP_CONNECTION_NONBLOCKING)
 * This check determines whether to block on MCP connections.
 * Replacing it with "false" forces non-blocking mode.
 */
const getNonBlockingCheckLocation = (
  oldFile: string
): LocationResult | null => {
  // Match: !VARNAME(process.env.MCP_CONNECTION_NONBLOCKING)
  // The variable name changes between npm/native builds, so we match any identifier
  const pattern = /![$\w]+\(process\.env\.MCP_CONNECTION_NONBLOCKING\)/;
  const match = oldFile.match(pattern);

  if (!match || match.index === undefined) {
    // CC ≥2.1.79 removed this env var — non-blocking is now the default.
    return null;
  }

  return {
    startIndex: match.index,
    endIndex: match.index + match[0].length,
  };
};

/**
 * Find the MCP batch size default value location.
 *
 * Old pattern (CC <2.1.121): parseInt(process.env.MCP_SERVER_CONNECTION_BATCH_SIZE||"",10)||3
 * New pattern (CC 2.1.121+): ...MCP_SERVER_CONNECTION_BATCH_SIZE||"",10);return H>0?H:3}
 */
const getBatchSizeLocation = (oldFile: string): LocationResult | null => {
  // Method 1: Old pattern — direct ||N fallback
  const pattern1 = /MCP_SERVER_CONNECTION_BATCH_SIZE\|\|"",10\)\|\|(\d+)/;
  const match1 = oldFile.match(pattern1);

  if (match1 && match1.index !== undefined) {
    const fullMatch = match1[0];
    const defaultValue = match1[1];
    const defaultValueOffset = fullMatch.lastIndexOf(defaultValue);
    const startIndex = match1.index + defaultValueOffset;
    return { startIndex, endIndex: startIndex + defaultValue.length };
  }

  // Method 2: New pattern (CC 2.1.121+) — ternary H>0?H:N
  const pattern2 =
    /MCP_SERVER_CONNECTION_BATCH_SIZE\|\|"",10\);return [$\w]+>0\?[$\w]+:(\d+)/;
  const match2 = oldFile.match(pattern2);

  if (match2 && match2.index !== undefined) {
    const fullMatch = match2[0];
    const defaultValue = match2[1];
    const defaultValueOffset = fullMatch.lastIndexOf(defaultValue);
    const startIndex = match2.index + defaultValueOffset;
    return { startIndex, endIndex: startIndex + defaultValue.length };
  }

  console.error(
    'patch: mcpStartup: failed to find MCP_SERVER_CONNECTION_BATCH_SIZE default'
  );
  return null;
};

/**
 * Apply non-blocking MCP startup by replacing the blocking check with "false".
 */
export const writeMcpNonBlocking = (oldFile: string): string | null => {
  const location = getNonBlockingCheckLocation(oldFile);
  if (!location) {
    // CC ≥2.1.79 removed MCP_CONNECTION_NONBLOCKING — non-blocking is now default.
    // Return file unchanged (no-op) instead of failing.
    return oldFile;
  }

  // Replace the check with "false" to force non-blocking mode
  const newValue = 'false';
  const newFile =
    oldFile.slice(0, location.startIndex) +
    newValue +
    oldFile.slice(location.endIndex);

  showDiff(oldFile, newFile, newValue, location.startIndex, location.endIndex);
  return newFile;
};

/**
 * Apply MCP batch size optimization by replacing the default value.
 */
export const writeMcpBatchSize = (
  oldFile: string,
  batchSize: number
): string | null => {
  const location = getBatchSizeLocation(oldFile);
  if (!location) {
    return null;
  }

  const newValue = String(batchSize);
  const newFile =
    oldFile.slice(0, location.startIndex) +
    newValue +
    oldFile.slice(location.endIndex);

  showDiff(oldFile, newFile, newValue, location.startIndex, location.endIndex);
  return newFile;
};
