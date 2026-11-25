# Herbs & Formulations — automatic encrypted preview

The public GitHub Pages project page fetches `data/herbs-catalog.encrypted.json` when supplied a personal preview key in the **URL fragment**:

`https://qiprana.github.io/Swaadhaaya-Public/projects/herbs-formulations/#key=<secret>`

The 510-record source catalog is compressed (gzip), encrypted with an independent random AES-256-GCM content key, and served publicly **only as ciphertext**. The key is not published in the source repository or scripts. Browser-side Web Crypto decrypts the data after opening the private preview link; no file picker is needed. After the first successful open, the catalog is cached unencrypted in this browser's IndexedDB, so subsequent visits from the normal Swaadhaaya homepage load automatically on the same device.

**This is a prototype bearer link, NOT per-user authentication:** Anyone who obtains the preview link can decrypt and copy the complete dataset; link revocation requires regenerating a new content key and republishing. Do not share or post the link publicly. The browser's stored plaintext is only suitable for trusted devices. The eventual passcode architecture will replace the secret link and encrypted-at-rest storage will be revisited.

If the link is missing or the browser lacks modern Web Crypto/DecompressionStream support, the JSON file-picker fallback remains available. 510 herb records and 786 unverified formulation name references are sourced from the user-supplied Excel file; formulation mentions are not verified ingredient recipes. Botanical images, ślokas and audio are not yet populated.

The original Excel workbook and per-herb source JSON remain outside this public repo.
