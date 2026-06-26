import { 
  Contract, 
  Networks, 
  Keypair,
  scValToNative
} from "@stellar/stellar-sdk";

// Stellar network configuration
export const STELLAR_NETWORK = Networks.TESTNET;

export const STELLAR_RPC_URL = "https://soroban-testnet.stellar.org";

// Contract address from environment
export const TASK_REGISTRY_ADDRESS = import.meta.env.VITE_CONTRACT_ADDRESS || "";

export function isValidStellarContractId(contractId) {
  // Soroban contract IDs are StrKey addresses that start with C and are 56 chars.
  return typeof contractId === "string" && /^C[A-Z2-7]{55}$/.test(contractId);
}

// Contract spec - matches Soroban contract methods
export const TASK_REGISTRY_SPEC = {
  methods: {
    init: {
      name: "init",
      inputs: [],
      outputs: []
    },
    create_task: {
      name: "create_task",
      inputs: [{ name: "caller", type: "Address" }, { name: "content", type: "String" }],
      outputs: [{ type: "U64" }]
    },
    toggle_task: {
      name: "toggle_task",
      inputs: [{ name: "caller", type: "Address" }, { name: "id", type: "U64" }],
      outputs: []
    },
    get_task: {
      name: "get_task",
      inputs: [{ name: "id", type: "U64" }],
      outputs: [{ type: "Task" }]
    },
    get_user_task_ids: {
      name: "get_user_task_ids",
      inputs: [{ name: "user", type: "Address" }],
      outputs: [{ type: "Vec<U64>" }]
    }
  }
};

/**
 * Parse a Soroban task contract result
 */
export function parseTask(taskData) {
  if (!taskData) {
    throw new Error("Invalid task data structure");
  }

  // On newer SDKs, scValToNative(Task) returns an object with named fields.
  if (typeof taskData === "object" && !Array.isArray(taskData) && "id" in taskData) {
    return {
      id: Number(taskData.id),
      content: taskData.content,
      done: Boolean(taskData.done),
      owner: taskData.owner,
      createdAt: Number(taskData.created_at ?? taskData.createdAt ?? 0)
    };
  }

  // Some SDK versions return a positional array for struct values.
  if (Array.isArray(taskData) && taskData.length >= 5) {
    return {
      id: Number(taskData[0]),
      content: String(taskData[1] ?? ""),
      done: Boolean(taskData[2]),
      owner: taskData[3],
      createdAt: Number(taskData[4] ?? 0)
    };
  }

  // Some SDK versions return a Map-like object.
  if (typeof taskData?.get === "function") {
    const id = taskData.get("id");
    const content = taskData.get("content");
    const done = taskData.get("done");
    const owner = taskData.get("owner");
    const createdAt = taskData.get("created_at") ?? taskData.get("createdAt");

    if (id !== undefined) {
      return {
        id: Number(id),
        content: String(content ?? ""),
        done: Boolean(done),
        owner,
        createdAt: Number(createdAt ?? 0)
      };
    }
  }

  if (!Array.isArray(taskData.fields)) {
    throw new Error("Invalid task data structure");
  }

  const fields = taskData.fields;
  return {
    id: Number(scValToNative(fields[0])),
    content: scValToNative(fields[1]),
    done: scValToNative(fields[2]),
    owner: scValToNative(fields[3]),
    createdAt: Number(scValToNative(fields[4]))
  };
}

/**
 * Initialize Stellar contract instance
 */
export async function initializeContract(contractAddress, rpcUrl = STELLAR_RPC_URL) {
  if (!contractAddress) {
    throw new Error("Missing contract address. Set VITE_CONTRACT_ADDRESS in .env");
  }

  return {
    contractAddress,
    rpcUrl,
    spec: TASK_REGISTRY_SPEC
  };
}

/**
 * Parse Stellar wallet address format
 */
export function formatStellarAddress(publicKey) {
  if (!publicKey) return "";
  // Stellar public keys are 56 characters starting with 'G'
  if (publicKey.startsWith("G") && publicKey.length === 56) {
    return publicKey;
  }
  throw new Error("Invalid Stellar public key format");
}

export const TASK_REGISTRY_ABI = TASK_REGISTRY_SPEC;
