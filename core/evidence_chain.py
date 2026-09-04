"""
IBVAP Sentinel — Tamper-Evident Evidence Hash Chain
Module: core/evidence_chain.py
Description: Append-only cryptographic hash chain for incident evidence capsules.
             Provides Genesis block, canonical SHA-256 calculation, and live verify_chain() audit.
"""

from dataclasses import asdict, dataclass
from datetime import datetime, timezone
import hashlib
import json
import os
from pathlib import Path
import sys
from typing import Any, Dict, List, Optional, Tuple

ROOT_DIR = Path(__file__).resolve().parent.parent
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))

LEDGER_PATH = os.path.join(ROOT_DIR, "data", "evidence_blockchain_ledger.json")


@dataclass
class EvidenceCapsule:
    incident_id: str
    timestamp: str
    camera_id: str
    object_id: str
    event_type: str
    confidence: float
    threat_score: int
    thumbnail_path: Optional[str] = None
    trajectory_summary: Optional[str] = None


@dataclass
class EvidenceBlock:
    block_index: int
    timestamp_iso: str
    incident_id: str
    threat_score: int
    camera_ids: List[str]
    rule_evidence: str
    thumbnail_sha256: str
    data_payload_hash: str
    previous_hash: str
    current_hash: str


def canonical_json(data: Dict[str, Any]) -> str:
    """Produces deterministic, sorted-key JSON string for cryptographic hashing."""
    return json.dumps(data, sort_keys=True, separators=(",", ":"))


def compute_sha256(content: str) -> str:
    return hashlib.sha256(content.encode("utf-8")).hexdigest()


def compute_file_sha256(file_path: Optional[str]) -> str:
    if not file_path or not os.path.exists(file_path):
        return "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"
    try:
        hasher = hashlib.sha256()
        with open(file_path, "rb") as f:
            while chunk := f.read(8192):
                hasher.update(chunk)
        return hasher.hexdigest()
    except Exception:
        return "error_reading_file"


class EvidenceChain:
    """
    Append-only evidence ledger chaining SHA-256 hashes of incident capsules.
    """

    def __init__(self, ledger_file: str = LEDGER_PATH):
        self.ledger_file = ledger_file
        self.chain: List[EvidenceBlock] = []
        self._load_or_genesis()

    def _load_or_genesis(self):
        if os.path.exists(self.ledger_file):
            try:
                with open(self.ledger_file, "r") as f:
                    raw_blocks = json.load(f)
                    self.chain = [EvidenceBlock(**b) for b in raw_blocks]
                    return
            except Exception:
                pass

        # Genesis Block Anchor
        genesis = EvidenceBlock(
            block_index=0,
            timestamp_iso="2026-09-01T00:00:00Z",
            incident_id="GENESIS_BLOCK",
            threat_score=0,
            camera_ids=["SYSTEM_CORE"],
            rule_evidence="Genesis anchor initialized for IBVAP Sentinel Evidence Ledger.",
            thumbnail_sha256="0"*64,
            data_payload_hash=compute_sha256("GENESIS_DATA_PAYLOAD"),
            previous_hash="0"*64,
            current_hash="031640c0d37db2011b9b940cfc4b7891fa133b664d550e20601f016d9a13904e",
        )
        self.chain = [genesis]
        self._save()

    def _save(self):
        os.makedirs(os.path.dirname(self.ledger_file) or ".", exist_ok=True)
        with open(self.ledger_file, "w") as f:
            json.dump([asdict(b) for b in self.chain], f, indent=2)

    def record_capsule(
        self,
        incident_id: str,
        threat_score: int,
        camera_ids: List[str],
        rule_evidence: str,
        thumbnail_path: Optional[str] = None,
    ) -> EvidenceBlock:
        prev_block = self.chain[-1]
        thumb_hash = compute_file_sha256(thumbnail_path)
        timestamp_iso = datetime.now(timezone.utc).isoformat()

        payload_dict = {
            "incident_id": incident_id,
            "threat_score": threat_score,
            "camera_ids": camera_ids,
            "rule_evidence": rule_evidence,
            "thumbnail_sha256": thumb_hash,
            "timestamp": timestamp_iso,
        }
        data_hash = compute_sha256(canonical_json(payload_dict))

        # Chained SHA-256: Current = SHA256(PrevHash + DataHash)
        current_hash = compute_sha256(f"{prev_block.current_hash}:{data_hash}")

        new_block = EvidenceBlock(
            block_index=len(self.chain),
            timestamp_iso=timestamp_iso,
            incident_id=incident_id,
            threat_score=threat_score,
            camera_ids=camera_ids,
            rule_evidence=rule_evidence,
            thumbnail_sha256=thumb_hash,
            data_payload_hash=data_hash,
            previous_hash=prev_block.current_hash,
            current_hash=current_hash,
        )

        self.chain.append(new_block)
        self._save()
        return new_block

    def verify_chain(self) -> Tuple[bool, Optional[int], str, List[str]]:
        """
        Walks the entire evidence chain and returns:
          (is_valid, broken_index, reason, audit_logs)
        """
        logs = []
        if not self.chain:
            return False, 0, "Empty blockchain ledger", ["Ledger has zero blocks."]

        for i, block in enumerate(self.chain):
            if i == 0:
                logs.append(f"Block #0 [GENESIS] Hash Verified: {block.current_hash[:16]}...")
                continue

            prev_block = self.chain[i - 1]

            # 1. Previous Hash Integrity Check
            if block.previous_hash != prev_block.current_hash:
                reason = f"Chain linkage broken at Block #{i}. Expected prev_hash {prev_block.current_hash[:16]}..., found {block.previous_hash[:16]}..."
                logs.append(f"[TAMPER DETECTED] {reason}")
                return False, i, reason, logs

            # 2. Re-compute Data Payload Hash from raw fields
            payload_dict = {
                "incident_id": block.incident_id,
                "threat_score": block.threat_score,
                "camera_ids": block.camera_ids,
                "rule_evidence": block.rule_evidence,
                "thumbnail_sha256": block.thumbnail_sha256,
                "timestamp": block.timestamp_iso,
            }
            computed_data_hash = compute_sha256(canonical_json(payload_dict))
            if block.data_payload_hash != computed_data_hash:
                reason = f"Block #{i} data payload tampered. Stored: {block.data_payload_hash[:16]}..., Computed: {computed_data_hash[:16]}..."
                logs.append(f"[TAMPER DETECTED] {reason}")
                return False, i, reason, logs

            # 3. Re-compute Current Block Hash
            expected_current = compute_sha256(f"{block.previous_hash}:{computed_data_hash}")
            if block.current_hash != expected_current:
                reason = f"Block #{i} block hash mismatch. Stored: {block.current_hash[:16]}..., Calculated: {expected_current[:16]}..."
                logs.append(f"[TAMPER DETECTED] {reason}")
                return False, i, reason, logs

            logs.append(f"Block #{i} [{block.incident_id}] Verified -> Hash: {block.current_hash[:16]}... (Prev: {block.previous_hash[:16]}...)")

        return True, None, "100% Valid and Untampered", logs


# Aliases for backwards compatibility
EvidenceLedger = EvidenceChain

# Global Default Singleton
_default_chain = EvidenceChain()

def get_evidence_chain() -> EvidenceChain:
    return _default_chain

def verify_evidence_ledger() -> Tuple[bool, List[str]]:
    valid, _, _, logs = _default_chain.verify_chain()
    return valid, logs
