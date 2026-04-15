// Please see the note about writing patches in ./index

import { showDiff } from './index';

type VerbosePatch = {
  startIndex: number;
  endIndex: number;
  newCode: string;
};

const getVerbosePatch = (oldFile: string): VerbosePatch | null => {
  const createElementPattern =
    /createElement\([$\w]+,\{[^}]+spinnerTip[^}]+overrideMessage[^}]+\}/;
  const createElementMatch = oldFile.match(createElementPattern);

  if (createElementMatch && createElementMatch.index !== undefined) {
    const extractedString = createElementMatch[0];
    const verbosePattern = /verbose:[^,}]+/;
    const verboseMatch = extractedString.match(verbosePattern);

    if (verboseMatch && verboseMatch.index !== undefined) {
      const startIndex = createElementMatch.index + verboseMatch.index;
      return {
        startIndex,
        endIndex: startIndex + verboseMatch[0].length,
        newCode: 'verbose:true',
      };
    }
  }

  // CC 2.1.109+: spinner component receives verbose via function-param
  // destructuring; override the local binding at the top of the function body.
  const destructurePattern =
    /verbose:([$\w]+),hasActiveTools:[$\w]+=!1,leaderIsIdle:[$\w]+=!1\}\)\{/;
  const destructureMatch = oldFile.match(destructurePattern);

  if (destructureMatch && destructureMatch.index !== undefined) {
    const varName = destructureMatch[1];
    const startIndex = destructureMatch.index;
    const endIndex = startIndex + destructureMatch[0].length;
    return {
      startIndex,
      endIndex,
      newCode: `${destructureMatch[0]}${varName}=!0;`,
    };
  }

  console.error(
    'patch: verbose: failed to find createElement with spinnerTip and overrideMessage'
  );
  return null;
};

export const writeVerboseProperty = (oldFile: string): string | null => {
  const patch = getVerbosePatch(oldFile);
  if (!patch) {
    return null;
  }

  const newFile =
    oldFile.slice(0, patch.startIndex) +
    patch.newCode +
    oldFile.slice(patch.endIndex);

  showDiff(oldFile, newFile, patch.newCode, patch.startIndex, patch.endIndex);
  return newFile;
};
