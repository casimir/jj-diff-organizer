# jj-diff-organizer

A `jj` companion for those that love drag'n'drop as much as CLI.

## Run

```
npm install
JJDO_REPO=/path/to/jj/repo npm run tauri dev
```

Run against a clean scratch repo.

```
scripts/scratch-repo.sh && JJDO_REPO=$PWD/sandbox/repo npm run tauri dev
```

Repo resolution: `JJDO_REPO`, else the first non-flag argument, else the current directory.

## Tooling

```
make check
make test
```
