import { UltraHonkBackend, UltraPlonkBackend } from "@aztec/bb.js";
import { Noir } from "@noir-lang/noir_js";
import circuit from "@/circuit/recursive_transfer_circuit.json";
import {
  hashMessage,
  id,
  JsonRpcSigner,
  keccak256,
  sha256,
  SigningKey,
  toUtf8Bytes,
  Wallet,
  getBytes,
  getAddress,
} from "ethers";
import {
  bigIntToU8Array,
  addressToBytes,
  type CircuitUtxo,
  UtxoToBytes,
} from "@/lib/utils";

export interface Balance {
  balance: number[];
  owner_commitment: number[];
}

export interface RecursiveProofInputs {
  verification_key: any;
  public_inputs: number[];
  key_hash: string;
  proof: any;
  path: number[][];
  path_indices: number[];
  secret: number[];
  root: number[];
  nullifier: number[];
  nullifier_hash: number[];
  counterparty_commitment: number[];
  amount: number[];
}

export function commitmentHasher(
  nullifier: Uint8Array,
  secret: Uint8Array,
): [Uint8Array, Uint8Array] {
  const commitmentInput = new Uint8Array(64);
  commitmentInput.set(nullifier, 0);
  commitmentInput.set(secret, 32);
  const commitment = getBytes(keccak256(commitmentInput));

  const nullifierHash = getBytes(keccak256(nullifier));

  return [commitment, nullifierHash];
}

export function generateSecret(): Uint8Array {
  const secret = new Uint8Array(32);
  crypto.getRandomValues(secret);
  return secret;
}

export function generateNullifier(): Uint8Array {
  const nullifier = new Uint8Array(32);
  crypto.getRandomValues(nullifier);
  return nullifier;
}

export function bigIntToU256Bytes(value: bigint): number[] {
  return bigIntToU8Array(value, 32);
}

export function createMerklePath(
  leaf: Uint8Array,
  tree: Uint8Array[][],
  leafIndex: number,
): { path: number[][]; pathIndices: number[] } {
  const path: number[][] = [];
  const pathIndices: number[] = [];

  let currentIndex = leafIndex;
  let currentLevel = tree[0];

  for (let level = 0; level < 20; level++) {
    const siblingIndex =
      currentIndex % 2 === 0 ? currentIndex + 1 : currentIndex - 1;

    if (siblingIndex < currentLevel.length) {
      path.push(Array.from(currentLevel[siblingIndex]));
      pathIndices.push(currentIndex % 2);
    } else {
      path.push(new Array(32).fill(0));
      pathIndices.push(0);
    }

    currentIndex = Math.floor(currentIndex / 2);
    if (level + 1 < tree.length) {
      currentLevel = tree[level + 1];
    }
  }

  return { path, pathIndices };
}

export async function createRecursiveTransferProof(
  innerVerificationKey: any,
  innerProof: any,
  innerPublicInputs: number[],
  innerKeyHash: string,

  merkleRoot: string,
  merkleTree: Uint8Array[][],
  leafIndex: number,

  secret: Uint8Array,
  nullifier: Uint8Array,
  counterpartyCommitment: Uint8Array,
  transferAmount: bigint,
): Promise<{ proof: string; publicInputs: any }> {
  const noir = new Noir(circuit);
  const backend = new UltraHonkBackend(circuit.bytecode);

  const [commitment, nullifierHash] = commitmentHasher(nullifier, secret);

  const { path, pathIndices } = createMerklePath(
    commitment,
    merkleTree,
    leafIndex,
  );

  const privateInputs: RecursiveProofInputs = {
    verification_key: innerVerificationKey,
    public_inputs: innerPublicInputs,
    key_hash: innerKeyHash,
    proof: innerProof,
    path: path,
    path_indices: pathIndices,
    secret: Array.from(secret),
    root: Array.from(getBytes(merkleRoot)),
    nullifier: Array.from(nullifier),
    nullifier_hash: Array.from(nullifierHash),
    counterparty_commitment: Array.from(counterpartyCommitment),
    amount: bigIntToU256Bytes(transferAmount),
  };

  const { witness, returnValue } = await noir.execute(privateInputs);

  const proof = await backend.generateProof(witness, { keccak: true });

  const isValid = await backend.verifyProof(proof);
  if (!isValid) {
    throw new Error("Generated proof is invalid");
  }

  return {
    proof: proof.proof.toHex(),
    publicInputs: proof.publicInputs,
  };
}

export function extractBalancesFromPublicInputs(publicInputs: number[]): {
  senderBalance: Balance;
  receiverBalance: Balance;
} {
  const senderBalanceBytes = publicInputs.slice(0, 32);

  const receiverBalanceBytes = publicInputs.slice(32, 64);

  const senderCommitment = publicInputs.slice(64, 96);

  const receiverCommitment = publicInputs.slice(96, 128);

  return {
    senderBalance: {
      balance: senderBalanceBytes,
      owner_commitment: senderCommitment,
    },
    receiverBalance: {
      balance: receiverBalanceBytes,
      owner_commitment: receiverCommitment,
    },
  };
}

export async function createCompleteTransferProof(
  signer: JsonRpcSigner,
  senderUtxos: any[],

  transferAmount: bigint,
  receiverCommitment: Uint8Array,

  merkleRoot: string,
  merkleTree: Uint8Array[][],
  senderLeafIndex: number,

  senderSecret: Uint8Array,
  senderNullifier: Uint8Array,
): Promise<{
  innerProof: { proof: string; publicInputs: any };
  recursiveProof: { proof: string; publicInputs: any };
}> {
  const sendDepositHash =
    "0x" + Buffer.from(generateNullifier()).toString("hex");
  const leftDepositHash =
    "0x" + Buffer.from(generateNullifier()).toString("hex");

  const innerProof = await createSendDirectProof(
    signer,
    senderUtxos,
    transferAmount,
    sendDepositHash,
    leftDepositHash,
  );

  const innerVerificationKey = null;
  const innerKeyHash = "0x0";

  const senderBalance = bigIntToU256Bytes(
    senderUtxos.reduce((sum, utxo) => sum + utxo.amount, 0n),
  );
  const receiverBalance = bigIntToU256Bytes(0n);
  const senderCommitment = Array.from(
    commitmentHasher(senderNullifier, senderSecret)[0],
  );
  const receiverCommitmentArray = Array.from(receiverCommitment);

  const structuredPublicInputs = [
    ...senderBalance,
    ...receiverBalance,
    ...senderCommitment,
    ...receiverCommitmentArray,
    ...new Array(162 - 128).fill(0),
  ];

  const recursiveProof = await createRecursiveTransferProof(
    innerVerificationKey,
    innerProof,
    structuredPublicInputs,
    innerKeyHash,
    merkleRoot,
    merkleTree,
    senderLeafIndex,
    senderSecret,
    senderNullifier,
    receiverCommitment,
    transferAmount,
  );

  return {
    innerProof,
    recursiveProof,
  };
}

export function createUserCommitment(
  nullifier: Uint8Array,
  secret: Uint8Array,
): Uint8Array {
  return commitmentHasher(nullifier, secret)[0];
}

export function verifyMerkleInclusion(
  commitment: Uint8Array,
  root: Uint8Array,
  path: Uint8Array[],
  pathIndices: number[],
): boolean {
  let currentHash = commitment;

  for (let i = 0; i < path.length; i++) {
    const sibling = path[i];
    const isLeft = pathIndices[i] === 0;

    const input = new Uint8Array(64);
    if (isLeft) {
      input.set(currentHash, 0);
      input.set(sibling, 32);
    } else {
      input.set(sibling, 0);
      input.set(currentHash, 32);
    }

    currentHash = getBytes(keccak256(input));
  }

  return Buffer.from(currentHash).equals(Buffer.from(root));
}
