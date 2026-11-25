#!/usr/bin/env node

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  parseRecipeJsonBytes,
  RecipeJsonValidationError,
} from '../src/lib/recipe-json/validation.mjs';

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const standardSchemaPath = path.join(
  scriptDirectory,
  '..',
  'schemas',
  'recipe-json-v1.schema.json',
);

function printHelp() {
  console.log(`Lint a Recipe Box .json or .jsonc recipe file.

Usage:
  node scripts/lint-recipe-json.mjs [--schema <path>] <file>
  bash scripts/lint-recipe-json.sh [--schema <path>] <file>
  pwsh -File scripts/lint-recipe-json.ps1 [--schema <path>] <file>
  npm run lint:recipe-json -- [--schema <path>] <file>

The checked-in Draft 2020-12 schema is used by default. Pass a downloaded
strict schema with --schema. Files are read locally and are never modified.`);
}

function parseArguments(args) {
  let schemaPath = standardSchemaPath;
  let inputPath;
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === '--help' || argument === '-h') return { help: true };
    if (argument === '--schema') {
      const selectedPath = args[index + 1];
      if (!selectedPath || selectedPath.startsWith('-')) {
        throw new Error('Provide a local file path after --schema.');
      }
      schemaPath = path.resolve(selectedPath);
      index += 1;
      continue;
    }
    if (argument.startsWith('-')) {
      throw new Error(`Unknown option: ${argument}`);
    }
    if (inputPath) throw new Error('Provide one recipe JSON file at a time.');
    inputPath = argument;
  }
  if (!inputPath) throw new Error('Choose a .json or .jsonc recipe file.');
  return { inputPath: path.resolve(inputPath), schemaPath };
}

try {
  const parsedArguments = parseArguments(process.argv.slice(2));
  if (parsedArguments.help) {
    printHelp();
    process.exit(0);
  }

  const [fileBytes, schemaText] = await Promise.all([
    readFile(parsedArguments.inputPath),
    readFile(parsedArguments.schemaPath, 'utf8'),
  ]);
  let schema;
  try {
    schema = JSON.parse(schemaText);
  } catch {
    throw new Error('The selected schema file is not valid JSON.');
  }
  const parsed = parseRecipeJsonBytes(fileBytes, parsedArguments.inputPath, schema);
  console.log(`Valid recipe JSON: ${parsed.recipes.length} recipe(s).`);
} catch (error) {
  const message =
    error instanceof RecipeJsonValidationError
      ? error.message
      : error instanceof Error
        ? error.message
        : 'Recipe JSON validation failed.';
  console.error(message);
  process.exitCode = 1;
}
