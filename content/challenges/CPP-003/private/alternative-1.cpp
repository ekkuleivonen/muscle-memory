#include <string>
bool balanced(const std::string &text) {
    std::string s;
    for (char c : text)
        if (std::string("()[]{}").find(c) != std::string::npos)
            s += c;
    bool changed = true;
    while (changed) {
        changed = false;
        for (const std::string pair : {"()", "[]", "{}"}) {
            auto p = s.find(pair);
            if (p != std::string::npos) {
                s.erase(p, 2);
                changed = true;
            }
        }
    }
    return s.empty();
}
