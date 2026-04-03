// Please see the note about writing patches in ./index

import { showDiff } from './index';

export const writeHideStartupBanner = (oldFile: string): string | null => {
  // CC <2.1.88: createElement with isBeforeFirstMessage:!1
  const oldPattern =
    /,[$\w]+\.createElement\([$\w]+,\{isBeforeFirstMessage:!1\}\),/;
  const oldMatch = oldFile.match(oldPattern);

  if (oldMatch && oldMatch.index !== undefined) {
    const newFile =
      oldFile.slice(0, oldMatch.index) +
      ',' +
      oldFile.slice(oldMatch.index + oldMatch[0].length);

    showDiff(
      oldFile,
      newFile,
      ',',
      oldMatch.index,
      oldMatch.index + oldMatch[0].length
    );
    return newFile;
  }

  // CC ≥2.1.88: Find the startup banner function via "Welcome to Claude Code"
  // string, then insert `return null;` at the function body start
  const welcomeIdx = oldFile.indexOf('Welcome to Claude Code');
  if (welcomeIdx === -1) {
    console.error(
      'patch: hideStartupBanner: failed to find startup banner createElement'
    );
    return null;
  }

  const lookbackStart = Math.max(0, welcomeIdx - 2000);
  const beforeText = oldFile.slice(lookbackStart, welcomeIdx);

  // Find the LAST function declaration before "Welcome to Claude Code"
  const functionPattern = /function [$\w]+\([$\w]+\)\{/g;
  let lastFunctionMatch: RegExpExecArray | null = null;
  let match: RegExpExecArray | null;

  while ((match = functionPattern.exec(beforeText)) !== null) {
    lastFunctionMatch = match;
  }

  if (!lastFunctionMatch) {
    console.error('patch: hideStartupBanner: failed to find banner function');
    return null;
  }

  const insertIndex =
    lookbackStart + lastFunctionMatch.index + lastFunctionMatch[0].length;
  const insertCode = 'return null;';

  const newFile =
    oldFile.slice(0, insertIndex) + insertCode + oldFile.slice(insertIndex);

  showDiff(oldFile, newFile, insertCode, insertIndex, insertIndex);
  return newFile;
};
