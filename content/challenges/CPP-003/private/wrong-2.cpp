/* Mistake: recognizes parentheses only. */
#include <string>
bool balanced(const std::string &t) {
    int n = 0;
    for (char c : t) {
        if (c == '(')
            n++;
        if (c == ')' && --n < 0)
            return false;
    }
    return n == 0;
}
