#!/usr/bin/env node
import { markSemanticDirty } from './checkpoint.mjs';

const files = process.argv.slice(2);
if (files.length) markSemanticDirty(files);
