use std::collections::VecDeque;

use serde::Serialize;

use crate::jj::{Op, Run};

const MAX_FAILURES: usize = 200;

/// A command of the app that failed, so it created no operation.
#[derive(Debug, Clone)]
pub struct Failure {
    pub id: u64,
    pub started: u64,
    pub command: String,
    pub output: String,
}

impl From<&Run> for Failure {
    fn from(run: &Run) -> Self {
        Self {
            id: run.id,
            started: run.started,
            command: run.command.clone(),
            output: [run.stdout.as_str(), run.stderr.as_str()]
                .into_iter()
                .filter(|s| !s.is_empty())
                .collect::<Vec<_>>()
                .join("\n"),
        }
    }
}

#[derive(Debug, Clone, Serialize)]
pub struct Entry {
    pub id: String,
    pub time: u64,
    pub command: String,
    pub gui: bool,
    pub failed: bool,
    pub detail: String,
}

#[derive(Debug, Default)]
pub struct History {
    failures: VecDeque<Failure>,
}

impl History {
    pub fn push(&mut self, failure: Failure) {
        if self.failures.len() == MAX_FAILURES {
            self.failures.pop_front();
        }
        self.failures.push_back(failure);
    }

    /// Chronological entries, oldest first: the op log without its snapshot operations, with
    /// the failures placed by time.
    pub fn entries(&self, ops: &[Op]) -> Vec<Entry> {
        let mut out: Vec<Entry> = ops
            .iter()
            .filter(|op| !op.is_snapshot)
            .map(|op| {
                let gui = op.from_gui();
                let op = op.clone().without_marker();
                Entry {
                    id: op.id.clone(),
                    time: op.start_ms,
                    command: if op.attributes.args.is_empty() {
                        op.description.clone()
                    } else {
                        op.attributes.args.clone()
                    },
                    gui,
                    failed: false,
                    detail: op.description,
                }
            })
            .chain(self.failures.iter().map(|f| Entry {
                id: format!("failure-{}", f.id),
                time: f.started,
                command: f.command.clone(),
                gui: true,
                failed: true,
                detail: f.output.clone(),
            }))
            .collect();
        out.sort_by_key(|e| e.time);
        out
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::jj::OpAttributes;

    fn op(id: &str, is_snapshot: bool, start_ms: u64) -> Op {
        Op {
            id: id.into(),
            description: String::new(),
            is_snapshot,
            start_ms,
            attributes: OpAttributes::default(),
        }
    }

    fn failure(id: u64, started: u64) -> Failure {
        Failure {
            id,
            started,
            command: format!("run {id}"),
            output: String::new(),
        }
    }

    #[test]
    fn marker_is_hidden_from_the_recorded_command() {
        let mut o = op("a", false, 1);
        o.attributes.args =
            "jj '--color=never' --no-pager --config 'jjdo.gui=true' --quiet new".into();
        let entries = History::default().entries(&[o]);
        assert!(entries[0].gui);
        assert_eq!(
            entries[0].command,
            "jj '--color=never' --no-pager --quiet new"
        );
    }

    #[test]
    fn failures_are_placed_among_the_ops_by_time_and_snapshots_are_hidden() {
        let mut history = History::default();
        history.push(failure(1, 15));
        let ops_newest_first = [op("b", false, 20), op("snap", true, 17), op("a", false, 10)];

        let ids: Vec<String> = history
            .entries(&ops_newest_first)
            .into_iter()
            .map(|e| e.id)
            .collect();

        assert_eq!(ids, ["a", "failure-1", "b"]);
    }
}
