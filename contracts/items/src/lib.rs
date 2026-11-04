//! Nims items — ONE NEP-245 multi-token contract that holds every item type.
//!
//! Token ids are item names ("iron", "tomatoes", ...). Never deploy a contract per item.
//!
//! Implemented from NEP-245: mt_transfer, mt_batch_transfer, mt_balance_of,
//! mt_batch_balance_of, mt_supply, plus nep245 `mt_mint` / `mt_transfer` events.
//! Deliberately left out for v1: approvals and mt_transfer_call (no receiver callbacks yet).
//!
//! Nims extension: `settle` applies many trades atomically, callable only by the
//! settler (the relayer). This is how the server batch-settles gameplay trades so
//! the player never waits on a block (see DESIGN.md §4).

use near_sdk::json_types::U128;
use near_sdk::store::LookupMap;
use near_sdk::{
    assert_one_yocto, env, near, require, serde::Deserialize, serde::Serialize, serde_json::json, AccountId,
    BorshStorageKey, NearSchema, PanicOnDefault,
};

#[derive(BorshStorageKey)]
#[near]
enum Key {
    Balances,
    Supply,
    SendSeq,
}

/// One leg of a batch settlement: `from` hands `amount` of `token_id` to `to`.
#[derive(Serialize, Deserialize, NearSchema, Clone)]
#[serde(crate = "near_sdk::serde")]
#[abi(json)]
pub struct Transfer {
    pub from: AccountId,
    pub to: AccountId,
    pub token_id: String,
    pub amount: U128,
}

/// One entry of a batch mint.
#[derive(Serialize, Deserialize, NearSchema, Clone)]
#[serde(crate = "near_sdk::serde")]
#[abi(json)]
pub struct MintEntry {
    pub account_id: AccountId,
    pub token_id: String,
    pub amount: U128,
}

/// One outgoing leg of `send_many`; the sender is whoever signs the call.
#[derive(Serialize, Deserialize, NearSchema, Clone)]
#[serde(crate = "near_sdk::serde")]
#[abi(json)]
pub struct Leg {
    pub receiver_id: AccountId,
    pub token_id: String,
    pub amount: U128,
}

#[derive(PanicOnDefault)]
#[near(contract_state)]
pub struct Contract {
    owner_id: AccountId,
    settler_id: AccountId,
    /// "token_id\u{1f}account_id" -> balance
    balances: LookupMap<String, u128>,
    supply: LookupMap<String, u128>,
    /// Last sequence number applied for each sender's `send_many`. Makes a retried call a harmless no-op.
    send_seq: LookupMap<AccountId, u64>,
    /// Last sequence number applied for the owner's `batch_mint`.
    mint_seq: u64,
}

/// The state before sequence numbers existed. `migrate` reads it and adds the new fields; balances are kept.
#[near(serializers=[borsh])]
pub struct OldContract {
    owner_id: AccountId,
    settler_id: AccountId,
    balances: LookupMap<String, u128>,
    supply: LookupMap<String, u128>,
}

fn bal_key(token_id: &str, account: &AccountId) -> String {
    format!("{}\u{1f}{}", token_id, account)
}

fn emit(event: &str, data: near_sdk::serde_json::Value) {
    env::log_str(&format!(
        "EVENT_JSON:{}",
        json!({ "standard": "nep245", "version": "1.0.0", "event": event, "data": [data] })
    ));
}

#[near]
impl Contract {
    #[init]
    pub fn new(owner_id: AccountId, settler_id: Option<AccountId>) -> Self {
        Self {
            settler_id: settler_id.unwrap_or_else(|| owner_id.clone()),
            owner_id,
            balances: LookupMap::new(Key::Balances),
            supply: LookupMap::new(Key::Supply),
            send_seq: LookupMap::new(Key::SendSeq),
            mint_seq: 0,
        }
    }

    /// Upgrade from the version without sequence numbers. Keeps every balance.
    #[private]
    #[init(ignore_state)]
    pub fn migrate() -> Self {
        let old: OldContract = env::state_read().expect("No old state to migrate");
        Self {
            owner_id: old.owner_id,
            settler_id: old.settler_id,
            balances: old.balances,
            supply: old.supply,
            send_seq: LookupMap::new(Key::SendSeq),
            mint_seq: 0,
        }
    }

    // ---- admin ---------------------------------------------------------------

    /// Create `amount` of `token_id` and give it to `account_id`. Owner only.
    pub fn mint(&mut self, account_id: AccountId, token_id: String, amount: U128) {
        require!(env::predecessor_account_id() == self.owner_id, "Only the owner can mint");
        self.mint_one(account_id, token_id, amount.0);
    }

    /// Mint many (account, token, amount) entries in one call. Owner only, all-or-nothing.
    ///
    /// `seq` makes the call idempotent: pass 1, 2, 3 ... in order. A number already applied does nothing
    /// (so a retry after a timeout can't mint twice); a number that skips ahead is rejected.
    pub fn batch_mint(&mut self, mints: Vec<MintEntry>, seq: Option<u64>) {
        require!(env::predecessor_account_id() == self.owner_id, "Only the owner can mint");
        require!(!mints.is_empty(), "Nothing to mint");
        if let Some(s) = seq {
            if s <= self.mint_seq {
                return;
            }
            require!(s == self.mint_seq + 1, "Out-of-order sequence number");
        }
        for m in mints {
            self.mint_one(m.account_id, m.token_id, m.amount.0);
        }
        if let Some(s) = seq {
            self.mint_seq = s;
        }
    }

    pub fn set_settler(&mut self, settler_id: AccountId) {
        require!(env::predecessor_account_id() == self.owner_id, "Only the owner can set the settler");
        self.settler_id = settler_id;
    }

    // ---- NEP-245 -------------------------------------------------------------

    #[payable]
    pub fn mt_transfer(
        &mut self,
        receiver_id: AccountId,
        token_id: String,
        amount: U128,
        approval: Option<(AccountId, u64)>,
        memo: Option<String>,
    ) {
        assert_one_yocto();
        require!(approval.is_none(), "Approvals are not supported");
        let sender = env::predecessor_account_id();
        self.move_tokens(&sender, &receiver_id, &token_id, amount.0);
        emit(
            "mt_transfer",
            json!({
                "old_owner_id": sender, "new_owner_id": receiver_id,
                "token_ids": [token_id], "amounts": [amount.0.to_string()], "memo": memo
            }),
        );
    }

    #[payable]
    pub fn mt_batch_transfer(
        &mut self,
        receiver_id: AccountId,
        token_ids: Vec<String>,
        amounts: Vec<U128>,
        approvals: Option<Vec<Option<(AccountId, u64)>>>,
        memo: Option<String>,
    ) {
        assert_one_yocto();
        require!(approvals.map_or(true, |a| a.iter().all(|x| x.is_none())), "Approvals are not supported");
        require!(token_ids.len() == amounts.len(), "token_ids and amounts must be the same length");
        require!(!token_ids.is_empty(), "Nothing to transfer");
        let sender = env::predecessor_account_id();
        for (t, a) in token_ids.iter().zip(amounts.iter()) {
            self.move_tokens(&sender, &receiver_id, t, a.0);
        }
        emit(
            "mt_transfer",
            json!({
                "old_owner_id": sender, "new_owner_id": receiver_id, "token_ids": token_ids,
                "amounts": amounts.iter().map(|a| a.0.to_string()).collect::<Vec<_>>(), "memo": memo
            }),
        );
    }

    /// Nims extension: send many (receiver, item, amount) legs from the caller in one call.
    /// This is how an agent merchant settles its own batch. All-or-nothing.
    ///
    /// `seq` makes the call idempotent per sender: 1, 2, 3 ... in order. A number already applied does
    /// nothing (a retry can't send twice); one that skips ahead is rejected.
    #[payable]
    pub fn send_many(&mut self, legs: Vec<Leg>, seq: Option<u64>) {
        assert_one_yocto();
        require!(!legs.is_empty(), "Nothing to send");
        let sender = env::predecessor_account_id();
        if let Some(s) = seq {
            let last = self.send_seq.get(&sender).copied().unwrap_or(0);
            if s <= last {
                return;
            }
            require!(s == last + 1, "Out-of-order sequence number");
        }
        for l in &legs {
            self.move_tokens(&sender, &l.receiver_id, &l.token_id, l.amount.0);
        }
        for l in &legs {
            emit(
                "mt_transfer",
                json!({
                    "old_owner_id": sender, "new_owner_id": l.receiver_id,
                    "token_ids": [l.token_id], "amounts": [l.amount.0.to_string()], "memo": "settle"
                }),
            );
        }
        if let Some(s) = seq {
            self.send_seq.insert(sender, s);
        }
    }

    /// Last sequence number applied for the owner's `batch_mint`.
    pub fn mint_seq(&self) -> u64 {
        self.mint_seq
    }

    /// Last sequence number applied for `account_id`'s `send_many`.
    pub fn send_seq(&self, account_id: AccountId) -> u64 {
        self.send_seq.get(&account_id).copied().unwrap_or(0)
    }

    pub fn mt_balance_of(&self, account_id: AccountId, token_id: String) -> U128 {
        U128(self.balances.get(&bal_key(&token_id, &account_id)).copied().unwrap_or(0))
    }

    pub fn mt_batch_balance_of(&self, account_id: AccountId, token_ids: Vec<String>) -> Vec<U128> {
        token_ids.iter().map(|t| self.mt_balance_of(account_id.clone(), t.clone())).collect()
    }

    pub fn mt_supply(&self, token_id: String) -> Option<U128> {
        self.supply.get(&token_id).map(|s| U128(*s))
    }

    // ---- Nims extension: batch settlement -------------------------------------

    /// Apply many game trades at once. All-or-nothing: one bad leg reverts the batch.
    pub fn settle(&mut self, transfers: Vec<Transfer>) {
        require!(env::predecessor_account_id() == self.settler_id, "Only the settler can settle");
        require!(!transfers.is_empty(), "Nothing to settle");
        for t in &transfers {
            self.move_tokens(&t.from, &t.to, &t.token_id, t.amount.0);
        }
        for t in &transfers {
            emit(
                "mt_transfer",
                json!({
                    "old_owner_id": t.from, "new_owner_id": t.to,
                    "token_ids": [t.token_id], "amounts": [t.amount.0.to_string()], "memo": "settle"
                }),
            );
        }
    }
}

impl Contract {
    fn mint_one(&mut self, account_id: AccountId, token_id: String, amount: u128) {
        require!(amount > 0, "Amount must be positive");
        self.credit(&account_id, &token_id, amount);
        let s = self.supply.get(&token_id).copied().unwrap_or(0);
        self.supply.insert(token_id.clone(), s.checked_add(amount).expect("supply overflow"));
        emit(
            "mt_mint",
            json!({ "owner_id": account_id, "token_ids": [token_id], "amounts": [amount.to_string()] }),
        );
    }

    fn credit(&mut self, account: &AccountId, token_id: &str, amount: u128) {
        let k = bal_key(token_id, account);
        let cur = self.balances.get(&k).copied().unwrap_or(0);
        self.balances.insert(k, cur.checked_add(amount).expect("balance overflow"));
    }

    fn move_tokens(&mut self, from: &AccountId, to: &AccountId, token_id: &str, amount: u128) {
        require!(amount > 0, "Amount must be positive");
        require!(from != to, "Sender and receiver must differ");
        let fk = bal_key(token_id, from);
        let have = self.balances.get(&fk).copied().unwrap_or(0);
        require!(have >= amount, "Not enough balance");
        self.balances.insert(fk, have - amount);
        self.credit(to, token_id, amount);
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use near_sdk::test_utils::VMContextBuilder;
    use near_sdk::{testing_env, NearToken};

    fn acct(n: &str) -> AccountId {
        n.parse().unwrap()
    }
    fn ctx(pred: &str, deposit: NearToken) {
        testing_env!(VMContextBuilder::new().predecessor_account_id(acct(pred)).attached_deposit(deposit).build());
    }
    fn fresh() -> Contract {
        ctx("oja.testnet", NearToken::from_near(0));
        let mut c = Contract::new(acct("oja.testnet"), None);
        c.mint(acct("mira.testnet"), "iron".into(), U128(100));
        c.mint(acct("mira.testnet"), "copper wire".into(), U128(10));
        c
    }

    #[test]
    fn mint_sets_balance_and_supply() {
        let c = fresh();
        assert_eq!(c.mt_balance_of(acct("mira.testnet"), "iron".into()).0, 100);
        assert_eq!(c.mt_supply("iron".into()).unwrap().0, 100);
        assert!(c.mt_supply("lace".into()).is_none());
    }

    #[test]
    #[should_panic(expected = "Only the owner can mint")]
    fn only_owner_mints() {
        let mut c = fresh();
        ctx("mallory.testnet", NearToken::from_near(0));
        c.mint(acct("mallory.testnet"), "iron".into(), U128(1));
    }

    #[test]
    fn batch_mint_mints_many_and_is_owner_only() {
        let mut c = fresh();
        c.batch_mint(vec![
            MintEntry { account_id: acct("tomas.testnet"), token_id: "iron".into(), amount: U128(7) },
            MintEntry { account_id: acct("june.testnet"), token_id: "lace".into(), amount: U128(3) },
        ], None);
        assert_eq!(c.mt_balance_of(acct("tomas.testnet"), "iron".into()).0, 7);
        assert_eq!(c.mt_supply("iron".into()).unwrap().0, 107);
        assert_eq!(c.mt_balance_of(acct("june.testnet"), "lace".into()).0, 3);
    }

    #[test]
    #[should_panic(expected = "Only the owner can mint")]
    fn batch_mint_rejects_strangers() {
        let mut c = fresh();
        ctx("mallory.testnet", NearToken::from_near(0));
        c.batch_mint(vec![MintEntry { account_id: acct("mallory.testnet"), token_id: "iron".into(), amount: U128(1) }], None);
    }

    #[test]
    fn send_many_moves_from_the_caller_only() {
        let mut c = fresh();
        ctx("mira.testnet", NearToken::from_yoctonear(1));
        c.send_many(vec![
            Leg { receiver_id: acct("tomas.testnet"), token_id: "iron".into(), amount: U128(10) },
            Leg { receiver_id: acct("june.testnet"), token_id: "copper wire".into(), amount: U128(4) },
        ], None);
        assert_eq!(c.mt_balance_of(acct("mira.testnet"), "iron".into()).0, 90);
        assert_eq!(c.mt_balance_of(acct("june.testnet"), "copper wire".into()).0, 4);
    }

    #[test]
    #[should_panic(expected = "Not enough balance")]
    fn send_many_cannot_spend_what_the_caller_lacks() {
        let mut c = fresh();
        ctx("tomas.testnet", NearToken::from_yoctonear(1));
        c.send_many(vec![Leg { receiver_id: acct("mira.testnet"), token_id: "iron".into(), amount: U128(1) }], None);
    }

    #[test]
    #[should_panic(expected = "Requires attached deposit of exactly 1 yoctoNEAR")]
    fn send_many_needs_one_yocto() {
        let mut c = fresh();
        ctx("mira.testnet", NearToken::from_near(0));
        c.send_many(vec![Leg { receiver_id: acct("tomas.testnet"), token_id: "iron".into(), amount: U128(1) }], None);
    }

    #[test]
    fn a_repeated_mint_sequence_number_does_nothing() {
        let mut c = fresh();
        let e = || vec![MintEntry { account_id: acct("kemi.testnet"), token_id: "iron".into(), amount: U128(7) }];
        c.batch_mint(e(), Some(1));
        c.batch_mint(e(), Some(1)); // a retry after a timeout: must not mint again
        assert_eq!(c.mt_balance_of(acct("kemi.testnet"), "iron".into()).0, 7);
        assert_eq!(c.mint_seq(), 1);
        c.batch_mint(e(), Some(2));
        assert_eq!(c.mt_balance_of(acct("kemi.testnet"), "iron".into()).0, 14);
    }

    #[test]
    #[should_panic(expected = "Out-of-order sequence number")]
    fn a_skipped_mint_sequence_number_is_rejected() {
        let mut c = fresh();
        c.batch_mint(vec![MintEntry { account_id: acct("kemi.testnet"), token_id: "iron".into(), amount: U128(1) }], Some(3));
    }

    #[test]
    fn a_repeated_send_sequence_number_does_nothing_and_each_sender_counts_alone() {
        let mut c = fresh();
        ctx("mira.testnet", NearToken::from_yoctonear(1));
        let leg = || vec![Leg { receiver_id: acct("kemi.testnet"), token_id: "iron".into(), amount: U128(10) }];
        c.send_many(leg(), Some(1));
        c.send_many(leg(), Some(1)); // retry: ignored
        assert_eq!(c.mt_balance_of(acct("mira.testnet"), "iron".into()).0, 90);
        assert_eq!(c.send_seq(acct("mira.testnet")), 1);
        assert_eq!(c.send_seq(acct("kemi.testnet")), 0); // another sender is unaffected
        c.send_many(leg(), Some(2));
        assert_eq!(c.mt_balance_of(acct("mira.testnet"), "iron".into()).0, 80);
    }

    #[test]
    #[should_panic(expected = "Out-of-order sequence number")]
    fn a_skipped_send_sequence_number_is_rejected() {
        let mut c = fresh();
        ctx("mira.testnet", NearToken::from_yoctonear(1));
        c.send_many(vec![Leg { receiver_id: acct("kemi.testnet"), token_id: "iron".into(), amount: U128(1) }], Some(2));
    }

    #[test]
    fn a_failed_call_does_not_use_up_its_sequence_number() {
        let mut c = fresh();
        ctx("kemi.testnet", NearToken::from_yoctonear(1)); // holds nothing
        let r = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
            c.send_many(vec![Leg { receiver_id: acct("mira.testnet"), token_id: "iron".into(), amount: U128(1) }], Some(1));
        }));
        assert!(r.is_err());
        assert_eq!(c.send_seq(acct("kemi.testnet")), 0); // still 0, so the same number can be retried
    }

    #[test]
    fn transfer_moves_tokens() {
        let mut c = fresh();
        ctx("mira.testnet", NearToken::from_yoctonear(1));
        c.mt_transfer(acct("tomas.testnet"), "iron".into(), U128(30), None, None);
        assert_eq!(c.mt_balance_of(acct("mira.testnet"), "iron".into()).0, 70);
        assert_eq!(c.mt_balance_of(acct("tomas.testnet"), "iron".into()).0, 30);
    }

    #[test]
    #[should_panic(expected = "Not enough balance")]
    fn transfer_rejects_overdraw() {
        let mut c = fresh();
        ctx("mira.testnet", NearToken::from_yoctonear(1));
        c.mt_transfer(acct("tomas.testnet"), "iron".into(), U128(101), None, None);
    }

    #[test]
    #[should_panic(expected = "Requires attached deposit of exactly 1 yoctoNEAR")]
    fn transfer_needs_one_yocto() {
        let mut c = fresh();
        ctx("mira.testnet", NearToken::from_near(0));
        c.mt_transfer(acct("tomas.testnet"), "iron".into(), U128(1), None, None);
    }

    #[test]
    fn batch_transfer_moves_several_items() {
        let mut c = fresh();
        ctx("mira.testnet", NearToken::from_yoctonear(1));
        c.mt_batch_transfer(
            acct("tomas.testnet"),
            vec!["iron".into(), "copper wire".into()],
            vec![U128(5), U128(2)],
            None,
            None,
        );
        let b = c.mt_batch_balance_of(acct("tomas.testnet"), vec!["iron".into(), "copper wire".into()]);
        assert_eq!((b[0].0, b[1].0), (5, 2));
    }

    #[test]
    fn settle_is_settler_only_and_atomic() {
        let mut c = fresh();
        ctx("oja.testnet", NearToken::from_near(0));
        c.settle(vec![
            Transfer { from: acct("mira.testnet"), to: acct("tomas.testnet"), token_id: "iron".into(), amount: U128(10) },
            Transfer { from: acct("tomas.testnet"), to: acct("june.testnet"), token_id: "iron".into(), amount: U128(4) },
        ]);
        assert_eq!(c.mt_balance_of(acct("tomas.testnet"), "iron".into()).0, 6);
        assert_eq!(c.mt_balance_of(acct("june.testnet"), "iron".into()).0, 4);
    }

    #[test]
    #[should_panic(expected = "Only the settler can settle")]
    fn settle_rejects_strangers() {
        let mut c = fresh();
        ctx("mallory.testnet", NearToken::from_near(0));
        c.settle(vec![Transfer {
            from: acct("mira.testnet"), to: acct("mallory.testnet"), token_id: "iron".into(), amount: U128(1),
        }]);
    }
}
