#!/usr/bin/env bash

set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
repo="$root/sandbox/repo"
build="$repo.build"

rm -rf "$build"
mkdir -p "$build"
cd "$build"

jj git init --colocate >/dev/null
cat > "$(jj config path --repo)" <<'TOML'
[user]
name = "Scratch"
email = "scratch@example.com"
TOML
jj metaedit --update-author

jj() { command jj --quiet "$@"; }

MIN=60 HOUR=3600 DAY=86400
# jj stamps a change when the next command snapshots it, so call this right after a change's edits.
age() {
  local t=$(($(date +%s) - $1))
  JJ_TIMESTAMP="$(date -u -d "@$t" +%FT%TZ 2>/dev/null || date -u -r "$t" +%FT%TZ)"
  export JJ_TIMESTAMP
}

lines() { for i in $(seq 1 30); do echo "$1 line $i"; done; }

edit() { # file, line number, new text
  sed -i.bak "$2s/.*/$3/" "$1" && rm "$1.bak"
}

deep=crates/core/src/deeply/nested/module/zeta.txt
mkdir -p src/ui docs "$(dirname "$deep")"
lines alpha > src/alpha.txt
lines delta > src/delta.txt
lines beta > src/ui/beta.txt
lines epsilon > src/ui/epsilon.txt
lines gamma > docs/gamma.txt
lines zeta > "$deep"
lines readme > README.md
lines lock > Cargo.lock
age $((6 * 7 * DAY))
jj describe -m "base" >/dev/null

jj new -m "main-1: gamma title" >/dev/null
edit docs/gamma.txt 1 "gamma line 1 (main-1)"

age $((3 * 7 * DAY))
jj new -m "main-2: beta end, gamma middle" >/dev/null
edit src/ui/beta.txt 28 "beta line 28 (main-2)"
edit docs/gamma.txt 15 "gamma line 15 (main-2)"

age $((2 * 7 * DAY))
jj new -m "main-3: alpha title" >/dev/null
edit src/alpha.txt 1 "alpha line 1 (main-3)"

age $((5 * DAY))
jj new -m "main: alpha intro and outro" >/dev/null
edit src/alpha.txt 2 "alpha line 2 (main)"
edit src/alpha.txt 25 "alpha line 25 (main)"
age $((4 * DAY))
jj bookmark create main -r @ >/dev/null
cat >> "$(jj config path --repo)" <<'TOML'

[revset-aliases]
'immutable_heads()' = "main"
TOML

jj new -m "feat-a-1: alpha start and end, beta intro" >/dev/null
edit src/alpha.txt 5 "alpha line 5 (feat-a-1)"
edit src/alpha.txt 20 "alpha line 20 (feat-a-1)"
edit src/ui/beta.txt 3 "beta line 3 (feat-a-1)"

age $((2 * DAY))
jj new -m "feat-a-2: beta middle" >/dev/null
edit src/ui/beta.txt 15 "beta line 15 (feat-a-2)"

age $((20 * HOUR))
jj bookmark create feat/very-long-bookmark-name -r @ >/dev/null
jj new -m "feat-a-3: gamma intro, alpha lower middle" >/dev/null
edit docs/gamma.txt 4 "gamma line 4 (feat-a-3)"
edit src/alpha.txt 10 "alpha line 10 (feat-a-3)"

age $((6 * HOUR))
jj new -m "feat-a-4: gamma end" >/dev/null
edit docs/gamma.txt 27 "gamma line 27 (feat-a-4)"
age $((3 * HOUR))
jj bookmark create feat-a -r @ >/dev/null

jj new feat-a-- -m "feat-c-1: alpha near start and end" >/dev/null
edit src/alpha.txt 12 "alpha line 12 (feat-c-1)"
edit src/alpha.txt 29 "alpha line 29 (feat-c-1)"

age $((1 * HOUR))
jj new -m "feat-c-2: gamma middle" >/dev/null
edit docs/gamma.txt 18 "gamma line 18 (feat-c-2)"
age $((25 * MIN))
jj bookmark create feat-c -r @ >/dev/null

jj new main -m "feat-b-1: beta middle" >/dev/null
edit src/ui/beta.txt 20 "beta line 20 (feat-b-1)"

age $((1 * DAY))
jj new -m "feat-b-2: gamma start, middle and end, alpha intro" >/dev/null
edit docs/gamma.txt 2 "gamma line 2 (feat-b-2)"
edit docs/gamma.txt 22 "gamma line 22 (feat-b-2)"
edit docs/gamma.txt 29 "gamma line 29 (feat-b-2)"
edit src/alpha.txt 6 "alpha line 6 (feat-b-2)"

age $((12 * HOUR))
jj new -m "feat-b-3: beta title" >/dev/null
edit src/ui/beta.txt 1 "beta line 1 (feat-b-3)"
age $((4 * HOUR))
jj bookmark create feat-b wip/gamma-split-experiment -r @ >/dev/null

jj new feat-a -m "wip: beta in two places, gamma, alpha adjacent lines" >/dev/null
edit src/ui/beta.txt 12 "beta line 12 (wip)"
edit src/ui/beta.txt 27 "beta line 27 (wip)"
edit docs/gamma.txt 10 "gamma line 10 (wip)"
edit src/alpha.txt 14 "alpha line 14 (wip)"
edit src/alpha.txt 15 "alpha line 15 (wip)"
edit src/delta.txt 8 "delta line 8 (wip)"
edit src/ui/epsilon.txt 20 "epsilon line 20 (wip)"
edit "$deep" 5 "zeta line 5 (wip)"
edit README.md 3 "readme line 3 (wip)"
edit Cargo.lock 10 "lock line 10 (wip)"

cd "$root"
rm -rf "$repo"
mv "$build" "$repo"
echo "repo: $repo"
