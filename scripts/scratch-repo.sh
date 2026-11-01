#!/usr/bin/env bash
# Rebuilds the QA repo at sandbox/repo: a fixed shape with real hunks in every change.
# Edits are spread over 30-line files so several changes (and @) have disjoint hunks.
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
repo="$root/sandbox/repo"

rm -rf "$repo"
mkdir -p "$repo"
cd "$repo"

jj git init --colocate >/dev/null
cat > "$(jj config path --repo)" <<'TOML'
[user]
name = "Scratch"
email = "scratch@example.com"
TOML
jj metaedit --update-author

jj() { command jj --quiet "$@"; }

lines() { for i in $(seq 1 30); do echo "$1 line $i"; done; }

edit() { # file, line number, new text
  sed -i.bak "$2s/.*/$3/" "$1" && rm "$1.bak"
}

lines alpha > alpha.txt
lines beta > beta.txt
lines gamma > gamma.txt
jj describe -m "base" >/dev/null

jj new -m "main-1: gamma title" >/dev/null
edit gamma.txt 1 "gamma line 1 (main-1)"

jj new -m "main-2: beta end, gamma middle" >/dev/null
edit beta.txt 28 "beta line 28 (main-2)"
edit gamma.txt 15 "gamma line 15 (main-2)"

jj new -m "main-3: alpha title" >/dev/null
edit alpha.txt 1 "alpha line 1 (main-3)"

jj new -m "main: alpha intro and outro" >/dev/null
edit alpha.txt 2 "alpha line 2 (main)"
edit alpha.txt 25 "alpha line 25 (main)"
jj bookmark create main -r @ >/dev/null
cat >> "$(jj config path --repo)" <<'TOML'

[revset-aliases]
'immutable_heads()' = "main"
TOML

jj new -m "feat-a-1: alpha start and end, beta intro" >/dev/null
edit alpha.txt 5 "alpha line 5 (feat-a-1)"
edit alpha.txt 20 "alpha line 20 (feat-a-1)"
edit beta.txt 3 "beta line 3 (feat-a-1)"

jj new -m "feat-a-2: beta middle" >/dev/null
edit beta.txt 15 "beta line 15 (feat-a-2)"

jj new -m "feat-a-3: gamma intro, alpha lower middle" >/dev/null
edit gamma.txt 4 "gamma line 4 (feat-a-3)"
edit alpha.txt 10 "alpha line 10 (feat-a-3)"

jj new -m "feat-a-4: gamma end" >/dev/null
edit gamma.txt 27 "gamma line 27 (feat-a-4)"
jj bookmark create feat-a -r @ >/dev/null

jj new feat-a-- -m "feat-c-1: alpha near start and end" >/dev/null
edit alpha.txt 12 "alpha line 12 (feat-c-1)"
edit alpha.txt 29 "alpha line 29 (feat-c-1)"

jj new -m "feat-c-2: gamma middle" >/dev/null
edit gamma.txt 18 "gamma line 18 (feat-c-2)"
jj bookmark create feat-c -r @ >/dev/null

jj new main -m "feat-b-1: beta middle" >/dev/null
edit beta.txt 20 "beta line 20 (feat-b-1)"

jj new -m "feat-b-2: gamma start, middle and end, alpha intro" >/dev/null
edit gamma.txt 2 "gamma line 2 (feat-b-2)"
edit gamma.txt 22 "gamma line 22 (feat-b-2)"
edit gamma.txt 29 "gamma line 29 (feat-b-2)"
edit alpha.txt 6 "alpha line 6 (feat-b-2)"

jj new -m "feat-b-3: beta title" >/dev/null
edit beta.txt 1 "beta line 1 (feat-b-3)"
jj bookmark create feat-b -r @ >/dev/null

jj new feat-a -m "wip: beta in two places, gamma, alpha adjacent lines" >/dev/null
edit beta.txt 12 "beta line 12 (wip)"
edit beta.txt 27 "beta line 27 (wip)"
edit gamma.txt 10 "gamma line 10 (wip)"
edit alpha.txt 14 "alpha line 14 (wip)"
edit alpha.txt 15 "alpha line 15 (wip)"

echo "repo: $repo"
