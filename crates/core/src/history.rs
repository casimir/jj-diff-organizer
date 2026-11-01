use std::collections::VecDeque;

use serde::Serialize;

use crate::jj::{Op, Run};

const MAX_RUNS: usize = 200;

#[derive(Debug, Clone, Serialize)]
#[serde(tag = "source", rename_all = "snake_case")]
pub enum Entry {
    Gui { run: Run },
    OpLog { op: Op, gui: bool },
}

#[derive(Debug, Default)]
pub struct History {
    runs: VecDeque<Run>,
}

impl History {
    pub fn push(&mut self, run: Run) {
        if self.runs.len() == MAX_RUNS {
            self.runs.pop_front();
        }
        self.runs.push_back(run);
    }

    /// Chronological entries, oldest first. `ops` is the op log, newest first.
    ///
    /// A GUI run that created an operation replaces that operation's entry. A run that
    /// created none (it failed, or had nothing to do) follows the operation that was
    /// current when it ran. Snapshot operations are hidden.
    pub fn entries(&self, ops: &[Op]) -> Vec<Entry> {
        let mut out = Vec::new();
        let mut placed = vec![false; self.runs.len()];

        for op in ops.iter().rev() {
            let creator = self
                .runs
                .iter()
                .position(|r| r.created_op() && r.op_after == [op.id.clone()]);
            match creator {
                Some(i) => {
                    placed[i] = true;
                    out.push(Entry::Gui {
                        run: self.runs[i].clone(),
                    });
                }
                None if !op.is_snapshot => out.push(Entry::OpLog {
                    gui: op.from_gui(),
                    op: op.clone().without_marker(),
                }),
                None => {}
            }
            for (i, run) in self.runs.iter().enumerate() {
                if !placed[i] && !run.created_op() && run.op_before == [op.id.clone()] {
                    placed[i] = true;
                    out.push(Entry::Gui { run: run.clone() });
                }
            }
        }
        for (i, run) in self.runs.iter().enumerate() {
            if !placed[i] {
                out.push(Entry::Gui { run: run.clone() });
            }
        }
        out
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::jj::{OpAttributes, OpTime};

    fn op(id: &str, is_snapshot: bool) -> Op {
        Op {
            id: id.into(),
            description: String::new(),
            is_snapshot,
            time: OpTime {
                start: String::new(),
            },
            attributes: OpAttributes::default(),
        }
    }

    fn run(id: u64, exit_code: i32, before: &str, after: &str) -> Run {
        Run {
            id,
            command: format!("run {id}"),
            stdout: String::new(),
            stderr: String::new(),
            exit_code: Some(exit_code),
            duration_ms: 0,
            op_before: vec![before.into()],
            op_after: vec![after.into()],
        }
    }

    #[test]
    fn marker_is_hidden_from_the_recorded_command() {
        let mut o = op("a", false);
        o.attributes.args =
            "jj '--color=never' --no-pager --config 'jjdo.gui=true' --quiet new".into();
        let entries = History::default().entries(&[o]);
        let Entry::OpLog { op, gui } = &entries[0] else {
            panic!()
        };
        assert!(gui);
        assert_eq!(
            op.attributes.args,
            "jj '--color=never' --no-pager --quiet new"
        );
    }

    fn label(entry: &Entry) -> String {
        match entry {
            Entry::Gui { run } => format!("gui:{}", run.id),
            Entry::OpLog { op, .. } => format!("op:{}", op.id),
        }
    }

    #[test]
    fn gui_runs_replace_their_op_and_failures_follow_the_current_op() {
        let mut history = History::default();
        history.push(run(1, 0, "snap", "created"));
        history.push(run(2, 1, "created", "created"));
        let ops_newest_first = [
            op("created", false),
            op("snap", true),
            op("external", false),
        ];

        let labels: Vec<String> = history
            .entries(&ops_newest_first)
            .iter()
            .map(label)
            .collect();

        assert_eq!(labels, ["op:external", "gui:1", "gui:2"]);
    }
}
