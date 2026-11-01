.PHONY: check test

check:
	cargo check --workspace
	npm run typecheck

test:
	cargo test --workspace
	npm test
