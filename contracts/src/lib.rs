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
    use soroban_sdk::testutils::Address as AddressTestUtils;

    #[test]
    fn test_create_task() {
        let env = Env::default();
        env.ledger().set_timestamp(100);
        
        let contract = TaskRegistry;
        let user = Address::random(&env);
        
        contract.init(env.clone());
        
        let id = contract.create_task(env.clone(), user.clone(), String::from_slice(&env, "Test task"));
        assert_eq!(id, 1);
        
        if let Some(task) = contract.get_task(env, id) {
            assert_eq!(task.content, String::from_slice(&env, "Test task"));
            assert_eq!(task.done, false);
        }
    }

    #[test]
    fn test_toggle_task() {
        let env = Env::default();
        env.ledger().set_timestamp(100);
        
        let contract = TaskRegistry;
        let user = Address::random(&env);
        
        contract.init(env.clone());
        
        let id = contract.create_task(env.clone(), user.clone(), String::from_slice(&env, "Toggle test"));
        
        if let Some(task) = contract.get_task(env.clone(), id) {
            assert_eq!(task.done, false);
        }
        
        contract.toggle_task(env.clone(), user.clone(), id);
        
        if let Some(updated) = contract.get_task(env, id) {
            assert_eq!(updated.done, true);
        }
    }

    #[test]
    fn test_multiple_users() {
        let env = Env::default();
        let contract = TaskRegistry;
        let user1 = Address::random(&env);
        let user2 = Address::random(&env);
        
        contract.init(env.clone());
        
        contract.create_task(env.clone(), user1.clone(), String::from_slice(&env, "User 1 task"));
        contract.create_task(env.clone(), user2.clone(), String::from_slice(&env, "User 2 task"));
        
        let user1_tasks = contract.get_user_task_ids(env.clone(), user1);
        let user2_tasks = contract.get_user_task_ids(env, user2);
        
        assert_eq!(user1_tasks.len(), 1);
        assert_eq!(user2_tasks.len(), 1);
    }
}
