export const config = {
  tutorModel: process.env.TUTOR_MODEL ?? 'claude-sonnet-5',
  graderModel: process.env.GRADER_MODEL ?? 'claude-haiku-4-5',
  problemModel: process.env.PROBLEM_MODEL ?? 'claude-sonnet-5',
  hintCap: Number(process.env.HINT_CAP ?? 3),
  port: Number(process.env.PORT ?? 8787),
  guardrailClassifier: (process.env.GUARDRAIL_CLASSIFIER ?? 'true') !== 'false',
}
