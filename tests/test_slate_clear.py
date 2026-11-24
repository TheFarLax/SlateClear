"""Direct GenVM tests for exact review consensus and release receipt invalidation."""
import hashlib
import json
from datetime import datetime, timezone
from pathlib import Path

import pytest
from gltest.direct import VMContext, create_address, deploy_contract

SOURCE = Path(__file__).resolve().parents[1] / "contracts/slate_clear.py"
NOW = 29_923_500
RULE = "SlateClear rights matrix v1"
CLAUSE = "Worldwide use on owned websites and paid social is permitted, including edits."
CREDIT = "Illustration by Paper Signal"
CREDIT_CLAUSE = f"Worldwide use on owned websites and paid social, with edits, requires this credit: {CREDIT}."


def iso(minute):
    return datetime.fromtimestamp(minute * 60, timezone.utc).isoformat()


def digest(value):
    clean = {k: v for k, v in value.items() if k != "hash"}
    return hashlib.sha256(json.dumps(clean, sort_keys=True, ensure_ascii=True, separators=(",", ":")).encode()).hexdigest()


@pytest.fixture
def env():
    vm = VMContext()
    vm.check_pickling = True
    actors = {role: create_address(role) for role in ("publisher", "reviewer", "issuer", "outsider")}
    vm.sender = actors["publisher"]
    vm.warp(iso(NOW))
    with vm.activate():
        yield vm, deploy_contract(SOURCE, vm, sdk_version="v0.2.16"), actors


def get(env, function, *args):
    return json.loads(getattr(env[1], function)(*args))


def create(env, reviewer=None):
    vm, c, actors = env
    reviewer = reviewer or "0x" + actors["reviewer"].hex()
    with vm.prank(actors["publisher"]):
        c.create_campaign("signal", "Signal Room", reviewer)


def terms(env, name="footage", head="", start=NOW-1440, end=NOW+30_000, text=CLAUSE, credit=""):
    vm, c, actors = env
    rows = text if isinstance(text, list) else [text]
    with vm.prank(actors["issuer"]):
        return c.publish_terms(name, head, start, end, json.dumps(rows), credit, "")


def asset(env, aid="footage", kind="FOOTAGE", **kw):
    vm, c, actors = env
    with vm.prank(actors["issuer"]):
        c.register_asset(aid, aid.title(), kind)
    return terms(env, aid, **kw)


def route(rid="web", channel="OWNED_WEB", start=NOW-60, end=NOW+1440, credits=None):
    return {"id": rid, "label": rid.title(), "channel": channel, "territory": "WORLD", "start": start,
            "end": end, "credits": credits or {}}


def manifest(assets, routes=None, label="Cut A"):
    return {"label": label, "assets": [{"id": aid, "terms_hash": hash_, "edited": True} for aid, hash_ in assets],
            "routes": routes if routes is not None else [route()]}


def commit(env, proposal, revision=0):
    vm, c, actors = env
    with vm.prank(actors["publisher"]):
        return c.commit_cut("signal", revision, json.dumps(proposal))


def model(env, rows):
    env[0].clear_mocks()
    env[0].mock_llm(RULE, json.dumps({"decisions": rows}))


def review(env, plan, matrix, revision=1):
    vm, c, _ = env
    model(env, [{"id": key, "outcome": status, "clauses": [] if status == "UNKNOWN" else [1]} for key, status in matrix])
    value = c.review_cut("signal", revision, plan)
    assert vm.run_validator()
    return value


def approve(env, h, revision=1):
    vm, c, actors = env
    with vm.prank(actors["reviewer"]):
        return c.approve_review("signal", revision, h)


def ready(env, **kw):
    create(env)
    pin = asset(env)
    plan = commit(env, manifest([("footage", pin)], **kw))
    matrix = [(entry["id"] + "/footage", "ALLOW") for entry in kw.get("routes", [route()])]
    h = review(env, plan, matrix)
    approve(env, h)
    return pin, plan, h


def test_distinct_roles_and_no_unsigned_certificate(env):
    vm, c, actors = env
    with vm.expect_revert("distinct"):
        create(env, "0x" + actors["publisher"].hex())
    create(env)
    pin = asset(env)
    with vm.prank(actors["outsider"]), vm.expect_revert("Only the publisher"):
        c.commit_cut("signal", 0, json.dumps(manifest([("footage", pin)])))
    plan = commit(env, manifest([("footage", pin)]))
    with vm.prank(actors["outsider"]), vm.expect_revert("Only campaign participants"):
        c.review_cut("signal", 1, plan)
    decision = review(env, plan, [("web/footage", "ALLOW")])
    with vm.expect_revert("Only the named reviewer"):
        c.approve_review("signal", 1, decision)
    with vm.expect_revert("reviewer approval"):
        c.issue_certificate("signal", 1, "web", decision)
    with vm.prank(actors["reviewer"]), vm.expect_revert("digest does not match"):
        c.approve_review("signal", 1, "f" * 64)
    approval = approve(env, decision)
    with vm.prank(actors["reviewer"]), vm.expect_revert("Only the publisher"):
        c.issue_certificate("signal", 1, "web", decision)
    receipt_hash = c.issue_certificate("signal", 1, "web", decision)
    cert = get(env, "get_certificate", "signal/1/web")
    assert cert["status"] == "VALID"
    assert cert["receipt"]["approval_hash"] == approval
    assert cert["receipt"]["hash"] == receipt_hash == digest(cert["receipt"])
    with vm.expect_revert("already has a certificate"):
        c.issue_certificate("signal", 1, "web", decision)


def test_terms_append_requires_original_issuer_and_expected_head(env):
    vm, c, actors = env
    pin = asset(env)
    with vm.expect_revert("Only the asset issuer"):
        c.publish_terms("footage", pin, NOW-1, NOW+100, json.dumps([CLAUSE]), "", "")
    with vm.expect_revert("head changed"):
        terms(env)
    with vm.expect_revert("No terms fields changed"):
        terms(env, head=pin)
    with vm.expect_revert("must occur in a committed clause"):
        terms(env, head=pin, credit=CREDIT)
    v2 = terms(env, head=pin, text=CLAUSE + " Promotional subtitles may also be added.")
    assert get(env, "get_terms", v2)["previous"] == pin
    assert get(env, "get_terms", pin)["hash"] == pin
    assert get(env, "get_asset", "footage")["versions"] == [pin, v2]
    assert get(env, "list_assets", 0, 4) == ["footage"]


@pytest.mark.parametrize("change,error", [
    (lambda m: m["assets"].append(m["assets"][0]), "duplicate"),
    (lambda m: m["routes"].append(m["routes"][0]), "Duplicate"),
    (lambda m: m["routes"][0].update(channel="STREAM"), "Unsupported"),
    (lambda m: m["routes"][0].update(territory="EARTH"), "territory"),
    (lambda m: m["routes"][0].update(end=NOW), "future end"),
    (lambda m: m["routes"][0].update(credits={"other": "Credit"}), "pinned asset"),
    (lambda m: m["assets"][0].update(terms_hash="e"*64), "Pin the current active terms"),
    (lambda m: m["assets"][0].update(edited=1), "duplicate asset pin"),
    (lambda m: m.update(assets=[]), "1 to 4 assets"),
    (lambda m: m.update(routes=[]), "1 to 3 release"),
])
def test_manifest_rejects_ambiguous_or_invalid_inputs(env, change, error):
    create(env)
    pin = asset(env)
    m = manifest([("footage", pin)])
    change(m)
    vm = env[0]
    with vm.expect_revert(error):
        commit(env, m)
    assert get(env, "get_campaign", "signal")["head_revision"] == 0


@pytest.mark.parametrize("outcome,credit,gate", [
    ("ALLOW", "", "READY"),
    ("CREDIT", CREDIT, "READY"),
    ("CREDIT", "", "NEEDS_CREDIT"),
    ("CREDIT", "A similar credit", "NEEDS_CREDIT"),
    ("DENY", CREDIT, "BLOCKED"),
    ("UNKNOWN", CREDIT, "NEEDS_EVIDENCE"),
])
def test_outcome_and_credit_enforce_exact_gate(env, outcome, credit, gate):
    create(env)
    pin = asset(env, text=CREDIT_CLAUSE, credit=CREDIT)
    plan = commit(env, manifest([("footage", pin)], [route(credits={"footage": credit} if credit else {})]))
    result = review(env, plan, [("web/footage", outcome)])
    approve(env, result)
    assert get(env, "get_cut", "signal", 1)["review"]["routes"]["web"] == gate
    if gate != "READY":
        with env[0].expect_revert("not ready"):
            env[1].issue_certificate("signal", 1, "web", result)


def test_placements_can_be_certified_separately(env):
    create(env)
    footage = asset(env)
    music = asset(env, "music", "MUSIC", text="Owned web distribution is permitted. Paid social ads are forbidden.")
    plan = commit(env, manifest([("footage", footage), ("music", music)], [route(), route("social", "PAID_SOCIAL")]))
    result = review(env, plan, [("web/footage","ALLOW"), ("web/music","ALLOW"), ("social/footage","ALLOW"), ("social/music","DENY")])
    approve(env, result)
    c = env[1]
    c.issue_certificate("signal", 1, "web", result)
    with env[0].expect_revert("not ready"):
        c.issue_certificate("signal", 1, "social", result)
    assert get(env, "get_campaign", "signal")["certificate_ids"] == ["signal/1/web"]


@pytest.mark.parametrize("rows", [
    [],
    [{"id":"elsewhere","outcome":"ALLOW","clauses":[1]}],
    [{"id":"web/footage","outcome":"ALLOW","clauses":[3]}],
    [{"id":"web/footage","outcome":"ALLOW","clauses":[True]}],
    [{"id":"web/footage","outcome":"ALLOW","clauses":[]}],
    [{"id":"web/footage","outcome":"UNKNOWN","clauses":[1]}],
    [{"id":"web/footage","outcome":"PERMIT","clauses":[1]}],
    [{"id":"web/footage","outcome":"ALLOW","clauses":[1],"hint":"extras"}],
])
def test_malformed_decision_vector_never_enters_storage(env, rows):
    create(env)
    pin = asset(env)
    commit_id = commit(env, manifest([("footage", pin)]))
    model(env, rows)
    with env[0].expect_revert("valid decision vector"):
        env[1].review_cut("signal", 1, commit_id)
    assert get(env, "get_cut", "signal", 1)["review"] is None


@pytest.mark.parametrize("outcome,clauses", [("CREDIT",[1]), ("DENY",[1]), ("ALLOW",[2]), ("UNKNOWN",[])])
def test_validator_rejects_difference_in_any_status_or_citation(env, outcome, clauses):
    create(env)
    pin = asset(env, text=[CLAUSE, "A second verifiable clause also permits the placement."])
    plan = commit(env, manifest([("footage", pin)]))
    review(env, plan, [("web/footage", "ALLOW")])
    model(env, [{"id":"web/footage","outcome":outcome,"clauses":clauses}])
    assert env[0].run_validator() is False


def test_out_of_scope_dates_are_deterministically_blocked(env):
    create(env)
    pin = asset(env, end=NOW+60)
    plan = commit(env, manifest([("footage", pin)]))
    env[1].review_cut("signal", 1, plan)
    review_ = get(env, "get_cut", "signal", 1)["review"]
    assert review_["cells"][0]["outcome"] == "DATE_SCOPE" and review_["routes"]["web"] == "BLOCKED"


def test_withdrawal_invalidates_existing_receipt_and_prevents_future_issue(env):
    vm, c, actors = env
    pin, _, h = ready(env, routes=[route(), route("social", "PAID_SOCIAL")])
    c.issue_certificate("signal", 1, "web", h)
    with vm.expect_revert("Only the asset issuer"):
        c.withdraw_terms("footage", pin, "Obsolete")
    with vm.prank(actors["issuer"]):
        c.withdraw_terms("footage", pin, "Obsolete")
    record = get(env, "get_certificate", "signal/1/web")
    assert record["status"] == "STALE_TERMS" and record["changed"][0]["reason"] == "TERMS_WITHDRAWN"
    with vm.expect_revert("Pinned terms changed"):
        c.issue_certificate("signal", 1, "social", h)


def test_revision_history_and_supersession_are_separate_from_drafting(env):
    vm, c, _ = env
    pin, plan, h = ready(env)
    c.issue_certificate("signal", 1, "web", h)
    next_plan = commit(env, manifest([("footage", pin)], label="Cut B"), 1)
    assert get(env, "get_certificate", "signal/1/web")["status"] == "VALID"
    assert get(env, "get_cut", "signal", 2)["plan"]["previous"] == plan
    with vm.expect_revert("head revision changed"):
        commit(env, manifest([("footage", pin)], label="Another draft"), 1)
    with vm.expect_revert("matches the current cut"):
        commit(env, manifest([("footage", pin)], label="Cut B"), 2)
    next_h = review(env, next_plan, [("web/footage", "ALLOW")], 2)
    approve(env, next_h, 2)
    c.issue_certificate("signal", 2, "web", next_h)
    assert get(env, "get_certificate", "signal/1/web")["status"] == "SUPERSEDED"
    assert get(env, "get_certificate", "signal/2/web")["receipt"]["replaces"] == "signal/1/web"
    assert get(env, "get_cut", "signal", 1)["review"]["hash"] == h


def test_licence_update_is_caused_by_current_digest_drift(env):
    vm, c, _ = env
    pin, _, h = ready(env)
    c.issue_certificate("signal", 1, "web", h)
    v2 = terms(env, head=pin, text=CLAUSE + " New version.")
    row = get(env, "get_certificate", "signal/1/web")
    assert row["status"] == "STALE_TERMS"
    assert row["changed"] == [{"asset_id":"footage","pinned":pin,"current":v2,"reason":"TERMS_CHANGED"}]
    with vm.expect_revert("Pin the current active"):
        commit(env, manifest([("footage", pin)], label="Old rights"), 1)


def test_schedule_and_retirement_derive_from_chain_time(env):
    vm, c, actors = env
    _, _, h = ready(env, routes=[route(start=NOW+30, end=NOW+90)])
    cert = c.issue_certificate("signal", 1, "web", h)
    assert get(env, "get_certificate", "signal/1/web")["status"] == "SCHEDULED"
    vm.warp(iso(NOW+30))
    assert get(env, "get_certificate", "signal/1/web")["status"] == "VALID"
    with vm.prank(actors["reviewer"]), vm.expect_revert("Only the publisher"):
        c.retire_certificate("signal/1/web", cert, "Schedule changed")
    vm.warp(iso(NOW+90))
    assert get(env, "get_certificate", "signal/1/web")["status"] == "EXPIRED"
    c.retire_certificate("signal/1/web", cert, "Release was withdrawn")
    assert get(env, "get_certificate", "signal/1/web")["status"] == "RETIRED"


def test_terms_updated_between_commit_and_review_block_the_pinned_placement(env):
    create(env)
    pin = asset(env)
    plan = commit(env, manifest([("footage", pin)]))
    replacement = terms(env, head=pin, text=CLAUSE + " This is the updated evidence.")
    env[1].review_cut("signal", 1, plan)
    review_ = get(env, "get_cut", "signal", 1)["review"]
    assert review_["routes"]["web"] == "BLOCKED"
    assert review_["cells"][0]["outcome"] == "TERMS_CHANGED"
    assert review_["cells"][0]["terms_hash"] == pin != replacement
