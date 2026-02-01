use std::collections::{HashMap, HashSet};
use crate::{PeerId, ServerId, SigningPubkey, WebSocketSender, ConnId, PeerConnection, EncryptedServerHint, SignalingMessage};
use tokio_tungstenite::tungstenite::Message;

/// WebSocket signaling state (peer ↔ peer)
pub struct SignalingState {
    /// Map of peer_id -> PeerConnection
    pub peers: HashMap<PeerId, PeerConnection>,
    /// Map of server_id -> set of peer_ids in that server
    pub servers: HashMap<ServerId, HashSet<PeerId>>,
    /// Map of signing_pubkey -> set of peer_ids subscribed to that server
    pub signing_servers: HashMap<SigningPubkey, HashSet<PeerId>>,
    /// Map of peer_id -> WebSocket sender (for message forwarding)
    pub peer_senders: HashMap<PeerId, WebSocketSender>,
    /// Map of conn_id -> peer_ids registered on that websocket connection (allows correct cleanup)
    pub conn_peers: HashMap<ConnId, HashSet<PeerId>>,
}

impl SignalingState {
    pub fn new() -> Self {
        Self {
            peers: HashMap::new(),
            servers: HashMap::new(),
            signing_servers: HashMap::new(),
            peer_senders: HashMap::new(),
            conn_peers: HashMap::new(),
        }
    }

    /// Validates that a peer_id belongs to the connection sending the message.
    /// This enforces connection identity consistency, not authorization.
    /// Returns true if the peer_id is registered and belongs to the given conn_id.
    /// 
    /// Future optimization: Consider returning the validated PeerConnection to avoid
    /// double-locking (lock → validate → unlock, then lock again for work).
    pub fn validate_peer_connection(&self, peer_id: &PeerId, conn_id: &ConnId) -> bool {
        match self.peers.get(peer_id) {
            Some(peer) => peer.conn_id == *conn_id,
            None => false,
        }
    }

    pub fn register_peer(
        &mut self,
        peer_id: PeerId,
        server_id: ServerId,
        signing_pubkey: Option<SigningPubkey>,
        conn_id: ConnId,
    ) -> Vec<PeerId> {
        // Add peer connection
        self.peers.insert(
            peer_id.clone(),
            PeerConnection {
                peer_id: peer_id.clone(),
                server_id: server_id.clone(),
                signing_pubkey: signing_pubkey.clone(),
                conn_id: conn_id.clone(),
            },
        );

        // Track peer_id for this connection (fixes memory leaks when socket dies)
        self.conn_peers
            .entry(conn_id)
            .or_insert_with(HashSet::new)
            .insert(peer_id.clone());

        // Add peer to server
        let peers_in_server = self.servers.entry(server_id.clone()).or_insert_with(HashSet::new);
        peers_in_server.insert(peer_id.clone());

        // If a signing_pubkey was provided, treat this peer as subscribed for server-hint broadcasts
        if let Some(spk) = signing_pubkey {
            self.signing_servers.entry(spk).or_insert_with(HashSet::new).insert(peer_id.clone());
        }

        // Return other peers in the same server
        peers_in_server
            .iter()
            .filter(|p| **p != peer_id)
            .cloned()
            .collect()
    }

    pub fn unregister_peer(&mut self, peer_id: &PeerId) {
        if let Some(conn) = self.peers.remove(peer_id) {
            // Remove from server list
            if let Some(peers_in_server) = self.servers.get_mut(&conn.server_id) {
                peers_in_server.remove(peer_id);
                if peers_in_server.is_empty() {
                    self.servers.remove(&conn.server_id);
                }
            }

            // Remove from signing server list (if subscribed)
            if let Some(spk) = conn.signing_pubkey {
                if let Some(peers_for_signing) = self.signing_servers.get_mut(&spk) {
                    peers_for_signing.remove(peer_id);
                    if peers_for_signing.is_empty() {
                        self.signing_servers.remove(&spk);
                    }
                }
            }
        }
        // Remove WebSocket sender
        self.peer_senders.remove(peer_id);
    }

    pub fn get_server(&self, peer_id: &PeerId) -> Option<ServerId> {
        self.peers.get(peer_id).map(|c| c.server_id.clone())
    }

    pub fn broadcast_server_hint_updated(&self, signing_pubkey: &SigningPubkey, hint: &EncryptedServerHint) {
        let Some(peers) = self.signing_servers.get(signing_pubkey) else {
            return;
        };

        let msg = SignalingMessage::ServerHintUpdated {
            signing_pubkey: signing_pubkey.clone(),
            encrypted_state: hint.encrypted_state.clone(),
            signature: hint.signature.clone(),
            last_updated: hint.last_updated,
        };

        let Ok(json) = serde_json::to_string(&msg) else {
            return;
        };

        for peer_id in peers {
            if let Some(sender) = self.peer_senders.get(peer_id) {
                let _ = sender.send(Message::Text(json.clone()));
            }
        }
    }
}
