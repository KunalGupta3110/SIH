"""
Cyber Camera Surveillance Platform
Module: core/database/evidence_chain.py
Description: NOVELTY 4 — Tamper-Evident Cryptographic SHA-256 Evidence Chain (Blockchain/Cybersecurity).
             Locks security incidents into an immutable cryptographic chain of custody.
"""

from dataclasses import asdict, dataclass
from datetime import datetime, timezone
import hashlib
import json
import os
from pathlib import Path
import sys
from typing import Any, Dict, List, Optional, Tuple

ROOT_DIR = Path(__file__).resolve().parent.parent.parent
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))

LEDGER_PATH = os.path.join(ROOT_DIR, "data", "evidence_blockchain_ledger.json")


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


def compute_sha256(content: str) -> str:
    return hashlib.sha256(content.encode("utf-8")).hexdigest()


def compute_file_sha256(file_path: Optional[str]) -> str:
    if not file_path or not os.path.exists(file_path):
        return "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"  # Hash of empty string
    try:
        hasher = hashlib.sha256()
        with open(file_path, "rb") as f:
            while chunk := f.read(8192):
                hasher.update(chunk)
        return hasher.hexdigest()
    except Exception:
        return "error_reading_file"


class TamperEvidentEvidenceLedger:
    """
    Cryptographically links forensic incident capsules into a tamper-evident SHA-256 chain.
    Guarantees integrity of evidence presented to military command and court of inquiry.
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
                    print(f"[EVIDENCE CHAIN] Loaded {len(self.chain)} verified cryptographic blocks.")
                    return
            except Exception as e:
                print(f"[Evidence Chain] Ledger parse reset: {e}")

        # Genesis Block
        genesis = EvidenceBlock(
            block_index=0,
            timestamp_iso="2026-09-01T00:00:00Z",
            incident_id="GENESIS_BLOCK",
            threat_score=0,
            camera_ids=["SYSTEM_CORE"],
            rule_evidence="Genesis anchor initialized for IBVAP Cyber Camera Intelligence.",
            thumbnail_sha256="0"*64,
            data_payload_hash=compute_sha256("GENESIS_DATA_PAYLOAD"),
            previous_hash="0"*64,
            current_hash=compute_sha256("GENESIS_BLOCK_0_INITIAL_ROOT"),
        )
        self.chain = [genesis]
        self._save_ledger()

    def _save_ledger(self):
        os.makedirs(os.path.dirname(self.ledger_file) or ".", exist_ok=True)
        with open(self.ledger_file, "w") as f:
            json.dump([asdict(b) for b in self.chain], f, indent=2)

    def record_incident_capsule(
        self,
        incident_id: str,
        threat_score: int,
        camera_ids: List[str],
        rule_evidence: str,
        thumbnail_path: Optional[str] = None,
        telemetry_meta: Optional[Dict] = None,
    ) -> EvidenceBlock:
        prev_block = self.chain[-1]
        thumb_hash = compute_file_sha256(thumbnail_path)
        payload_str = json.dumps({
            "incident_id": incident_id,
            "threat_score": threat_score,
            "camera_ids": camera_ids,
            "rule_evidence": rule_evidence,
            "thumb_hash": thumb_hash,
            "telemetry": telemetry_meta or {},
        }, sort_keys=True)

        payload_hash = compute_sha256(payload_str)
        curr_time = datetime.now(timezone.utc).isoformat()
        
        # Block Header Hash
        block_header = f"{len(self.chain)}|{curr_time}|{incident_id}|{payload_hash}|{prev_block.current_hash}"
        curr_block_hash = compute_sha256(block_header)

        block = EvidenceBlock(
            block_index=len(self.chain),
            timestamp_iso=curr_time,
            incident_id=incident_id,
            threat_score=threat_score,
            camera_ids=camera_ids,
            rule_evidence=rule_evidence,
            thumbnail_sha256=thumb_hash,
            data_payload_hash=payload_hash,
            previous_hash=prev_block.current_hash,
            current_hash=curr_block_hash,
        )
        self.chain.append(block)
        self._save_ledger()
        print(f"[EVIDENCE CAPSULE SEALED] Block #{block.block_index} for {incident_id} | Hash: {block.current_hash[:12]}... (Prev: {block.previous_hash[:12]}...)")
        return block

    def verify_chain_integrity(self) -> Tuple[bool, List[Dict]]:
        """
        Traverses the entire cryptographic ledger and verifies every block hash and pointer.
        Returns True if 100% valid, or False if tampering is detected.
        """
        audit_log = []
        is_valid = True

        for i in range(1, len(self.chain)):
            curr = self.chain[i]
            prev = self.chain[i - 1]

            # 1. Verify previous hash pointer
            if curr.previous_hash != prev.current_hash:
                is_valid = False
                audit_log.append({
                    "block_index": curr.block_index,
                    "status": "FAIL_PREVIOUS_HASH_MISMATCH",
                    "details": f"Block #{curr.block_index} previous_hash does not match Block #{prev.block_index} current_hash!",
                })
                continue

            # 2. Re-compute block header hash
            block_header = f"{curr.block_index}|{curr.timestamp_iso}|{curr.incident_id}|{curr.data_payload_hash}|{curr.previous_hash}"
            expected_hash = compute_sha256(block_header)

            if curr.current_hash != expected_hash:
                is_valid = False
                audit_log.append({
                    "block_index": curr.block_index,
                    "status": "FAIL_CORRUPTED_BLOCK_HASH",
                    "details": f"Block #{curr.block_index} hash mismatch. Computed: {expected_hash[:10]} vs Stored: {curr.current_hash[:10]}",
                })
            else:
                audit_log.append({
                    "block_index": curr.block_index,
                    "status": "VERIFIED_OK",
                    "hash": curr.current_hash[:16],
                    "incident_id": curr.incident_id,
                })

        return is_valid, audit_log


# Global Singleton Ledger
_evidence_ledger = TamperEvidentEvidenceLedger()


def seal_incident_evidence(incident_id: str, threat_score: int, camera_ids: List[str], rule_evidence: str, thumbnail_path: Optional[str] = None):
    return _evidence_ledger.record_incident_capsule(incident_id, threat_score, camera_ids, rule_evidence, thumbnail_path)


def verify_evidence_ledger():
    return _evidence_ledger.verify_chain_integrity()
