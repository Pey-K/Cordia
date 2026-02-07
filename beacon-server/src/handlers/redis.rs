#[cfg(feature = "redis-backend")]
use crate::{SigningPubkey, state::presence::PresenceUserStatus};
#[cfg(feature = "redis-backend")]
use redis::AsyncCommands;

#[cfg(feature = "redis-backend")]
pub fn redis_user_key(user_id: &str) -> String {
    format!("presence:user:{}", user_id)
}

#[cfg(feature = "redis-backend")]
/// Redis key for server presence set. Uses "house" in key for backward compatibility with existing Redis data.
pub fn redis_server_key(signing_pubkey: &str) -> String {
    format!("presence:house:{}", signing_pubkey)
}

#[cfg(feature = "redis-backend")]
pub async fn redis_presence_hello(
    client: &redis::Client,
    ttl_secs: u64,
    user_id: &str,
    signing_pubkeys: &[SigningPubkey],
    active_signing_pubkey: &Option<SigningPubkey>,
) -> Result<(), String> {
    let mut conn = client
        .get_multiplexed_tokio_connection()
        .await
        .map_err(|e| format!("redis_presence_hello conn: {}", e))?;
    let user_key = redis_user_key(user_id);
    let active_value = active_signing_pubkey.clone().unwrap_or_default();

    let mut pipe = redis::pipe();
    pipe.hset(&user_key, "active_signing_pubkey", active_value)
        .expire(&user_key, ttl_secs as i64);
    for spk in signing_pubkeys {
        let server_key = redis_server_key(spk);
        pipe.sadd(server_key, user_id);
    }
    pipe.query_async::<_, ()>(&mut conn)
        .await
        .map_err(|e| format!("redis_presence_hello query: {}", e))?;
    Ok(())
}

#[cfg(feature = "redis-backend")]
pub async fn redis_presence_active(
    client: &redis::Client,
    ttl_secs: u64,
    user_id: &str,
    active_signing_pubkey: &Option<SigningPubkey>,
) -> Result<(), String> {
    let mut conn = client
        .get_multiplexed_tokio_connection()
        .await
        .map_err(|e| format!("redis_presence_active conn: {}", e))?;
    let user_key = redis_user_key(user_id);
    let active_value = active_signing_pubkey.clone().unwrap_or_default();
    let mut pipe = redis::pipe();
    pipe.hset(&user_key, "active_signing_pubkey", active_value)
        .expire(&user_key, ttl_secs as i64);
    pipe.query_async::<_, ()>(&mut conn)
        .await
        .map_err(|e| format!("redis_presence_active query: {}", e))?;
    Ok(())
}

#[cfg(feature = "redis-backend")]
pub async fn redis_presence_disconnect(
    client: &redis::Client,
    user_id: &str,
    signing_pubkeys: &[SigningPubkey],
) -> Result<(), String> {
    let mut conn = client
        .get_multiplexed_tokio_connection()
        .await
        .map_err(|e| format!("redis_presence_disconnect conn: {}", e))?;
    let user_key = redis_user_key(user_id);
    let mut pipe = redis::pipe();
    pipe.del(&user_key);
    for spk in signing_pubkeys {
        let server_key = redis_server_key(spk);
        pipe.srem(server_key, user_id);
    }
    pipe.query_async::<_, ()>(&mut conn)
        .await
        .map_err(|e| format!("redis_presence_disconnect query: {}", e))?;
    Ok(())
}

#[cfg(feature = "redis-backend")]
pub async fn redis_presence_snapshot(
    client: &redis::Client,
    signing_pubkey: &SigningPubkey,
) -> Result<Vec<PresenceUserStatus>, String> {
    let mut conn = client
        .get_multiplexed_tokio_connection()
        .await
        .map_err(|e| format!("redis_presence_snapshot conn: {}", e))?;
    let server_key = redis_server_key(signing_pubkey);
    let user_ids: Vec<String> = conn
        .smembers::<_, Vec<String>>(&server_key)
        .await
        .map_err(|e| format!("redis_presence_snapshot smembers: {}", e))?;
    if user_ids.is_empty() {
        return Ok(Vec::new());
    }

    let mut pipe = redis::pipe();
    for user_id in user_ids.iter() {
        let user_key = redis_user_key(user_id);
        pipe.hget(user_key, "active_signing_pubkey");
    }
    let active_values: Vec<Option<String>> = pipe
        .query_async::<_, Vec<Option<String>>>(&mut conn)
        .await
        .map_err(|e| format!("redis_presence_snapshot hget: {}", e))?;

    let mut out = Vec::new();
    let mut stale_users = Vec::new();
    for (user_id, active) in user_ids.into_iter().zip(active_values.into_iter()) {
        if let Some(active_value) = active {
            let active_signing_pubkey = if active_value.is_empty() {
                None
            } else {
                Some(active_value)
            };
            out.push(PresenceUserStatus {
                user_id,
                active_signing_pubkey,
            });
        } else {
            stale_users.push(user_id);
        }
    }

    if !stale_users.is_empty() {
        let _: () = redis::cmd("SREM")
            .arg(&server_key)
            .arg(stale_users)
            .query_async::<_, ()>(&mut conn)
            .await
            .map_err(|e| format!("redis_presence_snapshot cleanup: {}", e))?;
    }

    Ok(out)
}

#[cfg(feature = "redis-backend")]
pub async fn redis_presence_refresh(
    client: &redis::Client,
    ttl_secs: u64,
    users: &[(String, Vec<SigningPubkey>, Option<SigningPubkey>)],
) -> Result<(), String> {
    if users.is_empty() {
        return Ok(());
    }
    let mut conn = client
        .get_multiplexed_tokio_connection()
        .await
        .map_err(|e| format!("redis_presence_refresh conn: {}", e))?;
    let mut pipe = redis::pipe();
    for (user_id, spks, active) in users.iter() {
        let user_key = redis_user_key(user_id);
        let active_value = active.clone().unwrap_or_default();
        pipe.hset(&user_key, "active_signing_pubkey", active_value)
            .expire(&user_key, ttl_secs as i64);
        for spk in spks.iter() {
            let server_key = redis_server_key(spk);
            pipe.sadd(server_key, user_id);
        }
    }
    pipe.query_async::<_, ()>(&mut conn)
        .await
        .map_err(|e| format!("redis_presence_refresh query: {}", e))?;
    Ok(())
}
