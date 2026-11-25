# Herbs & Formulations public browser (prototype)

This is a **static** reader, not a public herb dataset. It imports the generated `catalog-bundle.json` from the user's device using a file picker, then stores that catalog in the browser's IndexedDB. **No source herb JSON is deployed to this public repository.** Clear/forget local browser storage before sharing the device.

The catalog is built from the user-supplied Excel workbook by a Python converter included in the separate data export package. The generated records currently include 431 master herb records, 38 spice records, 41 Western-herb records, and unverified formulation-name mentions.

## Test

1. Download the private data package from the ChatGPT conversation and unzip it on your device.
2. Open https://qiprana.github.io/Swaadhaaya-Public/projects/herbs-formulations/
3. Click **Choose catalog JSON** and select `private-data/catalog-bundle.json`.
4. Search Amalaki, Ashwagandha, Triphala, or a botanical name; open a record and follow its formulation references.
5. Enable editing to add browser-local notes; export encrypted notes for backup.

## Security and editorial limits

- This is **not** a passcode-gated or encrypted public catalog. The import is manual to protect unpublished source data.
- Catalog and notes are stored locally in IndexedDB without encryption at rest; the exported **notes backup** is encrypted with a user-supplied strong passphrase.
- Formulation references do not prove ingredients or constitute a verified recipe.
- Therapeutic/dose text comes from the source workbook and is not verified medical advice.
- Photographs, Sanskrit verses and audio are unpopulated slots until sourced and reviewed.
