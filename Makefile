.PHONY: check test

check:
	cargo fmt --check
	cargo check
	npm run typecheck

test:
	cargo test
	npm test
