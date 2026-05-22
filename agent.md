<!-- START RULES -->

# RULES

**STRICT COMMENT LIMITS**:
   - **Density**: Comments must not exceed 20% of the file's total lines (30% for files under 50 lines).
   - **Vertical**: Max 10 consecutive comment lines for function docstrings. Max 3 consecutive comment lines for inline logic.
   - **Horizontal**: No comment line can exceed 80 characters.
   - **Quality**: Explain "Why", not "What". Never state the obvious. Never leave commented-out code.

**KEEP IT CONCISE**:
   - Files must not exceed 300 lines.
   - Functions must not exceed 50 lines.
   - Do not generate massive monolithic blocks of code. Break down your logic into smaller, modular helpers.

**POST-DEVELOPMENT CHECKS**:
   - **Linting**: Always verify the code by running `bun run lint` after completing any changes to ensure quality and standard compliance.

<!-- END RULES -->