use keccak256::keccak256;

/// Hashes two 32-byte arrays using keccak256(left || right).
fn hash_left_right(left: [u8; 32], right: [u8; 32]) -> [u8; 32] {
    let mut input_bytes: [u8; 64] = [0; 64];
    for i in 0..32 {
        input_bytes[i] = left[i];
        input_bytes[32 + i] = right[i];
    }
    keccak256(input_bytes,32)
}

/// If s == 0: returns (a, b); if s == 1: returns (b, a)
fn dual_mux(a: [u8; 32], b: [u8; 32], s: u8) -> ([u8; 32], [u8; 32]) {
    assert((s == 0) | (s == 1));
    let mut out0: [u8; 32] = [0; 32];
    let mut out1: [u8; 32] = [0; 32];
    for i in 0..32 {
        out0[i] = (b[i] - a[i]) * s + a[i];
        out1[i] = (a[i] - b[i]) * s + b[i];
    }
    (out0, out1)
}

pub fn merkle_tree_checker(
    leaf: [u8; 32],
    root: [u8; 32],
    path: [[u8; 32]; 20],
    path_indices: [u8; 20]
)  {
    let mut current_hash = leaf;
    
    for i in 0..20 {
        let sibling = path[i];
        let index = path_indices[i];
        let (left, right) = dual_mux(current_hash, sibling, index);
        current_hash = hash_left_right(left, right);
    }
    
    assert(current_hash == root);
}
