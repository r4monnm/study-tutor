import { config } from '../src/config'

// The guardrail LLM classifier is ON in production but OFF by default in tests so that
// route tests queue only the grader responses they need (no extra classifier call).
// Tests that exercise the classifier path re-enable it locally and restore it after.
config.guardrailClassifier = false
