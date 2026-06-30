#![no_std]

use soroban_sdk::{contract, contractimpl, contracttype, Address, Env, String, Vec};

#[derive(Clone)]
#[contracttype]
pub struct Task {
    pub id: u64,
    pub content: String,
    pub done: bool,
    pub owner: Address,
    pub created_at: u64,
}

#[contracttype]
pub enum DataKey {
    NextId,
    Task(u64),
    UserTaskIds(Address),
}

#[contract]
pub struct TaskRegistry;

#[contractimpl]
impl TaskRegistry {
    /// Initialize the contract
    pub fn init(env: Env) {
        let next_id_key = DataKey::NextId;
        if !env.storage().persistent().has(&next_id_key) {
            env.storage().persistent().set(&next_id_key, &1u64);
        }
    }

    /// Create a new task
    pub fn create_task(env: Env, caller: Address, content: String) -> u64 {
        // Get and increment next ID
        let next_id_key = DataKey::NextId;
        let next_id: u64 = env.storage()
            .persistent()
            .get(&next_id_key)
            .unwrap_or(1u64);
        
        let task_id = next_id;
        env.storage().persistent().set(&next_id_key, &(next_id + 1));

        // Create and store task
        let task = Task {
            id: task_id,
            content: content.clone(),
            done: false,
            owner: caller.clone(),
            created_at: env.ledger().timestamp(),
        };

        env.storage().persistent().set(&DataKey::Task(task_id), &task);

        // Add task ID to user's task list
        let user_key = DataKey::UserTaskIds(caller.clone());
        let mut user_tasks: Vec<u64> = env.storage()
            .persistent()
            .get(&user_key)
            .unwrap_or_else(|| Vec::new(&env));
        
        user_tasks.push_back(task_id);
        env.storage().persistent().set(&user_key, &user_tasks);

        // Emit event
        env.events().publish(
            ("task_created",),
            (task_id, caller, content),
        );

        task_id
    }

    /// Toggle task completion status
    pub fn toggle_task(env: Env, caller: Address, id: u64) {
        // Get task
        let task_key = DataKey::Task(id);
        if let Some(mut task) = env.storage().persistent().get::<_, Task>(&task_key) {
            // Verify ownership
            if task.owner == caller {
                // Toggle status
                task.done = !task.done;

                // Store updated task
                env.storage().persistent().set(&task_key, &task);

                // Emit event
                env.events().publish(
                    ("task_toggled",),
                    (id, caller, task.done),
                );
            }
        }
    }

    /// Get task by ID
    pub fn get_task(env: Env, id: u64) -> Option<Task> {
        let task_key = DataKey::Task(id);
        env.storage().persistent().get(&task_key)
    }

    /// Get all task IDs for a user
    pub fn get_user_task_ids(env: Env, user: Address) -> Vec<u64> {
        let user_key = DataKey::UserTaskIds(user);
        env.storage()
            .persistent()
            .get(&user_key)
            .unwrap_or_else(|| Vec::new(&env))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use soroban_sdk::testutils::Address as _;
    use soroban_sdk::testutils::Ledger as _;

    #[test]
    fn test_create_task() {
        let env = Env::default();
        
        let mut ledger_info = env.ledger().get();
        ledger_info.timestamp = 100;
        env.ledger().set(ledger_info);
        
        let contract_id = env.register_contract(None, TaskRegistry);
        let client = TaskRegistryClient::new(&env, &contract_id);
        
        let user = Address::generate(&env);
        
        client.init();
        
        let id = client.create_task(&user, &String::from_str(&env, "Test task"));
        assert_eq!(id, 1);
        
        if let Some(task) = client.get_task(&id) {
            assert_eq!(task.content, String::from_str(&env, "Test task"));
            assert_eq!(task.done, false);
        }
    }

    #[test]
    fn test_toggle_task() {
        let env = Env::default();
        
        let mut ledger_info = env.ledger().get();
        ledger_info.timestamp = 100;
        env.ledger().set(ledger_info);
        
        let contract_id = env.register_contract(None, TaskRegistry);
        let client = TaskRegistryClient::new(&env, &contract_id);
        
        let user = Address::generate(&env);
        
        client.init();
        
        let id = client.create_task(&user, &String::from_str(&env, "Toggle test"));
        
        if let Some(task) = client.get_task(&id) {
            assert_eq!(task.done, false);
        }
        
        client.toggle_task(&user, &id);
        
        if let Some(updated) = client.get_task(&id) {
            assert_eq!(updated.done, true);
        }
    }

    #[test]
    fn test_multiple_users() {
        let env = Env::default();
        let contract_id = env.register_contract(None, TaskRegistry);
        let client = TaskRegistryClient::new(&env, &contract_id);
        
        let user1 = Address::generate(&env);
        let user2 = Address::generate(&env);
        
        client.init();
        
        client.create_task(&user1, &String::from_str(&env, "User 1 task"));
        client.create_task(&user2, &String::from_str(&env, "User 2 task"));
        
        let user1_tasks = client.get_user_task_ids(&user1);
        let user2_tasks = client.get_user_task_ids(&user2);
        
        assert_eq!(user1_tasks.len(), 1);
        assert_eq!(user2_tasks.len(), 1);
    }
}



