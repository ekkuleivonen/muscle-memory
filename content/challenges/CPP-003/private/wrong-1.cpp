/* Mistake: counts cannot check nesting. */
#include <string>
bool balanced(const std::string &t) {
    int a = 0, b = 0, c = 0;
    for (char x : t) {
        if (x == '(')
            a++;
        if (x == ')')
            a--;
        if (x == '[')
            b++;
        if (x == ']')
            b--;
        if (x == '{')
            c++;
        if (x == '}')
            c--;
    }
    return !a && !b && !c;
}
