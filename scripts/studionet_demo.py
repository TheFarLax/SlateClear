"""Deploy and exercise SlateClear with three disposable Studionet accounts."""
import argparse
import base64
import hashlib
import json
import os
import time
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import requests
from eth_utils import to_checksum_address
from genlayer_py import create_account
from genlayer_py.chains import studionet
from genlayer_py.client import GenLayerClient
from genlayer_py.provider import GenLayerProvider
from genlayer_py.types import TransactionHashVariant

SOURCE = Path(__file__).resolve().parents[1] / "contracts" / "slate_clear.py"
RPC = "https://studio.genlayer.com/api"
EXPLORER = "https://explorer-studio.genlayer.com"
CHAIN = 61999
ROLES = ("publisher", "reviewer", "issuer")


class StudioProvider(GenLayerProvider):
    def __init__(self):
        super().__init__(RPC)
        self.session = requests.Session()

    def make_request(self, method, params):
        attempts = 1 if method in ("eth_sendRawTransaction", "sim_fundAccount") else 3
        for attempt in range(attempts):
            try:
                res = self.session.post(
                    RPC, json={"jsonrpc": "2.0", "method": method, "params": params, "id": 1}, timeout=(12, 22)
                )
                res.raise_for_status()
                payload = res.json()
                self._raise_on_error(payload, method)
                return payload
            except (requests.RequestException, ValueError):
                if attempt + 1 == attempts:
                    raise
                time.sleep(2 * (attempt + 1))
        raise RuntimeError("RPC retry limit reached.")


def rpc(provider, method, *params):
    return provider.make_request(method, list(params))["result"]


def connect(account):
    client = GenLayerClient(studionet, account)
    client.provider = StudioProvider()
    client.w3.provider = client.provider
    client.initialize_consensus_smart_contract()
    return client


def fund(account):
    provider = StudioProvider()
    if int(rpc(provider, "eth_getBalance", account.address, "latest"), 16) > 0:
        return
    try:
        rpc(provider, "sim_fundAccount", account.address, 20 * 10**18)
    except requests.RequestException:
        print("Faucet response was interrupted. Checking for the transfer.", flush=True)
    for _ in range(14):
        if int(rpc(provider, "eth_getBalance", account.address, "latest"), 16) > 0:
            return
        time.sleep(2)
    raise RuntimeError(f"Studionet faucet has not funded {account.address}.")


def save(path, value):
    temporary = path.with_suffix(".tmp")
    temporary.write_text(json.dumps(value, indent=2) + "\n", encoding="utf-8")
    temporary.replace(path)


def read(client, address, method, *args):
    return json.loads(client.read_contract(address=address, function_name=method, args=list(args),
        transaction_hash_variant=TransactionHashVariant.LATEST_FINAL))


def wait(provider, label, tx_hash, seconds=360):
    last = None
    stop_at = time.monotonic() + seconds
    while time.monotonic() < stop_at:
        try:
            receipt = rpc(provider, "eth_getTransactionByHash", tx_hash)
        except requests.RequestException:
            receipt = None
        if receipt:
            status = receipt.get("status")
            if status != last:
                print(f"{label}: {status} {tx_hash}", flush=True)
                last = status
            if status in ("CANCELED", "CANCELLED"):
                raise RuntimeError(f"{label} was canceled: {tx_hash}")
            if status == "FINALIZED":
                leader = (receipt.get("consensus_data") or {}).get("leader_receipt", {})
                if isinstance(leader, list):
                    leader = leader[-1] if leader else {}
                output = leader.get("genvm_result") or {}
                winner = receipt.get("result_name")
                execution = leader.get("execution_result")
                quorum = output.get("error_code") == "CONSENSUS_VALIDATOR_QUORUM_REACHED"
                if execution != "SUCCESS" and not (quorum and winner in ("MAJORITY_AGREE", "UNANIMOUS_AGREE")):
                    raise RuntimeError(f"{label} execution failed: {output.get('error_description') or output.get('error_code') or execution}")
                return {"hash": tx_hash, "status": status, "consensus": winner, "execution": execution,
                    "execution_code": output.get("error_code"), "to": receipt.get("to_address"),
                    "explorer_url": f"{EXPLORER}/tx/{tx_hash}"}
        time.sleep(3)
    raise TimeoutError(f"{label} is still pending at {last}: {tx_hash}. Run the same command to resume.")


def run(output):
    output.mkdir(parents=True, exist_ok=True)
    provider = StudioProvider()
    if int(rpc(provider, "eth_chainId"), 16) != CHAIN or studionet.id != CHAIN:
        raise RuntimeError("Unexpected chain. This script requires Studionet 61999.")
    keys = output / "wallets.private.json"
    report_path = output / "studionet-report.json"
    if keys.exists():
        accounts = {role: create_account(key) for role, key in json.loads(keys.read_text()).items()}
    else:
        accounts = {role: create_account() for role in ROLES}
        with os.fdopen(os.open(keys, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600), "w") as file:
            json.dump({role: account.key.hex() for role, account in accounts.items()}, file)
    with ThreadPoolExecutor(max_workers=3) as pool:
        list(pool.map(fund, accounts.values()))
    clients = {role: connect(account) for role, account in accounts.items()}
    client = clients["publisher"]
    source = SOURCE.read_bytes()
    source_hash = hashlib.sha256(source).hexdigest()
    addresses = {role: accounts[role].address for role in ROLES}
    report = json.loads(report_path.read_text()) if report_path.exists() else {
        "project": "SlateClear", "network": "Studionet", "chain_id": CHAIN, "source_sha256": source_hash,
        "actors": addresses, "transactions": {}, "scenario_is_synthetic": True,
        "scenario_start": int(time.time() // 60) - 180,
    }
    if report["source_sha256"] != source_hash or report["actors"] != addresses:
        raise RuntimeError("Source or wallets changed. Use a new output directory.")
    address = report.get("contract_address")

    def transact(label, role, method, args=()):
        prior = report["transactions"].get(label)
        if prior and prior.get("status") == "FINALIZED":
            return prior
        if not prior:
            sender = clients[role]
            tx = sender.deploy_contract(code=source, args=[], leader_only=False) if method == "deploy" else \
                sender.write_contract(address=address, function_name=method, args=list(args), leader_only=False)
            prior = {"hash": tx, "method": method, "role": role}
            report["transactions"][label] = prior
            save(report_path, report)
            print(f"{label}: submitted {tx}", flush=True)
        final = wait(provider, label, prior["hash"])
        prior.update(final)
        save(report_path, report)
        return prior

    deploy = transact("deployment", "publisher", "deploy")
    address = to_checksum_address(deploy["to"])
    raw = rpc(provider, "gen_getContractCode", address)
    raw = raw["code"] if isinstance(raw, dict) else raw
    onchain_hash = hashlib.sha256(base64.b64decode(raw, validate=True)).hexdigest()
    if onchain_hash != source_hash or read(client, address, "get_policy")["name"] != "SlateClear":
        raise RuntimeError("Deployment verification failed.")
    report.update(contract_address=address, explorer_url=f"{EXPLORER}/address/{address}",
                  onchain_source_sha256=onchain_hash, source_matches_onchain=True)
    save(report_path, report)

    cid = "signal-room"
    start = report["scenario_start"]
    end = start + 90 * 1440
    credit = "Graphics by Paper Signal"
    common = "Use of edited and unedited {media} is permitted worldwide on owned websites and paid social advertisements."
    library = (
        ("relay-footage", "Relay exterior", "FOOTAGE", common.format(media="footage") + " No attribution is required.", ""),
        ("signal-score", "Signal Room score", "MUSIC",
         "Use of edited and unedited music is permitted worldwide on owned websites, without attribution. Paid social advertising is prohibited worldwide.", ""),
        ("title-art", "Title treatment", "GRAPHIC", common.format(media="graphics") +
         f" Every use requires the exact attribution line {credit}.", credit),
    )
    transact("campaign_created", "publisher", "create_campaign", [cid, "Signal Room trailer", addresses["reviewer"]])
    for aid, label, kind, clause, credit_line in library:
        transact("register_" + aid, "issuer", "register_asset", [aid, label, kind])
        transact("terms_" + aid, "issuer", "publish_terms",
                 [aid, "", start-1440, end+90*1440, json.dumps([clause]), credit_line, ""])

    original_assets = {aid: read(client, address, "get_asset", aid) for aid, *_ in library}
    def plan(label, asset_records):
        return {"label": label, "assets": [
            {"id": aid, "terms_hash": asset["head"], "edited": True} for aid, asset in asset_records.items()
        ], "routes": [
            {"id": rid, "label": name, "channel": channel, "territory": "WORLD",
             "start": start, "end": end, "credits": {"title-art": credit}} for rid, name, channel in (
                 ("web", "Owned website", "OWNED_WEB"), ("paid", "Paid social", "PAID_SOCIAL")
             )
        ]}

    transact("cut_1_committed", "publisher", "commit_cut", [cid, 0, json.dumps(plan("Editorial cut", original_assets))])
    first = read(client, address, "get_cut", cid, 1)
    transact("cut_1_reviewed", "publisher", "review_cut", [cid, 1, first["plan_hash"]])
    first = read(client, address, "get_cut", cid, 1)
    if first["review"]["routes"] != {"web": "READY", "paid": "BLOCKED"}:
        raise RuntimeError(f"Unexpected cut 1 placement results: {first['review']['routes']}")
    first_hash = first["review"]["hash"]
    transact("cut_1_approved", "reviewer", "approve_review", [cid, 1, first_hash])
    transact("web_certificate", "publisher", "issue_certificate", [cid, 1, "web", first_hash])
    if "web_before_update" not in report:
        before = read(client, address, "get_certificate", cid + "/1/web")
        if before["status"] != "VALID":
            raise RuntimeError(f"Expected first web certificate to be valid, got {before['status']}.")
        report["web_before_update"] = before
        save(report_path, report)
    original_score_pin = first["plan"]["manifest"]["assets"][1]["terms_hash"]
    transact("score_terms_updated", "issuer", "publish_terms", [
        "signal-score", original_score_pin, start-1440, end+90*1440,
        json.dumps([common.format(media="music") + " No attribution is required."]), "", "",
    ])
    stale = read(client, address, "get_certificate", cid + "/1/web")
    if stale["status"] != "STALE_TERMS" or stale["changed"][0]["asset_id"] != "signal-score":
        raise RuntimeError("The original website certificate did not report stale terms.")
    active = {aid: read(client, address, "get_asset", aid) for aid, *_ in library}
    transact("cut_2_committed", "publisher", "commit_cut", [cid, 1, json.dumps(plan("Paid release cut", active))])
    second = read(client, address, "get_cut", cid, 2)
    transact("cut_2_reviewed", "publisher", "review_cut", [cid, 2, second["plan_hash"]])
    second = read(client, address, "get_cut", cid, 2)
    if second["review"]["routes"] != {"web": "READY", "paid": "READY"}:
        raise RuntimeError(f"Unexpected cut 2 placement results: {second['review']['routes']}")
    second_hash = second["review"]["hash"]
    transact("cut_2_approved", "reviewer", "approve_review", [cid, 2, second_hash])
    transact("paid_certificate", "publisher", "issue_certificate", [cid, 2, "paid", second_hash])

    paid = read(client, address, "get_certificate", cid + "/2/paid")
    if paid["status"] != "VALID" or paid["receipt"]["review_hash"] != second_hash:
        raise RuntimeError("The paid social certificate did not validate.")
    cuts = [read(client, address, "get_cut", cid, revision) for revision in (1, 2)]
    digests = dict.fromkeys(pin["terms_hash"] for item in cuts for pin in item["plan"]["manifest"]["assets"])
    archive = [read(client, address, "get_terms", digest) for digest in digests]
    report.update(scenario_status="passed", campaign_id=cid, campaign=read(client, address, "get_campaign", cid),
        cuts=cuts, assets=list(active.values()), terms=archive, certificates=[stale, paid],
        finalized_transactions=len(report["transactions"]))
    save(report_path, report)
    print(f"Verified {len(report['transactions'])} finalized transactions. Contract {report['explorer_url']}", flush=True)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output-dir", type=Path, required=True, help="Private directory for disposable wallets and resumable transaction records")
    run(parser.parse_args().output_dir)
