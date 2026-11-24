# SlateClear

SlateClear is a GenLayer clearance desk for editors, production teams and publishers. It reviews a cut's footage, music and graphics against committed license excerpts for each proposed release placement. A cut may be ready for an owned website and blocked for a paid social campaign. The desk shows the specific asset, clause and terms version behind that decision.

## Open the live case

1. Open the dashboard and select **Open live case**. The app reads finalized Studionet state using the GenLayer SDK. You can also open the site with `?network=studionet`.
2. In **Signal Room trailer**, look at **Cut 01**. The soundtrack's first terms version restricts paid social. Select that matrix cell for its exact excerpt. The owned website gate for this historical cut reads **Ready**.
3. Open **Compare cuts**. The soundtrack moves from terms v1 to v2 and the paid social gate changes from **Blocked** to **Ready**.
4. Open **Certificates**. The original website receipt reads **Stale terms** because of the newer soundtrack evidence. The paid social receipt for Cut 02 reads **Valid**. Select **Verify live status** to refresh the contract check.
5. **Export audit bundle** downloads the cuts, licensing evidence, review approvals and receipts. **Verify an audit bundle** checks their digests and recomputes placement gates and receipt references.

The browser also includes a standalone sample dataset. The live case uses fictional terms and three disposable test wallets.

## Studionet proof

The Intelligent Contract is deployed on Studionet (chain 61999). The scenario contains both finalized reviews, an issuer's updated soundtrack terms, two independent reviewer approvals and two release certificates.

- [SlateClear contract](https://explorer-studio.genlayer.com/address/0x1EBEFa1A949788a11F3056224A68202a5b0F10DE)
- [First website certificate](https://explorer-studio.genlayer.com/tx/0x57c4f77403a89ee17fc8ddb44ddc6f2847157f07053da9490c00240c0b4f1932)
- [Soundtrack terms update](https://explorer-studio.genlayer.com/tx/0x83870c6400310d2347b41b35b8c7b169cc9592bd53d53007e03ec642d301f810)
- [Second matrix review](https://explorer-studio.genlayer.com/tx/0xbd1bed72ae332c8d77e06527803134739bb73364164332d208e267da0b71965a)
- [Paid social certificate](https://explorer-studio.genlayer.com/tx/0x4267ec3666c93cffb06cc68d6ab51241e5277b808b62b4ad0b0300f040673aa6)
- [Machine-readable verification](docs/studionet-report.json) records all 17 finalized scenario transactions and the match between deployed and packaged source bytes.
- [Wallet adapter verification](docs/wallet-sdk-report.json) records a separate finalized campaign write through the browser SDK with a scripted EIP-1193 signer.

## How the clearance gate works

| Stage | Record |
|---|---|
| Issuer publishes terms | Numbered clauses with a validity window, optional exact credit, source reference, version and prior digest |
| Publisher commits a cut | Immutable revision pins the terms digest for each asset and the channel, territory, edits, release window and credit for each placement |
| GenLayer reviews | The leader and independent validators evaluate each asset-placement pair and agree on its exact outcome and cited clause numbers |
| Deterministic checks | An applicable restriction blocks the placement. Unclear evidence holds it. Attribution must match the exact credit. Changed terms and dates outside the licensed window also block clearance |
| Named reviewer approves | A separate wallet signs the review digest |
| Publisher issues a certificate | Each eligible placement receives a receipt linked to the pinned terms, cut, matrix and approval |
| Verifier checks the receipt | On-chain reads identify validity, changed or withdrawn evidence, expiry, supersession, scheduling or retirement |

A newer draft leaves the current certificate in place while its evidence remains current. A newly issued certificate supersedes the previous receipt for that placement ID. An issuer update or withdrawal makes certificates pinned to the older evidence stale. The original terms, matrix, approval and receipt stay available for inspection.

SlateClear records the evidence presented by issuer wallets and the reviewer's approval. Reviewers establish the issuer's real-world authority and check the final published assets and credits against the recorded plan. Excerpts committed to Studionet are public. Offline audit exports verify internal hashes and deterministic rules. A finalized live read establishes a certificate's current status and origin.

## Run and deploy

Use Node.js 22.12+ or 24.

```sh
npm ci
npm run dev
```

To use the included build, run `python3 -m http.server 8080 --directory dist` and visit `http://localhost:8080`.

In live mode, use an injected EIP-1193 wallet with Studionet test GEN. The issuer registers assets and publishes terms from **Asset library**. The publisher creates a campaign with a distinct reviewer, commits a cut and requests GenLayer review. The reviewer approves the resulting digest. The publisher issues a certificate for a ready placement. The site tracks pending transaction IDs so finality checks can resume after a reload.

The included GitHub Pages workflow builds the frontend from `main`, checks contract tests and publishes `dist/`. Select **GitHub Actions** under **Settings → Pages → Build and deployment**. The relative asset paths support a repository path. See the [Portal application draft](docs/PORTAL_SUBMISSION.md).

## Reproduce verification

```sh
npm test
npm run build

python3.12 -m venv .venv
. .venv/bin/activate
pip install -r requirements.txt
python -m pytest tests/test_slate_clear.py -q
genvm-lint check contracts/slate_clear.py
```

The GenVM tests use mocked model responses to check malformed output, independent validator disagreement, date and attribution gates, authority, revision races and certificate invalidation. The browser calculation tests verify both the sample and actual Studionet audit bundle.

Run `python scripts/studionet_demo.py --output-dir local-deployment` to reproduce the live scenario on a fresh contract using disposable Studionet wallets. The script persists submitted hashes and validates the packaged source against on-chain code. Its private wallet file stays in the output directory. Update `src/deployment.json` with a fresh instance or enter the contract address under **Sample data → Workspace connection**.

## Image credit

Illustrative still **NASA/JPL-Caltech**, from [The Goldstone Solar System Radar at Sunset](https://www.jpl.nasa.gov/images/pia26150-the-goldstone-solar-system-radar-at-sunset/). The still illustrates the workspace, and the sample license records are fictional. [Image use policy](https://www.jpl.nasa.gov/jpl-image-use-policy/).
