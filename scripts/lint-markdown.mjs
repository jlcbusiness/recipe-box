import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import markdownlint from 'markdownlint';

const repositoryRoot = process.cwd();
const ignoredDirectories = new Set([
  '.git',
  'node_modules',
  'test-results',
  'playwright-report',
  'coverage',
  'out',
]);
const ignoredPaths = new Set(['docs/plans/discussion', '.github/prompts/update.prompt.md']);
const ignoredAgentFiles = new Set(['AGENTS.md', 'CLAUDE.md']);
const ignoredMarkdownFiles = new Set(['.github/prompts/update.prompt.md']);

async function collectMarkdownFiles() {
  const files = [];
  const pendingDirectories = [repositoryRoot];

  while (pendingDirectories.length > 0) {
    const currentDirectory = pendingDirectories.pop();
    if (!currentDirectory) continue;

    for (const entry of await readdir(currentDirectory, { withFileTypes: true })) {
      const absolutePath = path.join(currentDirectory, entry.name);
      const relativePath = path.relative(repositoryRoot, absolutePath).split(path.sep).join('/');

      if (entry.isDirectory()) {
        if (
          ignoredDirectories.has(entry.name) ||
          entry.name.startsWith('.next') ||
          ignoredPaths.has(relativePath)
        ) {
          continue;
        }
        pendingDirectories.push(absolutePath);
      } else if (
        entry.isFile() &&
        entry.name.endsWith('.md') &&
        !ignoredAgentFiles.has(relativePath) &&
        !ignoredMarkdownFiles.has(relativePath)
      ) {
        files.push(relativePath);
      }
    }
  }

  return files.sort();
}

const files = await collectMarkdownFiles();
const config = JSON.parse(await readFile(path.join(repositoryRoot, '.markdownlint.json'), 'utf8'));
const results = await markdownlint.promises.markdownlint({ files, config });
const errorCount = Object.values(results).reduce(
  (count, fileErrors) => count + fileErrors.length,
  0,
);

if (errorCount > 0) {
  console.error(results.toString());
}

console.log(`Checked ${files.length} Markdown files; ${errorCount} error(s).`);
if (errorCount > 0) process.exitCode = 1;
