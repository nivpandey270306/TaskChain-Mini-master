# Soroban Contract Deployment Guide

Your contract is **compiled and ready to deploy**! 

## Quick Status
- ✅ WASM file compiled: `target/wasm32-unknown-unknown/release/task_registry.wasm`
- ✅ Contract code verified (tests passing)
- ✅ Freighter installed with 10,000 testnet XLM
- ⏳ **NEXT STEP**: Deploy to Stellar testnet

---

## Deployment Options

### Option 1: Using Stellar CLI with Secret Key (Fastest)
If you have your Stellar testnet **secret key** (starts with `S`):

```powershell
cd contracts
stellar contract deploy `
  --network testnet `
  --wasm target/wasm32-unknown-unknown/release/task_registry.wasm `
  --source-account <YOUR-SECRET-KEY>
```

**Result**: Will output a contract ID starting with `C`

---

### Option 2: Manual Signing with Freighter (Secure - No Secret Key Needed)

#### Step 1: Generate Unsigned Transaction
```powershell
cd contracts
stellar contract deploy `
  --network testnet `
  --wasm target/wasm32-unknown-unknown/release/task_registry.wasm `
  --source-account GBYJXZRULF4UMDSPA3GDULKC3YJJF2AICPK4NHTHMK5YJ4MZNCFPUIJV `
  --build-only
```

This will output a base64 XDR string.

#### Step 2: Sign with Freighter Lab
1. Go to https://lab.stellar.org (or alternative: https://soroban-labs.stellar.org/)
2. Click "Transaction Signer"
3. Paste the XDR from Step 1
4. Click "Sign with Freighter"
5. Approve in Freighter popup

#### Step 3: Submit Signed Transaction
- Copy the signed XDR from the Lab
- Submit it back to the network

---

### Option 3: Browser-Based Deployment (Web UI)

Try these web UIs if accessible:
- **Primary**: https://soroban-labs.stellar.org/
- **Backup**: https://lab.stellar.org/
- **Docs**: https://developers.stellar.org/docs/learn/soroban/smart-contracts/deploying

Steps:
1. Click "Deploy Contract"
2. Upload: `target/wasm32-unknown-unknown/release/task_registry.wasm`
3. Click Deploy
4. Sign with Freighter when prompted
5. Copy contract ID from results

---

## What You'll Get

After successful deployment, you'll receive a **contract ID** that looks like:
```
CBEZ4XRLAFZZ7N6GHLFZ65TBHXDM4JTZFWVVUIMDTHLW5BNDKXQLCVU
```

This ID is needed in your `.env` file for the dApp to work.

---

## Next Steps (After Deployment)

Once you have the contract ID, I will:
1. ✅ Update `client/.env` with the contract address
2. ✅ Redeploy to Vercel
3. ✅ Test wallet connection with Freighter
4. ✅ Verify the dApp works end-to-end

---

## Troubleshooting

**"DNS_PROBE_POSSIBLE" error**
- Web labs are unreachable - use CLI or Python helper instead

**"soroban: The term is not recognized"**
- Use `stellar` command instead (already installed)

**"Address cannot be used to sign"**
- You need the secret key, not just public key
- Try web UI option or ask for help if you don't have it

---

## File Locations
- WASM binary: `contracts/target/wasm32-unknown-unknown/release/task_registry.wasm`
- Contract code: `contracts/src/lib.rs`
- Environment file: `client/.env` (will be updated after deployment)

