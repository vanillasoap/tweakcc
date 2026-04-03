// Please see the note about writing patches in ./index

import { showDiff } from './index';

/**
 * Patches the CLAUDE.md file reading function to also check for alternative
 * filenames (e.g., AGENTS.md) when CLAUDE.md doesn't exist.
 *
 * This finds the function that reads CLAUDE.md files and modifies it to:
 * 1. Add a `didReroute` parameter to the function
 * 2. At the early `return null` (when the file doesn't exist), check if the
 *    path ends with CLAUDE.md and try alternative names (unless didReroute
 *    is true)
 * 3. Recursive calls pass didReroute=true to avoid infinite loops
 *
 * CC 2.1.62 (approx. by Claude):
 * ```diff
 * -function _t7(A, q) {
 * +function _t7(A, q, didReroute) {
 *    try {
 *      let K = x1();
 * -    if (!K.existsSync(A) || !K.statSync(A).isFile()) return null;
 * +    if (!K.existsSync(A) || !K.statSync(A).isFile()) {
 * +      if (!didReroute && (A.endsWith("/CLAUDE.md") || A.endsWith("\\CLAUDE.md"))) {
 * +        for (let alt of ["AGENTS.md", "GEMINI.md", "QWEN.md"]) {
 * +          let altPath = A.slice(0, -9) + alt;
 * +          if (K.existsSync(altPath) && K.statSync(altPath).isFile())
 * +            return _t7(altPath, q, true);
 * +        }
 * +      }
 * +      return null;
 * +    }
 *      let Y = UL9(A).toLowerCase();
 *      if (Y && !dL9.has(Y))
 *        return (I(`Skipping non-text file in @include: ${A}`), null);
 *      let z = K.readFileSync(A, { encoding: "utf-8" }),
 *        { content: w, paths: H } = cL9(z);
 *      return { path: A, type: q, content: w, globs: H };
 *    } catch (K) {
 *      if (K instanceof Error && K.message.includes("EACCES"))
 *        n("tengu_claude_md_permission_error", {
 *          is_access_error: 1,
 *          has_home_dir: A.includes(_8()) ? 1 : 0,
 *        });
 *    }
 *    return null;
 *  }
 * ```
 */
export const writeAgentsMd = (
  file: string,
  altNames: string[]
): string | null => {
  // CC ≥2.1.88: File I/O moved to async caller function xu1.
  // Pattern: async function NAME(path,type,parent){try{let V=await FS().readFile(path,...);return READER(V,path,type,parent)}catch(E){...}}
  const asyncCallerPattern =
    /(async function ([$\w]+)\(([$\w]+),([$\w]+),([$\w]+)\)\{try\{let ([$\w]+)=await ([$\w]+)\(\)\.readFile\(\3,\{encoding:"utf-8"\}\);return ([$\w]+)\(\6,\3,\4,\5\)\}catch\(([$\w]+)\)\{)/;

  const asyncMatch = file.match(asyncCallerPattern);
  if (asyncMatch && asyncMatch.index !== undefined) {
    return writeAgentsMdAsync(file, altNames, asyncMatch);
  }

  // CC <2.1.88: File I/O in the reader function itself
  return writeAgentsMdSync(file, altNames);
};

const writeAgentsMdAsync = (
  file: string,
  altNames: string[],
  asyncMatch: RegExpMatchArray
): string | null => {
  const pathParam = asyncMatch[3];
  const typeParam = asyncMatch[4];
  const parentParam = asyncMatch[5];
  const fsExpr = asyncMatch[7];
  const errorVar = asyncMatch[9];
  const catchStart = asyncMatch.index! + asyncMatch[1].length;

  const altNamesJson = JSON.stringify(altNames);

  // Inject fallback inside the catch block: on ENOENT, try alt filenames
  const fallback = `{let _ec=typeof ${errorVar}==="object"&&${errorVar}!==null&&"code"in ${errorVar}?${errorVar}.code:"";if((_ec==="ENOENT"||_ec==="EISDIR")&&(${pathParam}.endsWith("/CLAUDE.md")||${pathParam}.endsWith("\\\\CLAUDE.md"))){for(let alt of ${altNamesJson}){let altPath=${pathParam}.slice(0,-9)+alt;try{let _c=await ${fsExpr}().readFile(altPath,{encoding:"utf-8"});return ${asyncMatch[8]}(_c,altPath,${typeParam},${parentParam})}catch{}}}}`;

  const newFile = file.slice(0, catchStart) + fallback + file.slice(catchStart);

  showDiff(file, newFile, fallback, catchStart, catchStart);
  return newFile;
};

const writeAgentsMdSync = (file: string, altNames: string[]): string | null => {
  const funcPattern =
    /(function ([$\w]+)\(([$\w]+),([^)]+?))\)(?:.|\n){0,500}Skipping non-text file in @include/;

  const funcMatch = file.match(funcPattern);
  if (!funcMatch || funcMatch.index === undefined) {
    console.error('patch: agentsMd: failed to find CLAUDE.md reading function');
    return null;
  }
  const upToFuncParamsClosingParen = funcMatch[1];
  const functionName = funcMatch[2];
  const firstParam = funcMatch[3];
  const restParams = funcMatch[4];
  const funcStart = funcMatch.index;

  const fsPattern = /([$\w]+(?:\(\))?)\.(?:readFileSync|existsSync|statSync)/;
  const fsMatch = funcMatch[0].match(fsPattern);
  if (!fsMatch) {
    console.error('patch: agentsMd: failed to find fs expression in function');
    return null;
  }
  const fsExpr = fsMatch[1];

  const altNamesJson = JSON.stringify(altNames);

  // Step 1: Add didReroute parameter to function signature
  const sigIndex = funcStart + upToFuncParamsClosingParen.length;
  let newFile = file.slice(0, sigIndex) + ',didReroute' + file.slice(sigIndex);

  showDiff(file, newFile, ',didReroute', sigIndex, sigIndex);

  // Step 2: Inject fallback at the early return null (when file doesn't exist)
  const funcBody = newFile.slice(funcStart);

  // CC ≤2.1.62: existsSync/isFile check before reading
  const oldEarlyReturnPattern = /\.isFile\(\)\)return null/;
  // CC ≥2.1.69: try/catch with ENOENT/EISDIR error codes
  const newEarlyReturnPattern = /==="EISDIR"\)return null/;

  const earlyReturnMatch =
    funcBody.match(oldEarlyReturnPattern) ??
    funcBody.match(newEarlyReturnPattern);

  if (!earlyReturnMatch || earlyReturnMatch.index === undefined) {
    console.error(
      'patch: agentsMd: failed to find early return null for injection'
    );
    return null;
  }

  const isNewPattern = !funcBody.match(oldEarlyReturnPattern);

  const fallback = `if(!didReroute&&(${firstParam}.endsWith("/CLAUDE.md")||${firstParam}.endsWith("\\\\CLAUDE.md"))){for(let alt of ${altNamesJson}){let altPath=${firstParam}.slice(0,-9)+alt;if(${fsExpr}.existsSync(altPath)&&${fsExpr}.statSync(altPath).isFile())return ${functionName}(altPath,${restParams},true);}}`;

  const earlyReturnStart = funcStart + earlyReturnMatch.index;
  const oldStr = earlyReturnMatch[0];
  const newStr = isNewPattern
    ? `==="EISDIR"){${fallback}return null;}`
    : `.isFile()){${fallback}return null;}`;

  newFile =
    newFile.slice(0, earlyReturnStart) +
    newStr +
    newFile.slice(earlyReturnStart + oldStr.length);

  showDiff(file, newFile, newStr, earlyReturnStart, earlyReturnStart);

  return newFile;
};
