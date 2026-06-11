# pi-limit

ORGM Pi limits package for `/orgm-limits`.

## Install

```bash
pi install git:github.com/osmargm1202/pi-limit
```

This package is also loaded by the ORGM bundle:

```bash
pi install git:github.com/osmargm1202/pi-harness
```

## Owns

- `/orgm-limits`
- ChatGPT/Codex/MiniMax limit reporting helpers.
- Command-only inline limit output.

## Rules

- No persistent footer state.
- No `pi-footer` limit rendering.
- Limit output stays explicit and command-triggered.

## Development

```bash
npm install
npm test
npm run pack:check
```
