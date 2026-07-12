/**
 * Witness implementations for the Bhishi contract.
 *
 * The only witness is the member's secret key — it never leaves the
 * browser. The member's on-chain identity is persistentHash(domain, sk),
 * computed inside the circuit.
 */

export type BhishiPrivateState = {
  readonly secretKey: Uint8Array;
};

export const createBhishiPrivateState = (secretKey: Uint8Array): BhishiPrivateState => ({
  secretKey,
});

export const createWitnesses = () => ({
  localSecretKey: ({
    privateState,
  }: {
    privateState: BhishiPrivateState;
  }): [BhishiPrivateState, Uint8Array] => [privateState, privateState.secretKey],
});
