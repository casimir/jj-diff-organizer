# jj-diff-organizer

A `jj` companion for those that love drag'n'drop as much as command lines.

## Install

Download from [Releases](https://github.com/casimir/jj-diff-organizer/releases/latest). The app updates itself.

On macOS, `xattr -dr com.apple.quarantine` the app after a browser download.

## Release

`npm version patch --no-git-tag-version`, push, `gh workflow run release`.

## Run

```
npm install
npm run tauri dev
```

Run against a clean scratch repo.

```
scripts/scratch-repo.sh && JJDO_REPO=$PWD/sandbox/repo npm run tauri dev
```

The repo to open can be specified as an argument or in the env with `JJDO_REPO`. Or it can be opened from the app itself.

## Tooling

```
make check
make test
```
