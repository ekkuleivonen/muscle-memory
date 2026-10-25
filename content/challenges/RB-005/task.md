Evaluate an integer expression written in reverse Polish notation.

Implement `evaluate(tokens)`. Tokens are integers written as decimal strings (possibly negative), or +, - or \*. Each operator consumes the two preceding results: left operand first, then right. Input is a valid nonempty expression with exactly one final result, at most 100 tokens. Every token integer and intermediate result fits in -1000000..1000000. No division or other operators occur.

## Examples

Input: `["2", "3", "+", "4", "*"]` → output: `20`.
Input: `["8", "3", "-"]` → output: `5`.
