#!/usr/bin/env node

import { findConfigFile, loadConfigFile } from '../config/loadConfig.ts';
import resolveEnvironment from '../environment/index.ts';

export async function main(): Promise<void> {
  const configFilePath = findConfigFile();
  const config = await loadConfigFile(configFilePath);
  const environment = await resolveEnvironment();

  console.log(config, environment);
}

if (import.meta.main) {
  await main();
}
