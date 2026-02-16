# What Cordia is *not*

Cordia is designed with clear boundaries. This document spells out what the project **will not** do and what it is **not** designed for.

## Identity & discovery

- **No government ID** — Cordia does not require or verify real-world identity.
- **No real names required** — Display names only; your real name is optional and never required.
- **No public discovery** — There is no global user directory or search. You join servers via invite links or friend codes, not by browsing.

## Data & privacy

- **Beacon does not read message content** — The Beacon does not inspect, understand, or retain message contents. It handles routing metadata only (presence, discovery, signaling).
- **No social graph monetization** — Cordia does not build, sell, or monetize social graphs.

## Scale & scope

- **Not designed for massive communities** — Cordia targets smaller groups. Very large servers and huge voice calls are out of scope.
- **No paywalls** — Core features are not gated by monetization. If your setup can run it and you have internet, you get full functionality.

---

These boundaries are intentional. Cordia prioritizes privacy, simplicity, and functionality over scale and business models.

## Chat guarantees

- **Ephemeral-first messaging** — Beacon relays live traffic and does not persist chat messages.
- **Local persistence is optional convenience** — Message history durability is a per-server local setting (`persistent` or `ephemeral`), not a network guarantee.
- **No offline backfill promise** — Messages missed while offline are not guaranteed to exist.
- **Unread is local event state** — Unread counters represent events this client has seen since last open, not global truth.
- **Delivered-only receipts** — Cordia tracks delivery acknowledgements and does not implement read receipts.
- **Attachment honesty** — Attachment metadata can persist in history, while file availability is opportunistic (`Available`, `Unavailable`, `Cached`) depending on host presence and local cache.
