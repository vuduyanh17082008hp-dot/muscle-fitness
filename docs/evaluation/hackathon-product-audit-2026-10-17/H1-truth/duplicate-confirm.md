# Duplicate confirmation evidence

Candidate HEAD `62084744aba6d44add9e64831912abef32838bef`; start fingerprint `1e99979574363a9fa2aee8a4bd0a63aafdec9b0f29852ff5f0de8e3e21749cfa`; local Supabase/PostgREST v14.18. Five local trials, each delivered the same valid pending confirmation twice. Raw results: `duplicate-confirm.jsonl`.

| Measurement | Result |
|---|---:|
| Delivery attempts | 10 |
| Successful first confirmations | 5 |
| Duplicate/already handled responses | 5 |
| Logical effects | 5 |
| Food rows | 5 (one per trial) |
| User-visible success receipts | 5 |

Observed per trial: first request HTTP 200; repeated request HTTP 422 (`already handled`); backend had one executed action and one corresponding food row. This supports effectively-once behavior for the narrow repeated-confirmation path tested. It does not establish generic exactly-once delivery or idempotency for arbitrary retries. A separate early harness fixture had malformed action arguments and was excluded; it is not product evidence.

