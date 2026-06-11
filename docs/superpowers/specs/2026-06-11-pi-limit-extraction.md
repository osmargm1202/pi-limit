# pi-limit Extraction Scope

`pi-limit` will own `/orgm-limits` and related command-only limit reporting helpers.

Source candidates in `pi-harness`:

- `extensions/limit.ts`
- `extensions/lib/limit-usage.ts`
- `tests/limit-usage.test.ts`

Rules:

- Keep output command-only inline.
- Do not add persistent footer/status state.
- `pi-footer` must not render ChatGPT/Codex limits.
