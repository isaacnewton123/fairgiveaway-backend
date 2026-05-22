import tseslint from 'typescript-eslint'
import aiGuardrails from 'eslint-plugin-ai-guardrails'

export default [
  { ignores: ['dist', 'build', 'coverage', 'node_modules'] },
  ...tseslint.configs.recommended,
  aiGuardrails.flatConfigs.recommended
]
