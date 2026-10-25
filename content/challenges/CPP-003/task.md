Return whether every opening bracket has a matching closing bracket in the correct nesting order.

Implement `bool balanced(const std::string& text)`. Only `()`, `[]` and `{}` are brackets; ignore all other characters. An empty string is balanced. Input contains at most 200 ASCII characters.

## Examples

Input: `"a{b[c](d)}"` → output: `true`.
Input: `"([)]"` → output: `false`.
