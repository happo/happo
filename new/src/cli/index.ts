#!/usr/bin/env node

import { up as findUp } from 'empathic/find';

const cliFile = findUp('happo.config.ts', { cwd: process.cwd() });
console.log(cliFile);
