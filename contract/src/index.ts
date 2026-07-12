import { CompiledContract } from '@midnight-ntwrk/compact-js';

export * as Bhishi from '../managed/bhishi/contract/index.js';
export { createWitnesses, createBhishiPrivateState } from './witnesses.js';
export type { BhishiPrivateState } from './witnesses.js';

import * as BhishiContract from '../managed/bhishi/contract/index.js';
import { createWitnesses } from './witnesses.js';

export const CompiledBhishiContract = CompiledContract.make(
  'bhishi',
  BhishiContract.Contract,
).pipe(
  CompiledContract.withWitnesses(createWitnesses()),
  CompiledContract.withCompiledFileAssets('./managed/bhishi'),
);
