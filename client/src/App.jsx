import { useEffect, useMemo, useState } from "react";
import {
  SorobanRpc,
  Contract,
  Address,
  Keypair,
  nativeToScVal,
  scValToNative,
  Networks,
  TransactionBuilder,
  BASE_FEE
} from "@stellar/stellar-sdk";
import { getAddress, isConnected, requestAccess, signTransaction } from "@stellar/freighter-api";
import ProgressBar from "./components/ProgressBar";
import {
  TASK_REGISTRY_ADDRESS,
  STELLAR_RPC_URL,
  STELLAR_NETWORK,
  parseTask,
  formatStellarAddress,
  isValidStellarContractId
} from "./lib/contract";
import { clearCachedTasks, readCachedTasks, writeCachedTasks } from "./lib/cache";

const FREIGHTER_TIMEOUT = 3000; // 3 seconds for Freighter popup

function getSimulationErrorMessage(simResp) {
  if (!simResp) return "unknown simulation error";
  if (simResp.error && typeof simResp.error === "string") return simResp.error;
  if (simResp.result?.error && typeof simResp.result.error === "string") return simResp.result.error;
  try {
    return JSON.stringify(simResp);
  } catch {
    return "simulation failed with non-serializable response";
  }
}

function getTransactionXdr(txOrBuilder) {
  const tx = typeof txOrBuilder?.build === "function" ? txOrBuilder.build() : txOrBuilder;

  if (typeof tx?.toXDR === "function") {
    return tx.toXDR();
  }

  if (typeof tx?.toEnvelope === "function") {
    return tx.toEnvelope().toXDR("base64");
  }

  throw new Error("Unable to serialize transaction for wallet signing");
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function getTransactionStatusXdrSafe(rpcUrl, hash) {
  const response = await fetch(rpcUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 2,
      method: "getTransaction",
      params: {
        hash
      }
    })
  });

  if (!response.ok) {
    throw new Error(`RPC HTTP error: ${response.status}`);
  }

  const payload = await response.json();
  if (payload.error) {
    // Treat lookup failures as not yet indexed.
    return { status: "NOT_FOUND", error: payload.error };
  }

  return payload.result || { status: "NOT_FOUND" };
}

async function waitForTransaction(rpcUrl, hash, maxAttempts = 40, delayMs = 1500) {
  let lastResult = { status: "NOT_FOUND" };

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const result = await getTransactionStatusXdrSafe(rpcUrl, hash);
    lastResult = result || { status: "NOT_FOUND" };

    if (lastResult.status === "SUCCESS" || lastResult.status === "FAILED") {
      return lastResult;
    }

    if (lastResult.status === "NOT_FOUND" || lastResult.status === "PENDING") {
      await sleep(delayMs);
      continue;
    }

    return lastResult;
  }

  return lastResult;
}

async function sendSignedTransactionXdr(rpcUrl, signedTxXdr) {
  const response = await fetch(rpcUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "sendTransaction",
      params: {
        transaction: signedTxXdr
      }
    })
  });

  if (!response.ok) {
    throw new Error(`RPC HTTP error: ${response.status}`);
  }

  const payload = await response.json();
  if (payload.error) {
    throw new Error(`RPC sendTransaction error: ${JSON.stringify(payload.error)}`);
  }

  return payload.result;
}

export default function App() {
  const [account, setAccount] = useState("");
  const [tasks, setTasks] = useState([]);
  const [newTask, setNewTask] = useState("");
  const [status, setStatus] = useState("Connect your wallet to begin.");
  const [isFetching, setIsFetching] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [sorobanServer, setSorobanServer] = useState(null);

  const shortAccount = useMemo(() => {
    if (!account) return "";
    return `${account.slice(0, 6)}...${account.slice(-4)}`;
  }, [account]);

  // Initialize Soroban RPC server
  useEffect(() => {
    try {
      const server = new SorobanRpc.Server(STELLAR_RPC_URL);
      setSorobanServer(server);
    } catch (error) {
      setStatus("Failed to initialize Soroban connection");
    }
  }, []);

  // Check for Freighter wallet availability via official API
  useEffect(() => {
    const checkFreighter = async () => {
      try {
        const result = await isConnected();
        if (result?.isConnected) {
          setStatus("Freighter detected. Click 'Connect Freighter' to begin.");
          return;
        }
      } catch (error) {
        console.error("Freighter availability check failed:", error);
      }

      setStatus("Freighter wallet not found. Please install it from freighter.app and refresh.");
    };

    checkFreighter();
  }, []);

  async function connectWallet() {
    try {
      setStatus("🔗 Connecting to Freighter...");

      const connected = await isConnected();
      if (!connected?.isConnected) {
        throw new Error("Freighter extension not available. Please install and enable it.");
      }

      // Request site permission first (required by Freighter before exposing account)
      const accessResult = await requestAccess();
      if (accessResult?.error) {
        const reason = accessResult.error.message || "Freighter denied access";
        throw new Error(`Wallet permission required: ${reason}`);
      }

      // Prefer address from permission response, then fallback to getAddress
      let publicKey = accessResult?.publicKey || "";
      if (!publicKey) {
        const addressResult = await getAddress();
        if (addressResult?.error) {
          throw new Error(addressResult.error.message || "Failed to read public key from Freighter");
        }
        publicKey = addressResult?.address || "";
      }
      
      if (!publicKey) {
        throw new Error("Failed to get public key from Freighter");
      }

      // Verify it's a valid Stellar public key
      formatStellarAddress(publicKey);
      setAccount(publicKey);
      setStatus("✅ Wallet connected successfully!");
      console.log("Connected account:", publicKey);
      
      // Fetch tasks after connecting
      setTimeout(() => fetchTasks(true), 500);
    } catch (error) {
      const message = error.message || "Failed to connect wallet";
      setStatus("❌ Connection failed: " + message);
      console.error("Wallet connection error:", error);
    }
  }

  async function fetchTasks(force = false) {
    if (!account || !sorobanServer) return;

    const cached = force ? null : readCachedTasks(account);
    if (cached && cached.length > 0) {
      setTasks(cached);
      setStatus("Loaded tasks from cache.");
      return;
    }

    setIsFetching(true);
    try {
      if (!TASK_REGISTRY_ADDRESS) {
        throw new Error("Missing VITE_CONTRACT_ADDRESS in frontend env");
      }
      if (!isValidStellarContractId(TASK_REGISTRY_ADDRESS)) {
        throw new Error("Invalid contract ID in build env. Set VITE_CONTRACT_ADDRESS to a Stellar contract ID (starts with C). If deployed on Vercel, update Project Settings -> Environment Variables.");
      }

      // Create contract instance
      const contract = new Contract(TASK_REGISTRY_ADDRESS, {});

      // Build and invoke getMyTaskIds (read-only, doesn't require signing)
      const accountData = await sorobanServer.getAccount(account);
      
      // Build transaction to read task IDs
      let builder = new TransactionBuilder(accountData, {
        fee: BASE_FEE,
        networkPassphrase: STELLAR_NETWORK
      });

      // Build getMyTaskIds invocation
      const getIdsOp = contract.call(
        "get_user_task_ids",
        new Address(account).toScVal(),
      );

      builder.addOperation(getIdsOp);
      const tx = builder.setTimeout(30).build();

      // Simulate first to get resource fees
      const simResp = await sorobanServer.simulateTransaction(tx);
      if (SorobanRpc.Api.isSimulationError(simResp)) {
        throw new Error("Failed to simulate getMyTaskIds");
      }

      if (
        SorobanRpc.Api.isSimulationSuccess(simResp) &&
        simResp.result?.retval
      ) {
        const idsVal = simResp.result.retval;
        const ids = scValToNative(idsVal);

        if (!Array.isArray(ids)) {
          setTasks([]);
          writeCachedTasks(account, []);
          setStatus("No tasks found.");
          return;
        }

        // Fetch each task details
        const items = await Promise.all(
          ids.map(async (id) => {
            try {
              const getTaskBuilder = new TransactionBuilder(accountData, {
                fee: BASE_FEE,
                networkPassphrase: STELLAR_NETWORK
              });

              const getTaskOp = contract.call(
                "get_task",
                nativeToScVal(id, { type: "u64" })
              );

              getTaskBuilder.addOperation(getTaskOp);
              const taskTx = getTaskBuilder.setTimeout(30).build();

              const simTaskResp = await sorobanServer.simulateTransaction(taskTx);
              
              if (
                SorobanRpc.Api.isSimulationSuccess(simTaskResp) &&
                simTaskResp.result?.retval
              ) {
                const taskVal = simTaskResp.result.retval;
                const nativeTask = scValToNative(taskVal);
                return parseTask(nativeTask);
              }

              return null;
            } catch (err) {
              console.error(`Error fetching task ${id}:`, err);
              return null;
            }
          })
        );

        const validTasks = items.filter((t) => t !== null);
        validTasks.sort((a, b) => b.id - a.id);
        setTasks(validTasks);
        writeCachedTasks(account, validTasks);
        setStatus(`Loaded ${validTasks.length} task(s) from chain.`);
      } else {
        setTasks([]);
        writeCachedTasks(account, []);
        setStatus("No tasks found.");
      }
    } catch (error) {
      const message = error.message || "Could not load tasks.";
      setStatus(message);
      console.error("Fetch tasks error:", error);
    } finally {
      setIsFetching(false);
    }
  }

  async function handleCreateTask(event) {
    event.preventDefault();
    if (!newTask.trim()) return;

    setIsSubmitting(true);
    try {
      const connected = await isConnected();
      if (!connected?.isConnected) throw new Error("Freighter wallet not connected");

      if (!account || !sorobanServer) {
        throw new Error("Wallet not connected or Soroban server not initialized");
      }

      if (!TASK_REGISTRY_ADDRESS) {
        throw new Error("Missing contract address");
      }
      if (!isValidStellarContractId(TASK_REGISTRY_ADDRESS)) {
        throw new Error("Invalid contract ID in build env. Set VITE_CONTRACT_ADDRESS to a Stellar contract ID (starts with C). If deployed on Vercel, update Project Settings -> Environment Variables.");
      }

      setStatus("Preparing transaction...");

      const contract = new Contract(TASK_REGISTRY_ADDRESS, {});
      const accountData = await sorobanServer.getAccount(account);

      const builder = new TransactionBuilder(accountData, {
        fee: BASE_FEE,
        networkPassphrase: STELLAR_NETWORK
      });

      const createOp = contract.call(
        "create_task",
        new Address(account).toScVal(),
        nativeToScVal(newTask.trim(), { type: "string" })
      );

      builder.addOperation(createOp);
      const tx = builder.setTimeout(30).build();

      // Simulate to get fees
      setStatus("Simulating transaction...");
      const simResp = await sorobanServer.simulateTransaction(tx);

      if (!SorobanRpc.Api.isSimulationSuccess(simResp)) {
        throw new Error(`Transaction simulation failed: ${getSimulationErrorMessage(simResp)}`);
      }

      // Assemble with resource fees
      const assembled = SorobanRpc.assembleTransaction(tx, simResp);
      const unsignedTxXdr = getTransactionXdr(assembled);

      // Sign with Freighter
      setStatus("Waiting for signature...");
      const signResult = await signTransaction(unsignedTxXdr, {
        networkPassphrase: STELLAR_NETWORK,
        address: account
      });
      const signedTxn = signResult?.signedTxXdr;
      if (!signedTxn) throw new Error(signResult?.error || "Freighter signature failed");

      // Send to network
      setStatus("Submitting transaction...");
      const txResponse = await sendSignedTransactionXdr(STELLAR_RPC_URL, signedTxn);

      if (!txResponse?.hash) {
        throw new Error(`Transaction submission did not return a hash: ${JSON.stringify(txResponse)}`);
      }

      if (txResponse.status === "ERROR") {
        throw new Error(`Transaction submission failed: ${JSON.stringify(txResponse)}`);
      }

      // Poll for transaction completion
      const txResult = await waitForTransaction(STELLAR_RPC_URL, txResponse.hash);

      if (txResult.status === "FAILED") {
        throw new Error(`Transaction failed on chain: ${JSON.stringify(txResult)}`);
      }

      if (txResult.status !== "SUCCESS") {
        throw new Error(`Unexpected transaction status: ${txResult.status} (hash: ${txResponse.hash})`);
      }

      setNewTask("");
      clearCachedTasks(account);
      setStatus("Task created successfully. Refreshing...");
      
      await new Promise((resolve) => setTimeout(resolve, 1000));
      await fetchTasks(true);
      setStatus("Task created successfully.");
    } catch (error) {
      const message = error.message || "Failed to create task";
      setStatus(message);
      console.error("Create task error:", error);
    } finally {
      setIsSubmitting(false);
    }
  }

  async function toggleTask(id) {
    setIsSubmitting(true);
    try {
      const connected = await isConnected();
      if (!connected?.isConnected) throw new Error("Freighter wallet not connected");

      if (!account || !sorobanServer) {
        throw new Error("Wallet not connected or Soroban server not initialized");
      }

      if (!TASK_REGISTRY_ADDRESS) {
        throw new Error("Missing contract address");
      }
      if (!isValidStellarContractId(TASK_REGISTRY_ADDRESS)) {
        throw new Error("Invalid contract ID in build env. Set VITE_CONTRACT_ADDRESS to a Stellar contract ID (starts with C). If deployed on Vercel, update Project Settings -> Environment Variables.");
      }

      setStatus("Preparing toggle transaction...");

      const contract = new Contract(TASK_REGISTRY_ADDRESS, {});
      const accountData = await sorobanServer.getAccount(account);

      const builder = new TransactionBuilder(accountData, {
        fee: BASE_FEE,
        networkPassphrase: STELLAR_NETWORK
      });

      const toggleOp = contract.call(
        "toggle_task",
        new Address(account).toScVal(),
        nativeToScVal(id, { type: "u64" })
      );

      builder.addOperation(toggleOp);
      const tx = builder.setTimeout(30).build();

      // Simulate
      setStatus("Simulating transaction...");
      const simResp = await sorobanServer.simulateTransaction(tx);

      if (!SorobanRpc.Api.isSimulationSuccess(simResp)) {
        throw new Error(`Transaction simulation failed: ${getSimulationErrorMessage(simResp)}`);
      }

      const assembled = SorobanRpc.assembleTransaction(tx, simResp);
      const unsignedTxXdr = getTransactionXdr(assembled);

      // Sign
      setStatus("Waiting for signature...");
      const signResult = await signTransaction(unsignedTxXdr, {
        networkPassphrase: STELLAR_NETWORK,
        address: account
      });
      const signedTxn = signResult?.signedTxXdr;
      if (!signedTxn) throw new Error(signResult?.error || "Freighter signature failed");

      // Send
      setStatus("Submitting transaction...");
      const txResponse = await sendSignedTransactionXdr(STELLAR_RPC_URL, signedTxn);

      if (!txResponse?.hash) {
        throw new Error(`Transaction submission did not return a hash: ${JSON.stringify(txResponse)}`);
      }

      if (txResponse.status === "ERROR") {
        throw new Error(`Transaction submission failed: ${JSON.stringify(txResponse)}`);
      }

      // Poll
      const txResult = await waitForTransaction(STELLAR_RPC_URL, txResponse.hash);

      if (txResult.status === "FAILED") {
        throw new Error(`Transaction failed on chain: ${JSON.stringify(txResult)}`);
      }

      if (txResult.status !== "SUCCESS") {
        throw new Error(`Unexpected transaction status: ${txResult.status} (hash: ${txResponse.hash})`);
      }

      clearCachedTasks(account);
      setStatus("Task updated. Refreshing...");
      
      await new Promise((resolve) => setTimeout(resolve, 1000));
      await fetchTasks(true);
      setStatus("Task updated successfully.");
    } catch (error) {
      const message = error.message || "Failed to update task";
      setStatus(message);
      console.error("Toggle task error:", error);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="page-shell">
      <section className="card">
        <header className="card-header">
          <h1>TaskChain Mini dApp</h1>
          <p>Manage your task list on Stellar blockchain with Freighter wallet.</p>
          <div className="header-actions">
            <button onClick={connectWallet} disabled={isSubmitting}>
              {account ? `Connected: ${shortAccount}` : "Connect Freighter"}
            </button>
            <button
              onClick={() => fetchTasks(true)}
              disabled={!account || isFetching || isSubmitting}
            >
              {isFetching ? "Loading..." : "Refresh Tasks"}
            </button>
          </div>
        </header>

        <ProgressBar visible={isSubmitting} label="Waiting for blockchain confirmation" />

        <form className="task-form" onSubmit={handleCreateTask}>
          <label htmlFor="task-content">New task</label>
          <div className="form-row">
            <input
              id="task-content"
              type="text"
              placeholder="e.g. Record Orange Belt demo"
              value={newTask}
              onChange={(e) => setNewTask(e.target.value)}
              disabled={!account || isSubmitting}
            />
            <button type="submit" disabled={!account || isSubmitting || !newTask.trim()}>
              Add Task
            </button>
          </div>
        </form>

        <section className="task-list-section">
          <h2>Your Tasks</h2>
          {tasks.length === 0 ? (
            <p className="empty">No tasks yet. Create your first one.</p>
          ) : (
            <ul className="task-list">
              {tasks.map((task) => (
                <li key={task.id} className={task.done ? "done" : "pending"}>
                  <div>
                    <strong>#{task.id}</strong>
                    <p>{task.content}</p>
                  </div>
                  <button onClick={() => toggleTask(task.id)} disabled={isSubmitting}>
                    Mark as {task.done ? "Pending" : "Done"}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        <footer className="status-bar">Status: {status}</footer>
      </section>
    </main>
  );
}
