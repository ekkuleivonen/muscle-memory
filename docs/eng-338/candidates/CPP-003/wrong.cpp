#include <string>
bool balanced(const std::string &text)
{
    std::string stack;
    for (char c : text) {
        if (c == '(' || c == '[' || c == '{') stack.push_back(c);
        else if (c == ')' || c == ']' || c == '}') {
            if (stack.empty()) return false;
            char expected = c == ')' ? '(' : (c == ']' ? '[' : '{');
            if (stack.back() != expected) return false;
            stack.pop_back();
        }
    }
    return true;
}
