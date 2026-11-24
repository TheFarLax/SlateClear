# SlateClear Portal application

**Contribution** Builder → Projects → Project

**Project name** SlateClear

**Primary tag** Dispute Resolution

**Tag 1** License Claims

**Tag 2** Evidence Assessment

## One-liner

SlateClear reviews media rights per release placement and issues verifiable clearance certificates on GenLayer.

## Description

SlateClear helps editors and studios clear a cut for different publication channels. Issuers publish versioned license excerpts. A publisher pins each asset's terms to a cut and records the intended channel, territory, dates, edits and credits. GenLayer validators independently classify each asset-placement pair and agree on its exact outcome and supporting clause numbers. Deterministic checks enforce date coverage, required credit and current evidence. A separate reviewer signs the matrix before the publisher issues a certificate for each ready placement. Updating the soundtrack terms makes affected receipts stale while preserving both cuts and their evidence. The dashboard reads finalized Studionet records and supports wallet-signed actions and verifiable audit exports.

## How-to

1. **Open the live case.** Select **Open live case** in the dashboard. In **Signal Room trailer**, inspect **Cut 01** and the **Signal Room score / Paid social** cell.
2. **Compare the cuts.** Select **Compare cuts**. Find the soundtrack’s terms update and the paid social gate moving from **Blocked** to **Ready**.
3. **Verify certificates.** Open **Certificates**. Select **Verify live status** on both receipts to inspect their current state and the issuance transactions.

## Expected verification outcome

Cut 01 shows Owned website Ready and Paid social Blocked. The score's original clause restricts paid advertising. Cut 02 pins the updated terms and Paid social becomes Ready. The original website certificate is Stale terms and the Cut 02 Paid social certificate is Valid. The audit bundle verifies two cuts, four terms records and two certificates.

## Contract and evidence

- [Studionet contract](https://explorer-studio.genlayer.com/address/0x1EBEFa1A949788a11F3056224A68202a5b0F10DE)
- [Issuer publishes the soundtrack terms update](https://explorer-studio.genlayer.com/tx/0x83870c6400310d2347b41b35b8c7b169cc9592bd53d53007e03ec642d301f810)
- [GenLayer accepts the second rights matrix](https://explorer-studio.genlayer.com/tx/0xbd1bed72ae332c8d77e06527803134739bb73364164332d208e267da0b71965a)
- [The publisher issues the paid social certificate](https://explorer-studio.genlayer.com/tx/0x4267ec3666c93cffb06cc68d6ab51241e5277b808b62b4ad0b0300f040673aa6)
- [Full verification report](studionet-report.json)

Use a public deployment of the included frontend for the Website field.
