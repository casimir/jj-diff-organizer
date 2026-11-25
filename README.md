# jj-diff-organizer

A `jj` companion for those who love drag-and-drop as much as command lines.

## Philosophy

This app is a visual extension to the `jj` CLI, core principles are inspired by [acme](https://9p.io/sys/doc/acme/acme.html). Half the screen shows a classical graph & diff, while the other half is a simple terminal.
The interface is updated automatically based on the repo state. Commands can be executed by moving objects in the UI, with immediate feedback. Those commands are atomic and can be reverted with `jj undo`.

The purely visual features are built around a “change, review, commit”worklfow.  

## Install

Download from [Releases](https://github.com/casimir/jj-diff-organizer/releases/latest). The app updates itself.

On macOS, run `xattr -dr com.apple.quarantine` on the app after a browser download.

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
