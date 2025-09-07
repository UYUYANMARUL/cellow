mod U256;
mod merkle_tree;
use U256::U256Bytes;

global NUM_NON_ACCUMULATOR_PUBLIC_INPUTS: u32 = 162;

use bb_proof_verification::{verify_ultrahonk_proof, UltraHonkProof, UltraHonkVerificationKey};
use keccak256::keccak256;
use merkle_tree::merkle_tree_checker;

fn commitment_hasher(nullifier: [u8; 32], secret: [u8; 32]) -> ([u8; 32], [u8; 32]) {
    // Commitment = keccak256(nullifier || secret)
    let mut commitment_input: [u8; 64] = [0; 64];
    for i in 0..32 {
        commitment_input[i] = nullifier[i];
        commitment_input[32 + i] = secret[i];
    }

    let commitment = keccak256(commitment_input,32);
    
    // Nullifier hash = keccak256(nullifier)
    let nullifier_hash = keccak256(nullifier,32);
    
    (commitment, nullifier_hash)
}

struct Balance {
balance:U256Bytes,
owner_commitment:[u8; 32]
}


fn main(
    verification_key: UltraHonkVerificationKey,
    public_inputs: pub [Field; NUM_NON_ACCUMULATOR_PUBLIC_INPUTS],
    key_hash: Field,
    proof: UltraHonkProof,
    path: [[u8; 32]; 20],
    path_indices: [u8; 20],
    secret: [u8; 32],
    root: pub [u8; 32],
    nullifier: pub [u8; 32],
    nullifier_hash: pub [u8; 32],
    counterparty_commitment: [u8; 32],
    amount: U256Bytes
) -> pub (Balance, Balance) {
    // Verify the recursive proof
    verify_ultrahonk_proof(
        verification_key,
        proof,
        public_inputs,
        key_hash,
    );

    // Verify our commitment and merkle inclusion
    let (commitment, computed_nullifier_hash) = commitment_hasher(nullifier, secret);
    assert(computed_nullifier_hash == nullifier_hash);
    merkle_tree_checker(commitment, root, path, path_indices);
    
    // Extract sender balance from public_inputs (previous recursive proof output)
    // Assuming public_inputs contains [sender_balance_limbs(32), receiver_balance_limbs(32), sender_commitment(32), receiver_commitment(32)]
    let mut sender_balance_limbs: [u8; 32] = [0; 32];
    let mut receiver_balance_limbs: [u8; 32] = [0; 32];
    let mut sender_commitment_from_proof: [u8; 32] = [0; 32];
    let mut receiver_commitment_from_proof: [u8; 32] = [0; 32];
    
    // Extract sender balance (first 32 fields)
    for i in 0..32 {
        sender_balance_limbs[i] = public_inputs[i] as u8;
    }
    
    // Extract receiver balance (next 32 fields)
    for i in 0..32 {
        receiver_balance_limbs[i] = public_inputs[i + 32] as u8;
    }
    
    // Extract sender commitment (next 32 fields)
    for i in 0..32 {
        sender_commitment_from_proof[i] = public_inputs[i + 64] as u8;
    }
    
    // Extract receiver commitment (next 32 fields)
    for i in 0..32 {
        receiver_commitment_from_proof[i] = public_inputs[i + 96] as u8;
    }
    
    let sender_balance = U256Bytes::new(sender_balance_limbs);
    let receiver_balance = U256Bytes::new(receiver_balance_limbs);
    
    // Verify that our commitment matches the sender commitment from the proof
    assert(commitment == sender_commitment_from_proof);
    
    // Verify that the counterparty commitment matches the receiver commitment from the proof
    assert(counterparty_commitment == receiver_commitment_from_proof);
    
    // Perform the transfer: subtract from sender, add to receiver
    let new_sender_balance = sender_balance - amount;
    let new_receiver_balance = receiver_balance + amount;
    
    // Return updated balances
    let sender_balance_result = Balance {
        balance: new_sender_balance,
        owner_commitment: commitment
    };
    
    let receiver_balance_result = Balance {
        balance: new_receiver_balance,
        owner_commitment: counterparty_commitment
    };
    
    (sender_balance_result, receiver_balance_result)
}
