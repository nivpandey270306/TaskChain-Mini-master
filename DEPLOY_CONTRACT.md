# Deploy Your Soroban Contract to Stellar Testnet

## Current Status
- ✅ Contract code: Compiled to WASM (`task_registry.wasm`)
- ✅ Tests: All passing (3/3)
- ✅ dApp: Deployed to Vercel
- ✅ `.env` file: Updated with placeholder contract address
- ⏳ **NEXT**: Deploy your contract with your secret key

---

## How to Deploy (3 Simple Steps)

### Step 1: Get Your Secret Key from Freighter

1. Open **Freighter** browser extension
2. Click **Settings** (gear icon, bottom left)
3. Find **"Export Private Key"** or **"Show Secret Key"**
4. Enter your Freighter password
5. Copy the key (starts with `S`)

### Step 2: Run Deployment Command

In your **PowerShell terminal**, run:

```powershell
cd "d:\Frontend Projects\TaskChain-Mini\contracts"

stellar contract deploy `
  --network testnet `
  --wasm target/wasm32-unknown-unknown/release/task_registry.wasm `
  --source-account "YOUR-SECRET-KEY-HERE"
```

**Replace `YOUR-SECRET-KEY-HERE`** with your actual secret key from Step 1.

### Step 3: Update `.env` with Your Contract ID

When the command succeeds, you'll see output like:
```
✅ Contract deployed!
Contract ID: CBEZ4XRLAFZZ7N6GHLFZ65TBHXDM4JTZFWVVUIMDTHLW5BNDKXQLCVU
```

1. Copy that contract ID (the one starting with `C`)
2. Open: `client/.env`
3. Replace the placeholder with your contract ID:
   ```
   VITE_CONTRACT_ADDRESS=YOUR-CONTRACT-ID-HERE
   ```
4. Save the file

### Step 4: Redeploy to Vercel

```powershell
cd "d:\Frontend Projects\TaskChain-Mini"
git add client/.env
git commit -m "Update: Deploy real Soroban contract address"
git push origin main
```

Vercel will auto-redeploy with your real contract address!

---

## Troubleshooting

### "Failed to find config identity"
→ Your secret key format is wrong. Make sure it:
- Starts with `S`
- Is wrapped in quotes: `"your-key"`
- Has no extra spaces

### "Not enough balance"
→ Fund your account at: **https://friendbot.stellar.org/**
(Paste your public key: `GBYJXZRULF4UMDSPA3GDULKC3YJJF2AICPK4NHTHMK5YJ4MZNCFPUIJV`)

### Command times out
→ Network issues. Try again in a few minutes.

---

## Security Reminder

⚠️ **NEVER** share your secret key (`S...`) with anyone
✅ It's safe to share your public key (`G...`)

---

## Questions?

All commands are in `contracts/DEPLOYMENT_GUIDE.md` for reference.

Good luck! 🚀
