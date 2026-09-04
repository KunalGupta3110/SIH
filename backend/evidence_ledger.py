"""
IBVAP Sentinel — backend/evidence_ledger.py

ONE job: a simple SHA-256 hash chain over sealed incidents, so nobody can
quietly edit old evidence without it being detectable.

How the chain works, in plain terms:

  1. Every sealed incident becomes one "block": its important facts
     (incident id, score, cameras, evidence, timestamp) get turned into a
     fixed piece of text (canonical JSON), which gets hashed -> data_hash.
  2. That block also remembers the previous block's hash -> previous_hash.
  3. The block's own identity, current_hash, is SHA256(previous_hash + data_hash).

Because each block's hash depends on the one before it, changing anything
in an old block — even a single character — changes that block's data_hash,
which changes its current_hash, which no longer matches what the NEXT
block recorded as its previous_hash. The break is visible immediately, and
verify_chain() tells you exactly which block it happened at.

The very first block chains to a fixed starting value (the "genesis"
string) instead of a previous block, since there isn't one yet.
"""

import hashlib
import json

GENESIS_VALUE = "sentinel::genesis::ssb-gurdaspur::2026"


def _sha256(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def _canonical_json(data: dict) -> str:
    """
    Turn a dict into text in a way that's always identical for the same
    data — sorted keys, no extra whitespace — so the hash is reproducible.
    """
    return json.dumps(data, sort_keys=True, separators=(",", ":"))


def seal_incident(
    incident_id: str,
    threat_score: int,
    camera_ids: list,
    rule_evidence: list,
    thumbnail_sha256: str,
    timestamp: str,
    previous_hash: str,
) -> dict:
    """
    Build one ledger block for a confirmed incident. This function does NOT
    write to the database — the caller takes the returned dict and passes
    it to database.insert_ledger_block(...).
    """
    payload = {
        "incident_id": incident_id,
        "threat_score": threat_score,
        "camera_ids": camera_ids,
        "rule_evidence": rule_evidence,
        "thumbnail_sha256": thumbnail_sha256 or "",
        "timestamp": timestamp,
    }
    payload_json = _canonical_json(payload)
    data_hash = _sha256(payload_json)
    current_hash = _sha256(previous_hash + data_hash)

    return {
        "previous_hash": previous_hash,
        "data_hash": data_hash,
        "current_hash": current_hash,
        "payload_json": payload_json,
        "timestamp": timestamp,
    }


def verify_chain(blocks: list) -> dict:
    """
    Walk every block from oldest to newest and check that each link is
    intact. `blocks` must already be in the order they were created
    (database.get_all_ledger_blocks() returns them that way).

    Returns:
        {
            "is_valid": True/False,
            "broken_index": None, or the index of the first bad block,
            "reason": None, or a short explanation,
            "logs": a line per block describing what was checked,
        }
    """
    logs = []
    previous_hash = GENESIS_VALUE

    for index, block in enumerate(blocks):
        # 1. Does this block actually chain from the previous one?
        if block["previous_hash"] != previous_hash:
            logs.append(f"Block {index}: previous_hash does not match the prior block's current_hash.")
            return _result(False, index, "previous_hash mismatch — chain does not connect here", logs)

        # 2. Has the stored payload been edited since it was hashed?
        recomputed_data_hash = _sha256(block["payload_json"])
        if recomputed_data_hash != block["data_hash"]:
            logs.append(f"Block {index}: payload_json does not match its stored data_hash (payload was edited).")
            return _result(False, index, "data_hash mismatch — block payload was tampered with", logs)

        # 3. Does the block's own hash still check out?
        recomputed_current_hash = _sha256(previous_hash + recomputed_data_hash)
        if recomputed_current_hash != block["current_hash"]:
            logs.append(f"Block {index}: current_hash does not match previous_hash + data_hash.")
            return _result(False, index, "current_hash mismatch — block hash was tampered with", logs)

        logs.append(f"Block {index}: OK ({block['current_hash'][:12]}...)")
        previous_hash = block["current_hash"]

    return _result(True, None, None, logs)


def _result(is_valid: bool, broken_index: int | None, reason: str | None, logs: list) -> dict:
    return {"is_valid": is_valid, "broken_index": broken_index, "reason": reason, "logs": logs}
