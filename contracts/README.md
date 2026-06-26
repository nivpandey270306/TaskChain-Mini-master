# TaskRegistry Smart Contract - Soroban (Stellar)

This folder contains the Rust smart contract for Stellar's Soroban platform.

## Configuration

- **Language**: Rust
- **Platform**: Stellar Soroban
- **Network**: Testnet (default)
- **WASM Target**: `wasm32-unknown-unknown`

## Building

```bash
# Install dependencies
npm install

# Build contract to WASM
cargo build --target wasm32-unknown-unknown --release
```

Output: `target/wasm32-unknown-unknown/release/task_registry.wasm`

## Testing

```bash
npm test
```

Runs integrated tests defined in `src/lib.rs`.

## Deployment

```bash
# Setup env
cp .env.example .env
# Edit .env with your Stellar secret key

# Deploy to testnet
npm run deploy
```

## Contract Functions

### `init()`
Initializes the contract. Must be called before other functions.

### `create_task(caller: Address, content: String) -> u64`
Creates a new task and returns its ID.

### `toggle_task(caller: Address, id: u64)`
Toggles task completion status. Only owner can toggle.

### `get_task(id: u64) -> Task`
Retrieves task details by ID.

### `get_user_task_ids(user: Address) -> Vec<u64>`
Returns all task IDs for the provided user address.
