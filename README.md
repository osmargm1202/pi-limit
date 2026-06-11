# pi-limit

ORGM Pi limits package scaffold for `/orgm-limits`.

Status: scaffold only. Runtime behavior still lives in `pi-harness` until extraction lands.

## Install

```bash
pi install git:github.com/osmargm1202/pi-limit
```

This package is also loaded by the ORGM bundle:

```bash
pi install git:github.com/osmargm1202/pi-harness
```

## Owns after extraction

- `/orgm-limits`
- ChatGPT/Codex/MiniMax limit reporting helpers currently in `pi-harness`.
- Command-only inline limit output. No persistent footer state.

## Development

```bash
npm install
npm test
npm run pack:check
```
