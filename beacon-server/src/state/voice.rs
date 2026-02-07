use std::collections::HashMap;
use serde::{Serialize, Deserialize};
use crate::{ServerId, SigningPubkey, VoicePeer, PeerId, ConnId};

/// Info about a voice peer (returned to clients)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VoicePeerInfo {
    pub peer_id: PeerId,
    pub user_id: String,
}

/// Voice chat state (chat-scoped)
pub struct VoiceState {
    /// Map of (server_id, chat_id) -> list of VoicePeers in that chat
    pub voice_chats: HashMap<(ServerId, String), Vec<VoicePeer>>,
    /// Map of server_id -> signing_pubkey (for voice presence broadcasting)
    pub server_signing_pubkeys: HashMap<ServerId, SigningPubkey>,
}

impl VoiceState {
    pub fn new() -> Self {
        Self {
            voice_chats: HashMap::new(),
            server_signing_pubkeys: HashMap::new(),
        }
    }

    /// Register a peer for voice in a specific chat.
    /// Returns list of other peers in the chat.
    pub fn register_voice_peer(
        &mut self,
        peer_id: PeerId,
        user_id: String,
        server_id: ServerId,
        chat_id: String,
        conn_id: ConnId,
    ) -> Vec<VoicePeerInfo> {
        let key = (server_id, chat_id);
        let peers = self.voice_chats.entry(key.clone()).or_insert_with(Vec::new);

        // Remove any existing entry for this user_id (handles reconnect with new peer_id)
        peers.retain(|p| p.user_id != user_id);

        // Add new entry
        peers.push(VoicePeer {
            peer_id: peer_id.clone(),
            user_id: user_id.clone(),
            conn_id,
        });

        // Return other peers (not self)
        peers.iter()
            .filter(|p| p.peer_id != peer_id)
            .map(|p| VoicePeerInfo {
                peer_id: p.peer_id.clone(),
                user_id: p.user_id.clone(),
            })
            .collect()
    }

    /// Unregister a peer from voice.
    /// Returns the user_id if found (for broadcasting PeerLeft).
    pub fn unregister_voice_peer(&mut self, peer_id: &PeerId, server_id: &ServerId, chat_id: &str) -> Option<String> {
        let key = (server_id.clone(), chat_id.to_string());
        let peers = self.voice_chats.get_mut(&key)?;

        // Find and remove the peer
        let pos = peers.iter().position(|p| &p.peer_id == peer_id)?;
        let removed = peers.remove(pos);

        // Clean up empty chat
        if peers.is_empty() {
            self.voice_chats.remove(&key);
        }

        Some(removed.user_id)
    }

    /// Handle voice disconnect for a WebSocket connection.
    /// Returns list of (server_id, chat_id, peer_id, user_id) for broadcasting PeerLeft.
    pub fn handle_voice_disconnect(&mut self, conn_id: &ConnId) -> Vec<(ServerId, String, PeerId, String)> {
        let mut removed: Vec<(ServerId, String, PeerId, String)> = Vec::new();

        // Find and remove all voice peers for this connection
        for ((server_id, chat_id), peers) in self.voice_chats.iter_mut() {
            let to_remove: Vec<_> = peers.iter()
                .filter(|p| &p.conn_id == conn_id)
                .map(|p| (p.peer_id.clone(), p.user_id.clone()))
                .collect();

            for (peer_id, user_id) in to_remove {
                removed.push((server_id.clone(), chat_id.clone(), peer_id.clone(), user_id));
                peers.retain(|p| p.peer_id != peer_id);
            }
        }

        // Clean up empty chats
        self.voice_chats.retain(|_, peers| !peers.is_empty());

        removed
    }
}
